import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Guards the resolved dependency tree against silent regression.
 *
 * Every version assertion here is a *floor tied to a published advisory*, not a
 * convenience. Each floor and the boundary versions it must reject live in the
 * same table, so lowering a floor cannot leave a stale negative test passing.
 *
 * Two properties matter more than the individual assertions:
 *
 * - Parsing is structural, never substring-based. A substring check passes on
 *   text that is commented out, scoped to a different package, or sitting in an
 *   unrelated section, which would report a control that is not in force.
 * - Anything this file cannot parse is a failure, not a skip. A guard that
 *   silently ignores a key it does not understand is exactly how an unsafe
 *   version slips through, so unrecognised input fails closed.
 */

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");

function lines(text: string): string[] {
  return text.split(/\r?\n/u);
}

/** How many times `key:` appears as a top-level mapping key. */
function topLevelKeyCount(yaml: string, key: string): number {
  return lines(yaml).filter((line) => line === `${key}:` || line.startsWith(`${key}: `)).length;
}

/**
 * Direct children of a top-level `key:` block: lines indented exactly two
 * spaces, with blanks and comments dropped.
 *
 * Deliberately *direct* children only. Accepting descendants would let an
 * entire override list be nested under an inert intermediate key and still be
 * read as though it were active; `nestedDepth` below turns that shape into a
 * failure instead.
 */
function directChildren(yaml: string, key: string): string[] {
  const all = lines(yaml);
  const start = all.indexOf(`${key}:`);
  if (start === -1) return [];
  const body: string[] = [];
  for (let at = start + 1; at < all.length; at += 1) {
    const line = all[at]!;
    // Blanks and comments are checked *before* indentation: YAML does not care
    // how a comment is indented and keeps the mapping open across it, so a
    // comment at column 0 must not be mistaken for the end of the block. Reading
    // it as a terminator would silently truncate the scan, and every key after
    // it would go unexamined — a false-clean rather than a failure.
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith("  ")) break;
    if (line.startsWith("   ")) continue;
    body.push(line);
  }
  return body;
}

/** Lines inside a top-level block that are indented deeper than a direct child. */
function nestedDepth(yaml: string, key: string): string[] {
  const all = lines(yaml);
  const start = all.indexOf(`${key}:`);
  if (start === -1) return [];
  const deeper: string[] = [];
  for (let at = start + 1; at < all.length; at += 1) {
    const line = all[at]!;
    // Same ordering as directChildren: a comment never ends the block.
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith("  ")) break;
    if (line.startsWith("   ")) deeper.push(line);
  }
  return deeper;
}

/** Value of a top-level `key: value` scalar, ignoring commented-out copies. */
function topLevelScalar(yaml: string, key: string): string | null {
  for (const line of lines(yaml)) {
    if (!line.startsWith(`${key}:`)) continue;
    return line.slice(key.length + 1).trim();
  }
  return null;
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
  return quoted ? value.slice(1, -1) : value;
}

/**
 * Splits `  <key>: <value>` or `  <key>:` into its key, whatever the value is.
 *
 * Handles the value forms pnpm and hand-edits produce — `: {}`, `: &anchor {}`,
 * `: 1.2.3` — because a key whose value shape is unfamiliar must still be seen.
 */
function keyOf(line: string): string | null {
  const body = line.slice(2);
  if (body.endsWith(":")) return unquote(body.slice(0, -1));
  const split = body.indexOf(": ");
  if (split === -1) return null;
  return unquote(body.slice(0, split));
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/**
 * A legal npm package name, optionally scoped.
 *
 * Validated rather than assumed, because YAML lets a key carry node properties:
 * `  &anchor extract-zip@6.0.0: {}` decodes to the key `extract-zip@6.0.0`, but
 * read as raw text the name appears to be `&anchor extract-zip`. That would make
 * a reintroduced package invisible to both the exact-name and the scoped-tail
 * checks while still parsing "successfully". Any name that is not a plain npm
 * name — anchors, aliases, tags, whitespace — is therefore refused here, which
 * routes it into `unparsed` and fails closed.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

/**
 * Parses a `packages:`/`snapshots:` key into its name and version.
 *
 * The name is everything before the last `@`, keeping a scoped package scoped:
 * `@evil/form-data@9.9.9` is never read as `form-data`. The version keeps any
 * prerelease and build suffix, so `4.0.6-rc.0` is not taken for the released
 * `4.0.6` it sorts below.
 *
 * Hand-parsed rather than built from a constructed pattern: this repository
 * removed dynamic `RegExp` construction as a security remediation, and a guard
 * test is the last place that should reintroduce it.
 */
function parsePackageKey(line: string): { name: string; version: string } | null {
  if (!line.startsWith("  ") || line.startsWith("   ")) return null;
  const key = keyOf(line);
  if (key === null) return null;
  // Drop any peer-context suffix, e.g. `sharp@0.35.3(@types/node@22.19.17)`.
  const paren = key.indexOf("(");
  const core = paren === -1 ? key : key.slice(0, paren);
  const at = core.lastIndexOf("@");
  if (at <= 0) return null;
  const name = core.slice(0, at);
  const version = core.slice(at + 1);
  if (!PACKAGE_NAME.test(name)) return null;
  if (!SEMVER.test(version)) return null;
  return { name, version };
}

const PACKAGE_SECTIONS = ["packages", "snapshots"] as const;

/** Resolved versions, plus any key that could not be parsed so it can fail closed. */
const { resolved, unparsed } = ((): { resolved: Map<string, Set<string>>; unparsed: string[] } => {
  const map = new Map<string, Set<string>>();
  const bad: string[] = [];
  for (const section of PACKAGE_SECTIONS) {
    for (const line of directChildren(lockfile, section)) {
      const parsed = parsePackageKey(line);
      if (!parsed) {
        bad.push(line.trim());
        continue;
      }
      const versions = map.get(parsed.name) ?? new Set<string>();
      versions.add(parsed.version);
      map.set(parsed.name, versions);
    }
  }
  return { resolved: map, unparsed: bad };
})();

/** Versions resolved for exactly this package name. Scoped lookalikes never match. */
function resolvedVersions(name: string): string[] {
  return [...(resolved.get(name) ?? [])];
}

/** Every package name in the tree whose unscoped tail is `name`, scoped or not. */
function namesEndingIn(name: string): string[] {
  return [...resolved.keys()].filter((key) => key === name || key.endsWith(`/${name}`));
}

function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease: boolean } {
  // Build metadata is not part of precedence and must not reach Number().
  const withoutBuild = version.split("+")[0] ?? "";
  const [core = "", ...rest] = withoutBuild.split("-");
  const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
  return { major, minor, patch, prerelease: rest.length > 0 };
}

/**
 * True when `version` satisfies `>=min <nextMajor` and is a released version.
 *
 * Every prerelease is rejected, not only a prerelease of the floor. `4.0.6-rc.0`
 * sorts below the `4.0.6` that carries the fix, and a later prerelease such as
 * `4.0.7-rc.0` has not been shown to carry it either — a floor exists to require
 * a specific published fix, and only a release proves one shipped.
 */
function atLeastWithinMajor(version: string, min: string): boolean {
  const v = parseVersion(version);
  const m = parseVersion(min);
  if (v.prerelease) return false;
  if (!Number.isInteger(v.major) || !Number.isInteger(v.minor) || !Number.isInteger(v.patch)) return false;
  if (v.major !== m.major) return false;
  if (v.minor !== m.minor) return v.minor > m.minor;
  return v.patch >= m.patch;
}

/**
 * The advisory floor for every remediated package, per major line, with the
 * boundaries each must reject so both derive from one source.
 *
 * Floors are keyed by major because several packages are remediated on more
 * than one line at once — `brace-expansion` resolves at 1.x, 2.x and 5.x
 * simultaneously, and a single floor could only ever vet one of them. A major
 * with no declared floor is a failure rather than a pass: an unlisted line has
 * not been checked against any advisory, and "not checked" must never read as
 * "clean".
 */
const ADVISORY_POLICY: Array<{
  name: string;
  floors: Record<string, string>;
  rejects: string[];
  why: string;
}> = [
  { name: "ip-address", floors: { 10: "10.3.1" }, rejects: ["10.3.0", "10.1.1", "10.3.1-rc.0", "9.9.9"], why: "GHSA-mwp4-54f8-5fhr" },
  { name: "puppeteer", floors: { 25: "25.5.0" }, rejects: ["25.4.9", "24.38.0", "25.5.0-rc.0"], why: "drops @puppeteer/browsers 2.x and extract-zip" },
  { name: "sharp", floors: { 0: "0.35.3" }, rejects: ["0.35.2", "0.34.5", "0.35.3-rc.0", "1.0.0"], why: "GHSA-f88m-g3jw-g9cj" },
  { name: "form-data", floors: { 4: "4.0.6" }, rejects: ["4.0.5", "4.0.6-rc.0", "4.0.7-rc.0+build.1", "3.0.4"], why: "GHSA-hmw2-7cc7-3qxx" },
  { name: "vite", floors: { 6: "6.4.3" }, rejects: ["6.4.2", "6.3.99", "7.0.0", "6.4.3-rc.0"], why: "GHSA-fx2h-pf6j-xcff" },
  { name: "vitest", floors: { 4: "4.1.0" }, rejects: ["4.0.9", "3.9.9", "5.0.0"], why: "pairs with the pinned vite line" },
  { name: "drizzle-orm", floors: { 0: "0.45.2" }, rejects: ["0.45.1", "0.44.9", "1.0.0"], why: "override drizzle-orm@<0.45.2" },
  { name: "esbuild", floors: { 0: "0.28.1" }, rejects: ["0.28.0", "0.27.9", "1.0.0"], why: "override esbuild@<0.28.1" },
  { name: "qs", floors: { 6: "6.15.2" }, rejects: ["6.15.1", "6.11.1", "7.0.0"], why: "override qs@>=6.11.1 <=6.15.1" },
  { name: "postcss", floors: { 8: "8.5.23" }, rejects: ["8.5.22", "8.4.99", "9.0.0"], why: "override postcss@<8.5.23" },
  { name: "ws", floors: { 8: "8.21.0" }, rejects: ["8.20.1", "8.20.9", "7.5.10"], why: "override ws@>=8.0.0 <8.21.0" },
  {
    name: "brace-expansion",
    floors: { 1: "1.1.18", 2: "2.1.4", 5: "5.0.9" },
    // 3.x and 4.x carry no declared floor, so they must be refused outright.
    rejects: ["1.1.17", "2.1.3", "5.0.8", "3.0.0", "4.0.0"],
    why: "overrides on the 1.x, 2.x and 5.x lines",
  },
  { name: "js-yaml", floors: { 4: "4.3.1" }, rejects: ["4.3.0", "4.0.0", "3.14.1"], why: "override js-yaml@>=4.0.0 <4.3.1" },
  { name: "nanoid", floors: { 3: "3.3.18" }, rejects: ["3.3.11", "3.3.17", "4.0.0"], why: "override nanoid@>=3.0.0 <3.3.18" },
];

/**
 * True when `version` is a released version on a major line that has a declared
 * floor, and is at or above that floor.
 */
function satisfiesPolicy(version: string, floors: Record<string, string>): boolean {
  const parsed = parseVersion(version);
  if (parsed.prerelease) return false;
  const floor = floors[String(parsed.major)];
  if (floor === undefined) return false;
  return atLeastWithinMajor(version, floor);
}

/** Packages removed outright; no fixed version is relied on because none is installed. */
const MUST_BE_ABSENT: Array<[string, string]> = [
  ["extract-zip", "GHSA-jmr9-qjv8-65gv, high, no fixed version has ever shipped"],
  ["nodemailer", "GHSA-p6gq-j5cr-w38f and 3 more, removed with imapflow >=1.6.6"],
  ["basic-ftp", "arrived only via the Puppeteer 24 proxy-agent chain"],
];

/** The complete override map. Exact equality, so an addition or removal fails here. */
const EXPECTED_OVERRIDES: Record<string, string> = {
  "drizzle-orm@<0.45.2": "0.45.2",
  "esbuild@<0.28.1": "0.28.1",
  "basic-ftp@<=5.3.1": "5.3.1",
  "qs@>=6.11.1 <=6.15.1": "6.15.2",
  "postcss@<8.5.23": "8.5.23",
  "vite@<=6.4.2": "6.4.3",
  "ws@>=8.0.0 <8.21.0": "8.21.0",
  "brace-expansion@>=5.0.0 <5.0.9": "5.0.9",
  "brace-expansion@<1.1.18": "1.1.18",
  "brace-expansion@>=2.0.0 <2.1.4": "2.1.4",
  "js-yaml@>=4.0.0 <4.3.1": "4.3.1",
  "nanoid@>=3.0.0 <3.3.18": "3.3.18",
  "form-data@>=4.0.0 <4.0.6": "4.0.6",
  "ip-address@<10.3.1": "10.3.1",
  "puppeteer@<25.5.0": "25.5.0",
  "sharp@<0.35.3": "0.35.3",
};

/** The declared override map, parsed structurally from direct children only. */
function declaredOverrides(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of directChildren(workspace, "overrides")) {
    const body = line.trim();
    const split = body.lastIndexOf(": ");
    if (split === -1) {
      map[unquote(body.endsWith(":") ? body.slice(0, -1) : body)] = "";
      continue;
    }
    map[unquote(body.slice(0, split).trim())] = unquote(body.slice(split + 2).trim());
  }
  return map;
}

describe("dependency lock guard", () => {
  test("parses every lockfile key it is shown, and fails closed on any it cannot", () => {
    // The parser is what every other assertion trusts, so it is tested first.
    expect(parsePackageKey("  sharp@0.35.3:")).toEqual({ name: "sharp", version: "0.35.3" });
    expect(parsePackageKey("  ip-address@10.3.1: {}")).toEqual({ name: "ip-address", version: "10.3.1" });
    expect(parsePackageKey("  sharp@0.35.3(@types/node@22.19.17):")).toEqual({ name: "sharp", version: "0.35.3" });
    expect(parsePackageKey("  '@alloc/quick-lru@5.2.0':")).toEqual({ name: "@alloc/quick-lru", version: "5.2.0" });
    expect(parsePackageKey('  "form-data@4.0.5":')).toEqual({ name: "form-data", version: "4.0.5" });
    expect(parsePackageKey("  form-data@4.0.5: &ref {}")).toEqual({ name: "form-data", version: "4.0.5" });
    expect(parsePackageKey("  form-data@4.0.7-rc.0+build.1:")).toEqual({
      name: "form-data",
      version: "4.0.7-rc.0+build.1",
    });
    expect(parsePackageKey("  '@evil/form-data@9.9.9':")).toEqual({ name: "@evil/form-data", version: "9.9.9" });
    expect(parsePackageKey("    nested@1.0.0:")).toBeNull();
    // YAML node properties on the key must not become part of the package name,
    // where they would hide a reintroduced package from every name check.
    expect(parsePackageKey("  &hidden extract-zip@6.0.0: {}")).toBeNull();
    expect(parsePackageKey("  *alias extract-zip@6.0.0: {}")).toBeNull();
    expect(parsePackageKey("  !!str form-data@4.0.5:")).toBeNull();
    expect(parsePackageKey("  EXTRACT-ZIP@6.0.0:")).toBeNull();

    // Nothing in the real lockfile may go unrecognised: an ignored key is how an
    // unsafe version would slip past every assertion below.
    expect(unparsed, "unrecognised package keys must fail, not be skipped").toEqual([]);
    // Sanity: a silently empty map cannot pass the floors below.
    expect(resolved.size).toBeGreaterThan(500);
    expect([...resolved.keys()].filter((key) => key.startsWith("@")).length).toBeGreaterThan(50);
    // The overrides block and importer paths are structurally out of scope.
    expect(resolvedVersions("apps/bot")).toEqual([]);
  });

  test("compares versions with prerelease, build metadata and major boundaries handled", () => {
    expect(atLeastWithinMajor("6.4.3", "6.4.3")).toBe(true);
    expect(atLeastWithinMajor("6.5.0", "6.4.3")).toBe(true);
    expect(atLeastWithinMajor("6.4.4", "6.4.3")).toBe(true);
    expect(atLeastWithinMajor("6.4.3+build.1", "6.4.3")).toBe(true);
    expect(atLeastWithinMajor("6.4.3-rc.0", "6.4.3")).toBe(false);
    expect(atLeastWithinMajor("6.4.4-rc.0", "6.4.3")).toBe(false);
    expect(atLeastWithinMajor("6.4.2", "6.4.3")).toBe(false);
    expect(atLeastWithinMajor("7.0.0", "6.4.3")).toBe(false);
    expect(atLeastWithinMajor("5.9.9", "6.4.3")).toBe(false);
  });

  test.each(ADVISORY_POLICY)("keeps $name on a vetted line ($why)", ({ name, floors, rejects, why }) => {
    const found = resolvedVersions(name);
    expect(found.length, `${name} must be present (${why})`).toBeGreaterThan(0);
    for (const version of found) {
      expect(satisfiesPolicy(version, floors), `${name}@${version} violates its policy (${why})`).toBe(true);
    }
    // Derived from the same row: each declared floor must accept itself, and
    // every listed boundary must be refused, so lowering or deleting a floor
    // cannot leave this test green.
    for (const floor of Object.values(floors)) {
      expect(satisfiesPolicy(floor, floors), `floor ${floor} must satisfy its own policy`).toBe(true);
    }
    for (const rejected of rejects) {
      expect(satisfiesPolicy(rejected, floors), `${name}@${rejected} must be rejected`).toBe(false);
    }
  });

  test("declares a policy for every package an override remediates", () => {
    // Coverage is structural, not a hand-kept list: adding an override without a
    // resolved-version policy fails here, so the guard cannot silently remediate
    // a package it never checks.
    const policed = new Set(ADVISORY_POLICY.map(({ name }) => name));
    const absent = new Set(MUST_BE_ABSENT.map(([name]) => name));
    for (const selector of Object.keys(EXPECTED_OVERRIDES)) {
      const name = selector.slice(0, selector.lastIndexOf("@"));
      expect(
        policed.has(name) || absent.has(name),
        `override ${selector} has no resolved-version policy and is not required absent`,
      ).toBe(true);
    }
  });

  test("checks every resolved Vite context, not just the first", () => {
    const contexts = [...lockfile.matchAll(/@vitest\/mocker@4\.1\.0\(vite@(\d+\.\d+\.\d+[^)(]*)/gu)];
    expect(contexts.length, "vitest mocker must resolve against a pinned vite").toBeGreaterThan(0);
    for (const context of contexts) {
      expect(atLeastWithinMajor(context[1]!, "6.4.3"), `mocker vite context ${context[1]} must be >=6.4.3 <7`).toBe(true);
    }
    // And independently: every vite the lockfile resolves at all, not only the
    // ones reachable through vitest.
    const vites = resolvedVersions("vite");
    expect(vites.length).toBeGreaterThan(0);
    for (const version of vites) {
      expect(atLeastWithinMajor(version, "6.4.3"), `vite@${version} must be >=6.4.3 <7`).toBe(true);
    }
    for (const version of resolvedVersions("vitest")) {
      expect(atLeastWithinMajor(version, "4.1.0"), `vitest@${version} must be >=4.1.0 <5`).toBe(true);
    }
  });

  test.each(MUST_BE_ABSENT)("keeps %s out of the tree entirely (%s)", (name) => {
    // Absence is strictly stronger than a floor; reintroduction brings back an advisory.
    expect(resolvedVersions(name), `${name} must not return`).toEqual([]);
    // Also reject a scoped lookalike standing in for the removed package.
    expect(namesEndingIn(name), `no scoped variant of ${name} may appear`).toEqual([]);
  });
});

describe("override configuration authority", () => {
  test("overrides live in pnpm-workspace.yaml only, never also in package.json", () => {
    const rootPkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      pnpm?: { overrides?: Record<string, string> };
    };
    // Two override lists silently diverged once: package.json won, edits to
    // pnpm-workspace.yaml were inert, and an `ip-address: 10.1.1` pin held a
    // vulnerable version in place unnoticed. One authority, permanently.
    expect(rootPkg.pnpm?.overrides, "pnpm.overrides must not reappear in package.json").toBeUndefined();
  });

  test("declares exactly the expected override map, parsed structurally", () => {
    // Exact map equality over direct children only. A commented-out override, a
    // scoped-lookalike selector, an extra entry or a removed entry all change
    // this object, where a substring check would still have passed.
    expect(declaredOverrides()).toEqual(EXPECTED_OVERRIDES);
    // A nested mapping inside `overrides:` would make the real shape differ from
    // the flat map above, so any deeper indentation is itself a failure.
    expect(nestedDepth(workspace, "overrides"), "overrides must stay a flat mapping").toEqual([]);
  });

  test("rejects duplicate top-level keys that would shadow the guarded ones", () => {
    // Only the first occurrence is parsed above, so a second one could quietly win.
    for (const key of ["overrides", "blockExoticSubdeps", "minimumReleaseAge", "trustPolicy"]) {
      expect(topLevelKeyCount(workspace, key), `${key} must be declared exactly once`).toBe(1);
    }
    for (const key of [...PACKAGE_SECTIONS, "overrides"]) {
      expect(topLevelKeyCount(lockfile, key), `${key} must appear once in the lockfile`).toBe(1);
    }
  });

  test("keeps the supply-chain install controls switched on", () => {
    // Read as top-level scalars so a commented-out copy cannot satisfy them.
    expect(topLevelScalar(workspace, "blockExoticSubdeps")).toBe("true");
    expect(topLevelScalar(workspace, "minimumReleaseAge")).toBe("10080");
    expect(topLevelScalar(workspace, "trustPolicy")).toBe("no-downgrade");
  });

  test("declares a Node floor that satisfies the resolved Puppeteer", () => {
    // Puppeteer 25 requires >=22.12.0; a lower engines floor would let a Node
    // version install that Puppeteer refuses to run on.
    const rootPkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string } };
    expect(rootPkg.engines?.node).toBe(">=22.12.0");
  });
});

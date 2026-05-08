import { config as dotenvConfig } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;

function isAbsoluteLike(path: string): boolean {
  return isAbsolute(path) || WINDOWS_ABSOLUTE_RE.test(path);
}

function isSubPath(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  const relativePath = relative(normalizedRoot, normalizedCandidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsoluteLike(relativePath));
}

function joinRoot(root: string, name: string): string {
  if (isAbsoluteLike(name)) {
    throw new Error("Secret file names must be relative to NITSYCLAW_SECRET_ROOT.");
  }
  if (WINDOWS_ABSOLUTE_RE.test(root) && !isAbsolute(root)) {
    const joined = `${root.replace(/[\\/]+$/, "")}/${name}`;
    if (name.split(/[\\/]+/).includes("..")) {
      throw new Error("Secret file names must stay inside NITSYCLAW_SECRET_ROOT.");
    }
    return joined;
  }
  const joined = resolve(root, name);
  if (!isSubPath(root, joined)) {
    throw new Error("Secret file names must stay inside NITSYCLAW_SECRET_ROOT.");
  }
  return joined;
}

export function repoRoot(): string {
  return resolve(process.cwd(), "../..");
}

export function secretRoot(): string {
  return process.env.NITSYCLAW_SECRET_ROOT || resolve(homedir(), ".nitsyclaw", "secrets");
}

export function ensureSecretRoot(): string {
  const root = secretRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export function secretPath(name: string): string {
  return joinRoot(secretRoot(), name);
}

export function writableSecretPath(name: string): string {
  return joinRoot(ensureSecretRoot(), name);
}

export function legacyRepoSecretPath(name: string): string {
  return resolve(repoRoot(), name);
}

export function firstExistingSecretPath(name: string): string | null {
  const externalPath = secretPath(name);
  if (existsSync(externalPath)) return externalPath;

  const legacyPath = legacyRepoSecretPath(name);
  if (existsSync(legacyPath)) return legacyPath;

  return null;
}

export function loadBotDotenv(): void {
  dotenvConfig({ path: secretPath(".env.local") });
  dotenvConfig({ path: legacyRepoSecretPath(".env.local") });
}

export function whatsappSessionDir(input?: string): string {
  if (!input || input === ".wa-session") return secretPath(".wa-session");
  if (isAbsoluteLike(input)) {
    if (process.env.NITSYCLAW_ALLOW_ABSOLUTE_SECRET_PATHS === "1") return input;
    throw new Error("WHATSAPP_SESSION_DIR must be relative unless NITSYCLAW_ALLOW_ABSOLUTE_SECRET_PATHS=1.");
  }
  return joinRoot(secretRoot(), input);
}

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

function hasCommand(command: string): boolean {
  try {
    if (process.platform === "win32") {
      execFileSync("where.exe", [command]);
    } else {
      execFileSync("sh", ["-c", `command -v ${command}`]);
    }
    return true;
  } catch {
    return false;
  }
}

describe("Railway Docker runtime", () => {
  test("entrypoint fixes mounted secret root permissions before dropping to node", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const entrypoint = readFileSync("scripts/docker-entrypoint.sh", "utf8");

    expect(dockerfile).toContain("gosu");
    expect(dockerfile).toContain("ENTRYPOINT");
    expect(dockerfile).toContain("nitsyclaw-entrypoint.sh");
    expect(dockerfile).toContain("USER root");
    expect(dockerfile).not.toContain("USER node\n\n# Start command");

    if (hasCommand("sh")) {
      execFileSync("sh", ["-n", "scripts/docker-entrypoint.sh"]);
    }

    expect(entrypoint).toContain("NITSYCLAW_SECRET_ROOT");
    expect(entrypoint).toContain("WHATSAPP_SESSION_DIR");
    expect(entrypoint).toContain("Refusing unsafe NITSYCLAW_SECRET_ROOT");
    expect(entrypoint).toContain("WHATSAPP_SESSION_DIR must be relative in Railway runtime.");
    expect(entrypoint).toContain('mkdir -p "$secret_root"');
    expect(entrypoint).toContain('mkdir -p "$secret_root" "$session_root"');
    expect(entrypoint).toContain('chown node:node "$secret_root" "$session_root"');
    expect(entrypoint).not.toContain("chown -R");
    expect(entrypoint).toContain('exec gosu node "$@"');
  });
});

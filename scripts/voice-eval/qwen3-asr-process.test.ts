import { describe, expect, it } from "vitest";
import { parseSingleJsonObject, runBoundedJsonProcess } from "./qwen3-asr-process.js";

describe("Qwen3-ASR bounded process", () => {
  it("accepts exactly one complete JSON object", () => {
    expect(parseSingleJsonObject('{"status":"ok"}\n')).toEqual({ status: "ok" });
  });

  it.each(["", "{\"status\":", "[]", "{}\n{}"])("rejects empty, partial, or multiple output: %j", (output) => {
    expect(() => parseSingleJsonObject(output)).toThrow(/JSON|object/u);
  });

  it("forces the child environment offline", async () => {
    const result = await runBoundedJsonProcess({
      executable: process.execPath,
      args: ["-e", "console.log(JSON.stringify({offline:process.env.HF_HUB_OFFLINE,proxy:process.env.HTTPS_PROXY,telemetry:process.env.HF_HUB_DISABLE_TELEMETRY}))"],
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.payload).toEqual({ offline: "1", proxy: "http://127.0.0.1:9", telemetry: "1" });
  });

  it("returns a complete error payload from a nonzero child", async () => {
    const result = await runBoundedJsonProcess({
      executable: process.execPath,
      args: ["-e", "console.log(JSON.stringify({status:'error',error:{kind:'oom'}}));process.exitCode=2"],
      timeoutMs: 5_000,
    });
    expect(result.exitCode).toBe(2);
    expect(result.payload).toMatchObject({ status: "error", error: { kind: "oom" } });
  });

  it("terminates after the bounded deadline", async () => {
    await expect(runBoundedJsonProcess({
      executable: process.execPath,
      args: ["-e", "setTimeout(()=>console.log('{}'),10_000)"],
      timeoutMs: 30,
    })).rejects.toThrow("bounded deadline");
  });

  it("terminates when cancelled", async () => {
    const controller = new AbortController();
    const pending = runBoundedJsonProcess({
      executable: process.execPath,
      args: ["-e", "setTimeout(()=>console.log('{}'),10_000)"],
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("terminates output flooding", async () => {
    await expect(runBoundedJsonProcess({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(4096))"],
      timeoutMs: 5_000,
      outputLimitBytes: 128,
    })).rejects.toThrow("output limit");
  });
});

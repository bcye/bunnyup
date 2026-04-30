import { test, expect, describe } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { detectPackageManager } from "../src/commands/setup-ci.ts";

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "bunny-pm-"));
  try {
    await fn(tmp);
  } finally {
    await rm(tmp, { recursive: true });
  }
}

describe("detectPackageManager", () => {
  test("returns null when no lockfile is present", async () => {
    await withTmp(async (dir) => {
      expect(await detectPackageManager(dir)).toBeNull();
    });
  });

  test.each([
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const)("detects %s → %s", async (lockfile, expected) => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, lockfile), "");
      expect(await detectPackageManager(dir)).toBe(expected);
    });
  });
});

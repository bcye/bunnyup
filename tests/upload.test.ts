import { test, expect, describe } from "bun:test";
import { newestMtime } from "../src/commands/upload.ts";
import { join } from "path";
import { mkdtemp, mkdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("newestMtime", () => {
  test("returns the largest mtime across the given files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bunnyup-mtime-"));
    try {
      await Bun.write(join(dir, "a.txt"), "a");
      await mkdir(join(dir, "sub"), { recursive: true });
      await Bun.write(join(dir, "sub/b.txt"), "b");
      await Bun.write(join(dir, "c.txt"), "c");

      const oldT = new Date("2020-01-01T00:00:00Z");
      const midT = new Date("2022-06-01T00:00:00Z");
      const newT = new Date("2024-09-15T12:34:56Z");
      await utimes(join(dir, "a.txt"), oldT, oldT);
      await utimes(join(dir, "sub/b.txt"), newT, newT);
      await utimes(join(dir, "c.txt"), midT, midT);

      const result = newestMtime(dir, ["a.txt", "sub/b.txt", "c.txt"]);
      expect(result).toBe(newT.getTime());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns 0 for an empty file list", () => {
    expect(newestMtime("/anywhere", [])).toBe(0);
  });
});

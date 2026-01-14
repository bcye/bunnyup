import { test, expect, describe } from "bun:test";
import { parsePruneDuration, getDefaultProjectName, readConfig, writeConfig } from "../src/config.ts";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("parsePruneDuration", () => {
  test("parses days", () => {
    expect(parsePruneDuration("30d")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parsePruneDuration("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parsePruneDuration("1d")).toBe(24 * 60 * 60 * 1000);
  });

  test("parses weeks", () => {
    expect(parsePruneDuration("2w")).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    expect(parsePruneDuration("1w")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("parses hours", () => {
    expect(parsePruneDuration("24h")).toBe(24 * 60 * 60 * 1000);
    expect(parsePruneDuration("1h")).toBe(60 * 60 * 1000);
  });

  test("parses months", () => {
    expect(parsePruneDuration("1m")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parsePruneDuration("2m")).toBe(2 * 30 * 24 * 60 * 60 * 1000);
  });

  test("throws on invalid format", () => {
    expect(() => parsePruneDuration("30")).toThrow();
    expect(() => parsePruneDuration("d30")).toThrow();
    expect(() => parsePruneDuration("30x")).toThrow();
    expect(() => parsePruneDuration("")).toThrow();
  });
});

describe("getDefaultProjectName", () => {
  test("returns folder name when no package.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      const name = await getDefaultProjectName(tmpDir);
      expect(name).toMatch(/^bunny-test-/);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("returns package.json name when present", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      await Bun.write(join(tmpDir, "package.json"), JSON.stringify({ name: "my-app" }));
      const name = await getDefaultProjectName(tmpDir);
      expect(name).toBe("my-app");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("strips scope from package name", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      await Bun.write(join(tmpDir, "package.json"), JSON.stringify({ name: "@scope/my-app" }));
      const name = await getDefaultProjectName(tmpDir);
      expect(name).toBe("my-app");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("sanitizes invalid characters", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      await Bun.write(join(tmpDir, "package.json"), JSON.stringify({ name: "my_app.name" }));
      const name = await getDefaultProjectName(tmpDir);
      expect(name).toBe("my-app-name");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("config read/write", () => {
  test("reads and writes config", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      const config = {
        name: "test-site",
        outputFolder: "dist",
        pruneAfter: "30d",
        pullZoneId: 12345,
      };

      await writeConfig(config, tmpDir);

      const read = await readConfig(tmpDir);
      expect(read).toEqual(config);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  test("returns null when no config exists", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "bunny-test-"));
    try {
      const read = await readConfig(tmpDir);
      expect(read).toBeNull();
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

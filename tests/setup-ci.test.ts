import { test, expect, describe } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  buildWorkflow,
  detectPackageManager,
  type PackageManager,
} from "../src/commands/setup-ci.ts";

describe("buildWorkflow", () => {
  const ALL_PMS: PackageManager[] = ["bun", "pnpm", "yarn", "npm"];

  test("uses the requested branch in the push trigger", () => {
    const yaml = buildWorkflow({
      packageManager: "bun",
      buildCommand: "bun run build",
      branch: "production",
    });
    expect(yaml).toContain("branches: [production]");
  });

  test("inlines the requested build command", () => {
    const yaml = buildWorkflow({
      packageManager: "bun",
      buildCommand: "bun run custom:build",
      branch: "main",
    });
    expect(yaml).toContain("- run: bun run custom:build");
  });

  test("references the BUNNY_API_KEY repository secret", () => {
    const yaml = buildWorkflow({
      packageManager: "bun",
      buildCommand: "bun run build",
      branch: "main",
    });
    expect(yaml).toContain("BUNNY_API_KEY: ${{ secrets.BUNNY_API_KEY }}");
  });

  test("always invokes bunnyup deploy via bunx", () => {
    for (const pm of ALL_PMS) {
      const yaml = buildWorkflow({
        packageManager: pm,
        buildCommand: "echo build",
        branch: "main",
      });
      expect(yaml).toContain("- run: bunx bunnyup deploy");
    }
  });

  test("bun: setup-bun appears exactly once (no duplicate before deploy)", () => {
    const yaml = buildWorkflow({
      packageManager: "bun",
      buildCommand: "bun run build",
      branch: "main",
    });
    const matches = yaml.match(/oven-sh\/setup-bun/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test("non-bun PMs add setup-bun before the deploy step", () => {
    for (const pm of ["pnpm", "yarn", "npm"] as PackageManager[]) {
      const yaml = buildWorkflow({
        packageManager: pm,
        buildCommand: "echo build",
        branch: "main",
      });
      expect(yaml).toContain("oven-sh/setup-bun@v2");
      // The setup-bun step must come before the bunx deploy step.
      const setupBunIdx = yaml.indexOf("oven-sh/setup-bun@v2");
      const deployIdx = yaml.indexOf("bunx bunnyup deploy");
      expect(setupBunIdx).toBeLessThan(deployIdx);
    }
  });

  test("pnpm includes pnpm/action-setup and node cache=pnpm", () => {
    const yaml = buildWorkflow({
      packageManager: "pnpm",
      buildCommand: "pnpm run build",
      branch: "main",
    });
    expect(yaml).toContain("pnpm/action-setup@v4");
    expect(yaml).toContain("cache: pnpm");
    expect(yaml).toContain("- run: pnpm install --frozen-lockfile");
  });

  test("yarn uses node cache=yarn and a frozen install", () => {
    const yaml = buildWorkflow({
      packageManager: "yarn",
      buildCommand: "yarn build",
      branch: "main",
    });
    expect(yaml).toContain("cache: yarn");
    expect(yaml).toContain("- run: yarn install --frozen-lockfile");
  });

  test("npm uses node cache=npm and `npm ci`", () => {
    const yaml = buildWorkflow({
      packageManager: "npm",
      buildCommand: "npm run build",
      branch: "main",
    });
    expect(yaml).toContain("cache: npm");
    expect(yaml).toContain("- run: npm ci");
  });

  test("bun uses bun install --frozen-lockfile", () => {
    const yaml = buildWorkflow({
      packageManager: "bun",
      buildCommand: "bun run build",
      branch: "main",
    });
    expect(yaml).toContain("- run: bun install --frozen-lockfile");
  });
});

describe("detectPackageManager", () => {
  async function withTmp(
    fn: (dir: string) => Promise<void>,
  ): Promise<void> {
    const tmp = await mkdtemp(join(tmpdir(), "bunny-pm-"));
    try {
      await fn(tmp);
    } finally {
      await rm(tmp, { recursive: true });
    }
  }

  test("returns null when no lockfile is present", async () => {
    await withTmp(async (dir) => {
      expect(await detectPackageManager(dir)).toBeNull();
    });
  });

  test("detects bun from bun.lock", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "bun.lock"), "");
      expect(await detectPackageManager(dir)).toBe("bun");
    });
  });

  test("detects bun from bun.lockb", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "bun.lockb"), "");
      expect(await detectPackageManager(dir)).toBe("bun");
    });
  });

  test("detects pnpm from pnpm-lock.yaml", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "pnpm-lock.yaml"), "");
      expect(await detectPackageManager(dir)).toBe("pnpm");
    });
  });

  test("detects yarn from yarn.lock", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "yarn.lock"), "");
      expect(await detectPackageManager(dir)).toBe("yarn");
    });
  });

  test("detects npm from package-lock.json", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "package-lock.json"), "{}");
      expect(await detectPackageManager(dir)).toBe("npm");
    });
  });

  test("prefers bun when multiple lockfiles exist", async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, "bun.lock"), "");
      await Bun.write(join(dir, "package-lock.json"), "{}");
      expect(await detectPackageManager(dir)).toBe("bun");
    });
  });
});

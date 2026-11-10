import { test, expect, describe } from "bun:test";
import { isDeploymentStorageZone, validateProjectName } from "../src/naming.ts";
import { filterDeploymentStorageZones } from "../src/zones.ts";
import type { StorageZone } from "../src/api.ts";

describe("isDeploymentStorageZone", () => {
  test("matches the project's commit deployments", () => {
    expect(isDeploymentStorageZone("blog", "blog-abc1234")).toBe(true);
    expect(isDeploymentStorageZone("blog", "blog-abc1234def")).toBe(true);
    expect(isDeploymentStorageZone("blog", "BLOG-ABC1234")).toBe(true);
  });

  test("matches the initial storage zone created by bn new", () => {
    expect(isDeploymentStorageZone("blog", "blog-initial")).toBe(true);
  });

  test("does not match zones of a project whose name extends this one", () => {
    expect(isDeploymentStorageZone("blog", "blog-old-abc1234")).toBe(false);
    expect(isDeploymentStorageZone("blog", "blog-old-initial")).toBe(false);
  });

  test("does not match unrelated or malformed names", () => {
    expect(isDeploymentStorageZone("blog", "blog")).toBe(false);
    expect(isDeploymentStorageZone("blog", "blog-")).toBe(false);
    expect(isDeploymentStorageZone("blog", "blog-abc")).toBe(false); // too short for a hash
    expect(isDeploymentStorageZone("blog", "blog-zzzzzzz")).toBe(false); // not hex
    expect(isDeploymentStorageZone("blog", "myblog-abc1234")).toBe(false);
  });

  test("treats regex characters in the project name literally", () => {
    expect(isDeploymentStorageZone("a.c", "abc-abc1234")).toBe(false);
  });
});

describe("filterDeploymentStorageZones", () => {
  test("keeps only the project's deployments", () => {
    const zone = (Id: number, Name: string): StorageZone => ({
      Id,
      Name,
      Password: "",
      DateModified: "",
      Region: "DE",
    });
    const zones = [
      zone(1, "blog-abc1234"),
      zone(2, "blog-old-abc1234"),
      zone(3, "blog-initial"),
      zone(4, "other-abc1234"),
    ];
    expect(filterDeploymentStorageZones("blog", zones).map((z) => z.Id)).toEqual(
      [1, 3],
    );
  });
});

describe("validateProjectName", () => {
  test("accepts valid names", () => {
    expect(validateProjectName("my-site")).toBeUndefined();
    expect(validateProjectName("Site123")).toBeUndefined();
  });

  test("rejects invalid characters", () => {
    expect(validateProjectName("my_site")).toBeString();
    expect(validateProjectName("my.site")).toBeString();
  });

  test("rejects names that are too short or too long", () => {
    expect(validateProjectName("ab")).toBeString();
    expect(validateProjectName("a".repeat(61))).toBeString();
  });
});

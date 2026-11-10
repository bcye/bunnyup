import { test, expect, describe } from "bun:test";
import {
  isDeploymentStorageZone,
  parsePreviewPullZoneName,
  previewPullZoneName,
  validatePreviewName,
  validateProjectName,
  validateProjectNameForPreviews,
} from "../src/naming.ts";
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
    expect(
      filterDeploymentStorageZones("blog", zones).map((z) => z.Id),
    ).toEqual([1, 3]);
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

  test("rejects the reserved preview separator as a word", () => {
    expect(validateProjectName("blog-pre-launch")).toBeString();
    expect(validateProjectName("blog-pre")).toBeString();
    expect(validateProjectName("pre-blog")).toBeString();
    expect(validateProjectName("Blog-PRE")).toBeString();
  });

  test("allows the separator inside a longer word", () => {
    expect(validateProjectName("preview-site")).toBeUndefined();
    expect(validateProjectName("blog-prefix")).toBeUndefined();
    expect(validateProjectName("presto")).toBeUndefined();
  });
});

describe("validateProjectNameForPreviews", () => {
  test("rejects legacy project names containing the reserved word", () => {
    expect(validateProjectNameForPreviews("blog-pre")).toBeString();
    expect(validateProjectNameForPreviews("blog")).toBeUndefined();
  });
});

describe("validatePreviewName", () => {
  test("accepts typical preview names", () => {
    expect(validatePreviewName("pr-42")).toBeUndefined();
    expect(validatePreviewName("feature-login")).toBeUndefined();
    expect(validatePreviewName("staging")).toBeUndefined();
  });

  test("rejects uppercase, other characters and stray hyphens", () => {
    expect(validatePreviewName("PR-42")).toBeString();
    expect(validatePreviewName("feature/login")).toBeString();
    expect(validatePreviewName("-pr")).toBeString();
    expect(validatePreviewName("pr-")).toBeString();
    expect(validatePreviewName("pr--42")).toBeString();
    expect(validatePreviewName("")).toBeString();
  });

  test("rejects the reserved separator as a word", () => {
    expect(validatePreviewName("pre")).toBeString();
    expect(validatePreviewName("pre-launch")).toBeString();
    expect(validatePreviewName("x-pre-y")).toBeString();
    expect(validatePreviewName("prerelease")).toBeUndefined();
  });

  test("rejects names whose pull zone name would exceed a DNS label", () => {
    const project = "a".repeat(50);
    // `${project}-pre-` is 55 characters, leaving 8 for the preview name
    expect(validatePreviewName("b".repeat(8), project)).toBeUndefined();
    expect(validatePreviewName("b".repeat(9), project)).toBeString();
  });
});

describe("previewPullZoneName / parsePreviewPullZoneName", () => {
  test("round-trips", () => {
    const name = previewPullZoneName("blog", "pr-42");
    expect(name).toBe("blog-pre-pr-42");
    expect(parsePreviewPullZoneName("blog", name)).toBe("pr-42");
  });

  test("is case-insensitive on the zone name", () => {
    expect(parsePreviewPullZoneName("Blog", "blog-pre-pr-42")).toBe("pr-42");
    expect(parsePreviewPullZoneName("blog", "BLOG-PRE-PR-42")).toBe("pr-42");
  });

  test("returns null for the production pull zone and unrelated zones", () => {
    expect(parsePreviewPullZoneName("blog", "blog")).toBeNull();
    expect(parsePreviewPullZoneName("blog", "blog-pre-")).toBeNull();
    expect(parsePreviewPullZoneName("blog", "other-pre-pr-1")).toBeNull();
    expect(parsePreviewPullZoneName("blog", "myblog-pre-pr-1")).toBeNull();
  });

  test("does not claim preview zones of projects whose name extends this one", () => {
    // Previews of a project named "blog-prefix"
    expect(parsePreviewPullZoneName("blog", "blog-prefix-pre-pr-1")).toBeNull();
    // Previews of a legacy project named "blog-pre"
    expect(parsePreviewPullZoneName("blog", "blog-pre-pre-pr-1")).toBeNull();
  });
});

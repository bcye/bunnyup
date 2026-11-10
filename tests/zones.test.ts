import { test, expect, describe } from "bun:test";
import type { PullZone, StorageZone } from "../src/api.ts";
import {
  filterPreviewPullZones,
  planPrune,
  type PreviewPullZone,
} from "../src/zones.ts";

function storageZone(
  Id: number,
  Name: string,
  DateModified: string,
): StorageZone {
  return { Id, Name, Password: "", DateModified, Region: "DE" };
}

function pullZone(Id: number, Name: string, StorageZoneId: number): PullZone {
  return { Id, Name, StorageZoneId, Hostnames: [] } as unknown as PullZone;
}

describe("filterPreviewPullZones", () => {
  test("returns the project's previews with their names", () => {
    const zones = [
      pullZone(1, "blog", 10),
      pullZone(2, "blog-pre-pr-1", 11),
      pullZone(3, "blog-pre-staging", 12),
      pullZone(4, "other-pre-pr-1", 13),
      pullZone(5, "blog-old-pre-pr-1", 14),
    ];
    const previews = filterPreviewPullZones("blog", 1, zones);
    expect(previews.map((p) => [p.preview, p.pullZone.Id])).toEqual([
      ["pr-1", 2],
      ["staging", 3],
    ]);
  });

  test("never returns the production pull zone", () => {
    const zones = [pullZone(1, "blog-pre-pr-1", 10)];
    expect(filterPreviewPullZones("blog", 1, zones)).toEqual([]);
  });
});

describe("planPrune", () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");
  const old = "2026-09-01T00:00:00Z";
  const recent = "2026-11-01T00:00:00Z";

  const oldProd = storageZone(10, "blog-aaaaaaa", old);
  const oldUnused = storageZone(11, "blog-bbbbbbb", old);
  const oldPreview = storageZone(12, "blog-ccccccc", old);
  const recentPreview = storageZone(13, "blog-ddddddd", recent);
  const deployments = [oldProd, oldUnused, oldPreview, recentPreview];
  const unrelated = storageZone(99, "other-eeeeeee", old);
  const allStorageZones = [...deployments, unrelated];

  const preview = (
    Id: number,
    name: string,
    storageZoneId: number,
  ): PreviewPullZone => ({
    preview: name,
    pullZone: pullZone(Id, `blog-pre-${name}`, storageZoneId),
  });

  test("expires old deployments but keeps production's", () => {
    const plan = planPrune({
      allStorageZones,
      deploymentStorageZones: deployments,
      previewPullZones: [],
      productionStorageZoneId: oldProd.Id,
      cutoff,
    });
    expect(plan.storageZones.map((z) => z.Id)).toEqual([11, 12]);
    expect(plan.previewPullZones).toEqual([]);
  });

  test("cascades to previews pointing at an expired deployment", () => {
    const stale = preview(2, "pr-1", oldPreview.Id);
    const fresh = preview(3, "pr-2", recentPreview.Id);
    const plan = planPrune({
      allStorageZones,
      deploymentStorageZones: deployments,
      previewPullZones: [stale, fresh],
      productionStorageZoneId: oldProd.Id,
      cutoff,
    });
    expect(plan.previewPullZones).toEqual([stale]);
    expect(plan.storageZones.map((z) => z.Id)).toEqual([11, 12]);
  });

  test("keeps a preview that shares production's deployment", () => {
    const sharesProd = preview(2, "pr-1", oldProd.Id);
    const plan = planPrune({
      allStorageZones,
      deploymentStorageZones: deployments,
      previewPullZones: [sharesProd],
      productionStorageZoneId: oldProd.Id,
      cutoff,
    });
    expect(plan.previewPullZones).toEqual([]);
  });

  test("removes previews whose storage zone no longer exists", () => {
    const dangling = preview(2, "pr-1", 12345);
    const plan = planPrune({
      allStorageZones,
      deploymentStorageZones: deployments,
      previewPullZones: [dangling],
      productionStorageZoneId: oldProd.Id,
      cutoff,
    });
    expect(plan.previewPullZones).toEqual([dangling]);
  });

  test("does not touch previews pointing at a storage zone outside the project", () => {
    const elsewhere = preview(2, "pr-1", unrelated.Id);
    const plan = planPrune({
      allStorageZones,
      deploymentStorageZones: deployments,
      previewPullZones: [elsewhere],
      productionStorageZoneId: oldProd.Id,
      cutoff,
    });
    expect(plan.previewPullZones).toEqual([]);
  });
});

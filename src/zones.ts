import {
  addOrUpdateEdgeRule,
  createPullZone,
  listPullZones,
  type PullZone,
  type StorageZone,
} from "./api.ts";
import {
  isDeploymentStorageZone,
  parsePreviewPullZoneName,
  previewPullZoneName,
} from "./naming.ts";

/**
 * Create a pull zone with bunnyup's standard configuration (caching defaults
 * plus the immutable browser-cache rule for hashed framework assets).
 *
 * Used for both the production pull zone and preview pull zones.
 */
export async function createSitePullZone(
  apiKey: string,
  name: string,
  storageZoneId: number,
): Promise<PullZone> {
  const pullZone = await createPullZone(apiKey, name, storageZoneId);

  // Override browser cache setting to immutable for known framework, hashed, assets
  await addOrUpdateEdgeRule(apiKey, pullZone.Id, {
    Guid: null,
    ActionType: 25,
    ActionParameter1: "public, max-age=31536000, immutable",
    ActionParameter2: "",
    ActionParameter3: "",
    Triggers: [
      {
        Type: 0,
        PatternMatches: [
          "*/_next/static/*",
          "*/_astro/*",
          "*/_app/immutable/*",
          "*/_nuxt/*",
        ],
        PatternMatchingType: 0,
        Parameter1: "",
      },
    ],
    ExtraActions: [],
    TriggerMatchingType: 0,
    Description: "",
    Enabled: true,
    OrderIndex: 0,
    ReadOnly: false,
  });

  return pullZone;
}

/**
 * The storage zones (deployments) belonging to a project.
 */
export function filterDeploymentStorageZones(
  projectName: string,
  zones: StorageZone[],
): StorageZone[] {
  return zones.filter((z) => isDeploymentStorageZone(projectName, z.Name));
}

export interface PreviewPullZone {
  /** The preview name, e.g. `pr-42` */
  preview: string;
  pullZone: PullZone;
}

/**
 * The preview pull zones belonging to a project. The production pull zone is
 * excluded even if its name happens to match.
 */
export function filterPreviewPullZones(
  projectName: string,
  productionPullZoneId: number,
  pullZones: PullZone[],
): PreviewPullZone[] {
  const previews: PreviewPullZone[] = [];
  for (const pullZone of pullZones) {
    if (pullZone.Id === productionPullZoneId) continue;
    const preview = parsePreviewPullZoneName(projectName, pullZone.Name);
    if (preview !== null) previews.push({ preview, pullZone });
  }
  return previews;
}

export async function listPreviewPullZones(
  apiKey: string,
  projectName: string,
  productionPullZoneId: number,
): Promise<PreviewPullZone[]> {
  const pullZones = await listPullZones(
    apiKey,
    previewPullZoneName(projectName, ""),
  );
  return filterPreviewPullZones(projectName, productionPullZoneId, pullZones);
}

export async function findPreviewPullZone(
  apiKey: string,
  projectName: string,
  productionPullZoneId: number,
  previewName: string,
): Promise<PreviewPullZone | undefined> {
  const pullZones = await listPullZones(
    apiKey,
    previewPullZoneName(projectName, previewName),
  );
  return filterPreviewPullZones(
    projectName,
    productionPullZoneId,
    pullZones,
  ).find((p) => p.preview === previewName);
}

export interface PrunePlan {
  /** Preview pull zones to delete, before their storage zones */
  previewPullZones: PreviewPullZone[];
  /** Deployment storage zones to delete */
  storageZones: StorageZone[];
}

/**
 * Decide what `bn prune` deletes.
 *
 * - Deployments (storage zones) older than the cutoff expire, except the one
 *   production currently serves.
 * - A preview pull zone expires together with the deployment it points at
 *   (cascade), and is also removed if that storage zone no longer exists.
 */
export function planPrune(options: {
  allStorageZones: StorageZone[];
  deploymentStorageZones: StorageZone[];
  previewPullZones: PreviewPullZone[];
  productionStorageZoneId: number;
  cutoff: Date;
}): PrunePlan {
  const storageZones = options.deploymentStorageZones.filter(
    (zone) =>
      zone.Id !== options.productionStorageZoneId &&
      new Date(zone.DateModified) < options.cutoff,
  );

  const expiredIds = new Set(storageZones.map((z) => z.Id));
  const existingIds = new Set(options.allStorageZones.map((z) => z.Id));

  const previewPullZones = options.previewPullZones.filter(
    ({ pullZone }) =>
      expiredIds.has(pullZone.StorageZoneId) ||
      !existingIds.has(pullZone.StorageZoneId),
  );

  return { previewPullZones, storageZones };
}

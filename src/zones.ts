import {
  addOrUpdateEdgeRule,
  createPullZone,
  type PullZone,
  type StorageZone,
} from "./api.ts";
import { isDeploymentStorageZone } from "./naming.ts";

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

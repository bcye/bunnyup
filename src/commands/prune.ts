import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig, parsePruneDuration } from "../config.ts";
import {
  listStorageZones,
  deleteStorageZone,
  deletePullZone,
  getPullZone,
} from "../api.ts";
import {
  filterDeploymentStorageZones,
  listPreviewPullZones,
  planPrune,
} from "../zones.ts";

export interface PruneOptions {
  yes?: boolean;
  nested?: boolean;
}

export interface PruneResult {
  deleted: number;
  skipped: number;
}

export async function prune(options: PruneOptions = {}): Promise<PruneResult> {
  if (!options.nested) {
    p.intro(pc.bgCyan(pc.black(" bunnyup prune ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  const spinner = p.spinner();
  spinner.start("Finding old deployments");

  // Production's active storage zone is never pruned
  const productionPullZone = await getPullZone(apiKey, config.pullZoneId);

  const allStorageZones = await listStorageZones(apiKey);
  const previewPullZones = await listPreviewPullZones(
    apiKey,
    config.name,
    config.pullZoneId,
  );

  const pruneMs = parsePruneDuration(config.pruneAfter);
  const plan = planPrune({
    allStorageZones,
    deploymentStorageZones: filterDeploymentStorageZones(
      config.name,
      allStorageZones,
    ),
    previewPullZones,
    productionStorageZoneId: productionPullZone.StorageZoneId,
    cutoff: new Date(Date.now() - pruneMs),
  });

  const total = plan.storageZones.length + plan.previewPullZones.length;

  spinner.stop(
    `Found ${plan.storageZones.length} old deployment(s) and ${plan.previewPullZones.length} expired preview(s)`,
  );

  if (total === 0) {
    const msg = "Nothing to prune";
    options.nested ? p.log.info(msg) : p.outro(msg);
    return { deleted: 0, skipped: 0 };
  }

  // Show what will be deleted
  const lines = [
    ...plan.previewPullZones.map(
      ({ preview, pullZone }) =>
        `  ${pc.dim("Preview:")} ${preview} ${pc.dim(`(${pullZone.Name})`)}`,
    ),
    ...plan.storageZones.map((z) => {
      const date = new Date(z.DateModified).toLocaleDateString();
      return `  ${pc.dim("Deployment:")} ${z.Name} ${pc.dim(`(${date})`)}`;
    }),
  ];
  p.log.info(`Will delete:\n${lines.join("\n")}`);

  // Confirm unless --yes
  if (!options.yes) {
    const shouldDelete = await p.confirm({
      message: `Delete ${total} resource(s)?`,
      initialValue: true,
    });

    if (p.isCancel(shouldDelete) || !shouldDelete) {
      p.cancel("Cancelled");
      return { deleted: 0, skipped: total };
    }
  }

  spinner.start(`Deleting 0/${total}`);

  let deleted = 0;

  // Preview pull zones go first so their storage zones are no longer in use.
  // If one can't be deleted, keep its storage zone so the preview isn't broken.
  const keepStorageZoneIds = new Set<number>();
  for (const { preview, pullZone } of plan.previewPullZones) {
    try {
      await deletePullZone(apiKey, pullZone.Id);
      deleted++;
      spinner.message(`Deleting ${deleted}/${total}`);
    } catch {
      keepStorageZoneIds.add(pullZone.StorageZoneId);
      p.log.warn(`Failed to delete preview ${preview}`);
    }
  }

  for (const zone of plan.storageZones) {
    if (keepStorageZoneIds.has(zone.Id)) continue;
    try {
      await deleteStorageZone(apiKey, zone.Id);
      deleted++;
      spinner.message(`Deleting ${deleted}/${total}`);
    } catch {
      p.log.warn(`Failed to delete ${zone.Name}`);
    }
  }

  spinner.stop(`Deleted ${deleted} resource(s)`);

  const msg = pc.green("✓") + " Prune complete";
  options.nested ? p.log.success(msg) : p.outro(msg);

  return { deleted, skipped: total - deleted };
}

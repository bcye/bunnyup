import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig, parsePruneDuration } from "../config.ts";
import { listStorageZones, deleteStorageZone, getPullZone } from "../api.ts";

export interface PruneOptions {
  yes?: boolean;
}

export interface PruneResult {
  deleted: number;
  skipped: number;
}

export async function prune(options: PruneOptions = {}): Promise<PruneResult> {
  p.intro(pc.bgCyan(pc.black(" bunnyup prune ")));

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  const spinner = p.spinner();
  spinner.start("Finding old deployments");

  // Get current active storage zone
  const pullZone = await getPullZone(apiKey, config.pullZoneId);
  const activeStorageZoneId = pullZone.StorageZoneId;

  // List all storage zones for this project
  const allZones = await listStorageZones(apiKey);
  const projectZones = allZones.filter((z) =>
    z.Name.startsWith(`${config.name}-`),
  );

  // Parse prune duration
  const pruneMs = parsePruneDuration(config.pruneAfter);
  const cutoffDate = new Date(Date.now() - pruneMs);

  // Find zones to prune
  const zonesToPrune = projectZones.filter((zone) => {
    // Never delete the active zone
    if (zone.Id === activeStorageZoneId) {
      return false;
    }

    const modified = new Date(zone.DateModified);
    return modified < cutoffDate;
  });

  spinner.stop(`Found ${zonesToPrune.length} old deployment(s)`);

  if (zonesToPrune.length === 0) {
    p.outro("Nothing to prune");
    return { deleted: 0, skipped: 0 };
  }

  // Show what will be deleted
  const lines = zonesToPrune.map((z) => {
    const date = new Date(z.DateModified).toLocaleDateString();
    return `  ${pc.dim(z.Name)} (${date})`;
  });
  p.log.info(`Will delete:\n${lines.join("\n")}`);

  // Confirm unless --yes
  if (!options.yes) {
    const shouldDelete = await p.confirm({
      message: `Delete ${zonesToPrune.length} old deployment(s)?`,
      initialValue: true,
    });

    if (p.isCancel(shouldDelete) || !shouldDelete) {
      p.cancel("Cancelled");
      return { deleted: 0, skipped: zonesToPrune.length };
    }
  }

  // Delete zones
  spinner.start(`Deleting 0/${zonesToPrune.length}`);

  let deleted = 0;
  for (const zone of zonesToPrune) {
    try {
      await deleteStorageZone(apiKey, zone.Id);
      deleted++;
      spinner.message(`Deleting ${deleted}/${zonesToPrune.length}`);
    } catch (error) {
      p.log.warn(`Failed to delete ${zone.Name}`);
    }
  }

  spinner.stop(`Deleted ${deleted} deployment(s)`);

  p.outro(pc.green("✓") + " Prune complete");

  return { deleted, skipped: zonesToPrune.length - deleted };
}

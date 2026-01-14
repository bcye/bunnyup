import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig, parsePruneDuration } from "../config.ts";
import {
  listStorageZones,
  deleteStorageZone,
  getPullZone,
} from "../api.ts";

export interface PruneOptions {
  yes?: boolean;
  quiet?: boolean;
}

export interface PruneResult {
  deleted: number;
  skipped: number;
}

export async function prune(options: PruneOptions = {}): Promise<PruneResult> {
  const quiet = options.quiet ?? false;

  if (!quiet) {
    p.intro(pc.bgCyan(pc.black(" bunny prune ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  const spinner = p.spinner();
  spinner.start("Finding old deployments...");

  // Get current active storage zone
  const pullZone = await getPullZone(apiKey, config.pullZoneId);
  const activeStorageZoneId = pullZone.StorageZoneId;

  // List all storage zones for this project
  const allZones = await listStorageZones(apiKey);
  const projectZones = allZones.filter((z) =>
    z.Name.startsWith(`${config.name}-`)
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
    if (!quiet) {
      p.outro("Nothing to prune.");
    }
    return { deleted: 0, skipped: 0 };
  }

  // Show what will be deleted
  if (!quiet) {
    const lines = zonesToPrune.map((z) => {
      const date = new Date(z.DateModified).toLocaleDateString();
      return `${pc.dim(z.Name)} (${date})`;
    });
    p.note(lines.join("\n"), `Will delete ${zonesToPrune.length} zone(s)`);
  }

  // Confirm unless --yes
  if (!options.yes && !quiet) {
    const shouldDelete = await p.confirm({
      message: `Delete ${zonesToPrune.length} old deployment(s)?`,
      initialValue: true,
    });

    if (p.isCancel(shouldDelete) || !shouldDelete) {
      p.cancel("Prune cancelled.");
      return { deleted: 0, skipped: zonesToPrune.length };
    }
  }

  // Delete zones
  spinner.start(`Deleting ${zonesToPrune.length} zone(s)...`);

  let deleted = 0;
  for (const zone of zonesToPrune) {
    try {
      await deleteStorageZone(apiKey, zone.Id);
      deleted++;
      spinner.message(`Deleted ${deleted}/${zonesToPrune.length}...`);
    } catch (error) {
      // Log but continue
      if (!quiet) {
        p.log.warn(`Failed to delete ${zone.Name}: ${error}`);
      }
    }
  }

  spinner.stop(`Deleted ${deleted} deployment(s)`);

  if (!quiet) {
    p.outro(pc.green("Prune complete!"));
  }

  return { deleted, skipped: zonesToPrune.length - deleted };
}

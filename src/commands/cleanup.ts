import * as p from "@clack/prompts";
import { unlink } from "node:fs/promises";
import pc from "picocolors";
import {
  BunnyApiError,
  deletePullZone,
  deleteStorageZone,
  listStorageZones,
} from "../api.ts";
import {
  CONFIG_FILE,
  getConfigPath,
  requireApiKey,
  requireConfig,
} from "../config.ts";

export interface CleanupOptions {
  yes?: boolean;
  nested?: boolean;
}

export interface CleanupResult {
  pullZoneDeleted: boolean;
  storageZonesDeleted: number;
  storageZonesFailed: number;
}

export async function cleanup(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  if (!options.nested) {
    p.intro(pc.bgRed(pc.white(" bunnyup cleanup ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  const spinner = p.spinner();
  spinner.start("Finding project resources");

  const allZones = await listStorageZones(apiKey);
  const projectZones = allZones.filter((z) =>
    z.Name.startsWith(`${config.name}-`),
  );

  spinner.stop(
    `Found pull zone and ${projectZones.length} storage zone(s)`,
  );

  // Show what will be deleted
  const lines = [
    `  ${pc.dim("Pull zone:")} ${config.name} (id ${config.pullZoneId})`,
    ...projectZones.map((z) => `  ${pc.dim("Storage zone:")} ${z.Name}`),
  ];
  p.log.warn(
    `This will permanently delete the following resources from Bunny.net:\n${lines.join("\n")}`,
  );

  if (!options.yes) {
    const shouldDelete = await p.confirm({
      message: `Permanently delete ${projectZones.length + 1} resource(s)?`,
      initialValue: false,
    });

    if (p.isCancel(shouldDelete) || !shouldDelete) {
      const msg = "Cancelled";
      options.nested ? p.log.info(msg) : p.cancel(msg);
      if (!options.nested) process.exit(1);
      return {
        pullZoneDeleted: false,
        storageZonesDeleted: 0,
        storageZonesFailed: 0,
      };
    }
  }

  // Delete pull zone first so storage zones are no longer referenced
  spinner.start("Deleting pull zone");
  let pullZoneDeleted = false;
  try {
    await deletePullZone(apiKey, config.pullZoneId);
    pullZoneDeleted = true;
    spinner.stop("Pull zone deleted");
  } catch (err) {
    if (err instanceof BunnyApiError && err.status === 404) {
      spinner.stop("Pull zone already gone");
      pullZoneDeleted = true;
    } else {
      spinner.stop("Failed to delete pull zone");
      throw err;
    }
  }

  // Delete storage zones
  let deleted = 0;
  let failed = 0;
  const failures: { name: string; error: unknown }[] = [];
  if (projectZones.length > 0) {
    spinner.start(`Deleting storage zones 0/${projectZones.length}`);
    for (const zone of projectZones) {
      try {
        await deleteStorageZone(apiKey, zone.Id);
        deleted++;
      } catch (err) {
        if (err instanceof BunnyApiError && err.status === 404) {
          deleted++;
        } else {
          failed++;
          failures.push({ name: zone.Name, error: err });
        }
      }
      spinner.message(
        `Deleting storage zones ${deleted + failed}/${projectZones.length}`,
      );
    }
    spinner.stop(`Deleted ${deleted} storage zone(s)`);

    for (const { name, error } of failures) {
      const detail =
        error instanceof BunnyApiError
          ? `${error.message}${error.body ? `\n${error.body}` : ""}`
          : error instanceof Error
            ? (error.stack ?? error.message)
            : String(error);
      p.log.error(`Failed to delete ${name}:\n${detail}`);
    }
  }

  // Remove local config only if everything succeeded — otherwise the user
  // will want to retry against the same project
  if (failed === 0) {
    try {
      await unlink(getConfigPath());
      p.log.success(`Removed ${CONFIG_FILE}`);
    } catch {
      // Already gone or unreadable; ignore
    }
  } else {
    p.log.warn(`Keeping ${CONFIG_FILE} so cleanup can be retried.`);
  }

  const summary =
    failed === 0
      ? `${pc.green("✓")} Cleanup complete`
      : `${pc.yellow("!")} Cleanup finished with ${failed} failure(s)`;
  options.nested ? p.log.success(summary) : p.outro(summary);

  return {
    pullZoneDeleted,
    storageZonesDeleted: deleted,
    storageZonesFailed: failed,
  };
}

import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig } from "../config.ts";
import {
  listStorageZones,
  updatePullZoneStorageZone,
  getPullZone,
} from "../api.ts";
import { resolveGitRef, hasUncommittedChanges } from "../git.ts";

export interface ActivateOptions {
  version?: string;
  storageZoneId?: number;
  quiet?: boolean;
}

export async function activate(options: ActivateOptions = {}): Promise<void> {
  const quiet = options.quiet ?? false;

  if (!quiet) {
    p.intro(pc.bgCyan(pc.black(" bunny activate ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  let storageZoneId = options.storageZoneId;
  let versionDisplay: string;

  if (!storageZoneId) {
    // Default to HEAD if no version specified
    const version = options.version ?? "HEAD";

    // Warn about uncommitted changes when using HEAD
    if (version === "HEAD" && await hasUncommittedChanges()) {
      p.log.warn("You have uncommitted changes. The deployed version may not match your working directory.");
    }

    // Resolve git ref to hash
    let gitHash: string;
    try {
      gitHash = await resolveGitRef(version);
    } catch {
      p.cancel(`Could not resolve git ref "${version}".`);
      process.exit(1);
    }
    versionDisplay = gitHash;

    const storageZoneName = `${config.name}-${gitHash}`;

    // Find storage zone
    const spinner = p.spinner();
    spinner.start("Finding storage zone...");

    const zones = await listStorageZones(apiKey);
    const zone = zones.find((z) => z.Name === storageZoneName);

    if (!zone) {
      spinner.stop("Not found");
      p.cancel(
        `No deployment found for version "${version}" (${gitHash}). Run ${pc.cyan("bn upload")} first.`
      );
      process.exit(1);
    }

    spinner.stop(`Found ${pc.dim(storageZoneName)}`);
    storageZoneId = zone.Id;
  } else {
    versionDisplay = "specified zone";
  }

  // Update pull zone
  const spinner = p.spinner();
  spinner.start("Activating version...");

  await updatePullZoneStorageZone(apiKey, config.pullZoneId, storageZoneId);

  spinner.stop("Version activated");

  // Get site URL
  const pullZone = await getPullZone(apiKey, config.pullZoneId);
  const hostname = pullZone.Hostnames?.[0]?.Value ?? `${config.name}.b-cdn.net`;

  if (!quiet) {
    p.note(`${pc.green("🌐")} ${pc.cyan(`https://${hostname}`)}`, `Active: ${versionDisplay}`);
    p.outro(pc.green("Done!"));
  }
}

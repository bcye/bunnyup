import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig } from "../config.ts";
import {
  listStorageZones,
  updatePullZoneStorageZone,
  getPullZone,
} from "../api.ts";
import { resolveGitRef } from "../git.ts";

export interface ActivateOptions {
  version?: string;
  storageZoneId?: number;
}

export async function activate(options: ActivateOptions = {}): Promise<string> {
  p.intro(pc.bgCyan(pc.black(" bunny activate ")));

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  let storageZoneId = options.storageZoneId;
  let gitHash: string;

  if (!storageZoneId) {
    // Default to HEAD if no version specified
    const version = options.version ?? "HEAD";

    // Resolve git ref to hash
    try {
      gitHash = await resolveGitRef(version);
    } catch {
      p.cancel(`Could not resolve git ref "${version}".`);
      process.exit(1);
    }

    const storageZoneName = `${config.name}-${gitHash}`;

    // Find storage zone
    const spinner = p.spinner();
    spinner.start(`Finding ${pc.dim(gitHash)}`);

    const zones = await listStorageZones(apiKey);
    const zone = zones.find((z) => z.Name === storageZoneName);

    if (!zone) {
      spinner.stop("Not found");
      p.cancel(`Version ${pc.cyan(gitHash)} not uploaded. Run ${pc.cyan("bn upload")} first.`);
      process.exit(1);
    }

    spinner.stop(`Found ${pc.dim(gitHash)}`);
    storageZoneId = zone.Id;
  } else {
    gitHash = "direct";
  }

  // Update pull zone
  const spinner = p.spinner();
  spinner.start("Activating");

  await updatePullZoneStorageZone(apiKey, config.pullZoneId, storageZoneId);

  // Get site URL
  const pullZone = await getPullZone(apiKey, config.pullZoneId);
  const hostname = pullZone.Hostnames?.[0]?.Value ?? `${config.name}.b-cdn.net`;
  const siteUrl = `https://${hostname}`;

  spinner.stop("Activated");

  p.outro(`${pc.green("🌐")} ${pc.cyan(siteUrl)}`);

  return siteUrl;
}

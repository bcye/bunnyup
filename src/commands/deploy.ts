import * as p from "@clack/prompts";
import pc from "picocolors";
import { requireApiKey, requireConfig } from "../config.ts";
import { getPullZone } from "../api.ts";
import { upload } from "./upload.ts";
import { activate } from "./activate.ts";
import { prune } from "./prune.ts";

export interface DeployOptions {
  noPrune?: boolean;
  yes?: boolean;
  quiet?: boolean;
}

export async function deploy(options: DeployOptions = {}): Promise<void> {
  const quiet = options.quiet ?? false;

  if (!quiet) {
    p.intro(pc.bgCyan(pc.black(" bunny deploy ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  // Step 1: Upload
  if (!quiet) {
    p.log.step("Uploading files...");
  }

  const uploadResult = await upload({
    quiet: true,
  });

  if (!quiet) {
    p.log.success(`Uploaded ${uploadResult.fileCount} files`);
  }

  // Step 2: Activate
  if (!quiet) {
    p.log.step("Activating deployment...");
  }

  await activate({
    storageZoneId: uploadResult.storageZone.Id,
    quiet: true,
  });

  if (!quiet) {
    p.log.success("Deployment activated");
  }

  // Step 3: Prune (unless --no-prune)
  if (!options.noPrune) {
    if (!quiet) {
      p.log.step("Pruning old deployments...");
    }

    const pruneResult = await prune({
      yes: options.yes ?? true, // Auto-confirm in deploy
      quiet: true,
    });

    if (!quiet && pruneResult.deleted > 0) {
      p.log.success(`Pruned ${pruneResult.deleted} old deployment(s)`);
    }
  }

  // Get site URL
  const pullZone = await getPullZone(apiKey, config.pullZoneId);
  const hostname = pullZone.Hostnames?.[0]?.Value ?? `${config.name}.b-cdn.net`;
  const siteUrl = `https://${hostname}`;

  if (!quiet) {
    p.note(`${pc.green("🌐")} ${pc.cyan(siteUrl)}`, "Deployed!");
    p.outro(pc.green("Done!"));
  }
}

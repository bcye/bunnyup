import * as p from "@clack/prompts";
import pc from "picocolors";
import { upload } from "./upload.ts";
import { activate } from "./activate.ts";
import { prune } from "./prune.ts";

export interface DeployOptions {
  noPrune?: boolean;
  force?: boolean;
  nested?: boolean;
}

export async function deploy(options: DeployOptions = {}): Promise<void> {
  if (!options.nested) {
    p.intro(pc.bgCyan(pc.black(" bunnyup deploy ")));
  }

  // Upload
  const uploadResult = await upload({ force: options.force, nested: true });

  // Activate
  await activate({
    storageZoneId: uploadResult.storageZone.Id,
    nested: true,
  });

  // Prune (unless --no-prune)
  if (!options.noPrune) {
    await prune({ yes: true, nested: true }); // Auto-confirm when part of deploy
  }

  if (!options.nested) {
    p.outro(pc.green("Deployment complete!"));
  }
}

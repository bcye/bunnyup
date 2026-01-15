import { upload } from "./upload.ts";
import { activate } from "./activate.ts";
import { prune } from "./prune.ts";

export interface DeployOptions {
  noPrune?: boolean;
  force?: boolean;
}

export async function deploy(options: DeployOptions = {}): Promise<void> {
  // Upload
  const uploadResult = await upload({ force: options.force });

  // Activate
  await activate({ storageZoneId: uploadResult.storageZone.Id });

  // Prune (unless --no-prune)
  if (!options.noPrune) {
    await prune({ yes: true }); // Auto-confirm when part of deploy
  }
}

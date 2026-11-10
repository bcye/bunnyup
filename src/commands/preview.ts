import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  BunnyApiError,
  checkPullZoneAvailability,
  deletePullZone,
  deleteStorageZone,
  getPullZone,
  listPullZones,
  listStorageZones,
  purgePullZoneCache,
  updatePullZoneStorageZone,
  type PullZone,
} from "../api.ts";
import { requireApiKey, requireConfig } from "../config.ts";
import {
  previewPullZoneName,
  validatePreviewName,
  validateProjectNameForPreviews,
} from "../naming.ts";
import {
  createSitePullZone,
  filterDeploymentStorageZones,
  findPreviewPullZone,
} from "../zones.ts";
import { upload } from "./upload.ts";

export interface PreviewDeployOptions {
  force?: boolean;
  nested?: boolean;
}

export interface PreviewRemoveOptions {
  nested?: boolean;
}

function fail(message: string, nested?: boolean): never {
  nested ? p.log.error(message) : p.cancel(message);
  process.exit(1);
}

function validateNames(
  projectName: string,
  previewName: string,
  nested?: boolean,
) {
  const error =
    validateProjectNameForPreviews(projectName) ??
    validatePreviewName(previewName, projectName);
  if (error) fail(error, nested);
}

function siteUrl(pullZone: PullZone): string {
  const hostname =
    pullZone.Hostnames?.[0]?.Value ?? `${pullZone.Name}.b-cdn.net`;
  return `https://${hostname}`;
}

/**
 * Upload the current commit and point the named preview at it, creating the
 * preview pull zone if it doesn't exist yet.
 */
export async function previewDeploy(
  previewName: string,
  options: PreviewDeployOptions = {},
): Promise<string> {
  if (!options.nested) {
    p.intro(pc.bgCyan(pc.black(" bunnyup preview deploy ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();
  validateNames(config.name, previewName, options.nested);

  const zoneName = previewPullZoneName(config.name, previewName);

  // Resolve the target before uploading so a taken name fails fast
  const spinner = p.spinner();
  spinner.start(`Looking up preview ${pc.dim(previewName)}`);
  const existing = await findPreviewPullZone(
    apiKey,
    config.name,
    config.pullZoneId,
    previewName,
  );
  if (!existing && !(await checkPullZoneAvailability(apiKey, zoneName))) {
    spinner.stop("Name not available");
    fail(
      `The pull zone name "${zoneName}" is already taken on Bunny.net. Choose a different preview name.`,
      options.nested,
    );
  }
  spinner.stop(
    existing
      ? `Updating preview ${pc.dim(previewName)}`
      : `Creating preview ${pc.dim(previewName)}`,
  );

  const { storageZone } = await upload({
    force: options.force,
    allowExisting: true,
    nested: true,
  });

  let pullZone: PullZone;
  if (existing) {
    spinner.start("Activating preview");
    await updatePullZoneStorageZone(
      apiKey,
      existing.pullZone.Id,
      storageZone.Id,
    );
    // Previews are re-pointed often and get little traffic, so purge to avoid
    // serving the previous commit's cached assets.
    await purgePullZoneCache(apiKey, existing.pullZone.Id);
    pullZone = existing.pullZone;
    spinner.stop("Preview activated");
  } else {
    spinner.start(`Creating pull zone ${pc.dim(zoneName)}`);
    pullZone = await createSitePullZone(apiKey, zoneName, storageZone.Id);
    spinner.stop("Preview pull zone created");
  }

  const url = siteUrl(pullZone);
  const msg = `${pc.green("🔍")} ${pc.cyan(url)}`;
  options.nested ? p.log.success(msg) : p.outro(msg);
  return url;
}

/**
 * Delete the named preview's pull zone, and its deployment if nothing else
 * (production or another preview) is serving it. Removing a preview that
 * doesn't exist succeeds, so this is safe to run from CI more than once.
 */
export async function previewRemove(
  previewName: string,
  options: PreviewRemoveOptions = {},
): Promise<boolean> {
  if (!options.nested) {
    p.intro(pc.bgYellow(pc.black(" bunnyup preview remove ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();
  validateNames(config.name, previewName, options.nested);

  const spinner = p.spinner();
  spinner.start(`Looking up preview ${pc.dim(previewName)}`);
  const existing = await findPreviewPullZone(
    apiKey,
    config.name,
    config.pullZoneId,
    previewName,
  );

  if (!existing) {
    spinner.stop("Not found");
    const msg = `No preview named ${pc.cyan(previewName)}, nothing to remove`;
    options.nested ? p.log.info(msg) : p.outro(msg);
    return false;
  }

  spinner.message(`Deleting pull zone ${pc.dim(existing.pullZone.Name)}`);
  try {
    await deletePullZone(apiKey, existing.pullZone.Id);
  } catch (err) {
    if (!(err instanceof BunnyApiError && err.status === 404)) throw err;
  }
  spinner.stop(`Deleted pull zone ${pc.dim(existing.pullZone.Name)}`);

  // Delete the deployment too, unless something else still serves it
  const storageZoneId = existing.pullZone.StorageZoneId;
  const production = await getPullZone(apiKey, config.pullZoneId);
  const otherPullZones = await listPullZones(apiKey);
  const inUse =
    production.StorageZoneId === storageZoneId ||
    otherPullZones.some(
      (z) => z.Id !== existing.pullZone.Id && z.StorageZoneId === storageZoneId,
    );
  const deployment = filterDeploymentStorageZones(
    config.name,
    await listStorageZones(apiKey),
  ).find((z) => z.Id === storageZoneId);

  if (deployment && !inUse) {
    spinner.start(`Deleting deployment ${pc.dim(deployment.Name)}`);
    try {
      await deleteStorageZone(apiKey, deployment.Id);
      spinner.stop(`Deleted deployment ${pc.dim(deployment.Name)}`);
    } catch (err) {
      spinner.stop(`Could not delete deployment ${pc.dim(deployment.Name)}`);
      p.log.warn(
        `It will be removed by ${pc.cyan("bn prune")} once it expires.`,
      );
    }
  } else if (deployment) {
    p.log.info(
      `Keeping deployment ${pc.dim(deployment.Name)}, it is still in use`,
    );
  }

  const msg = `${pc.green("✓")} Removed preview ${pc.cyan(previewName)}`;
  options.nested ? p.log.success(msg) : p.outro(msg);
  return true;
}

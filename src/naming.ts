/**
 * Naming conventions for the resources bunnyup creates on Bunny.net.
 *
 * - Deployments are storage zones named `{project}-{gitHash}` (plus the
 *   `{project}-initial` zone created by `bn new`).
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a storage zone name is a deployment of the given project.
 *
 * Matches exactly `{project}-{hash}` or `{project}-initial`, so that a project
 * named `blog` does not claim the storage zones of a project named `blog-old`.
 */
export function isDeploymentStorageZone(
  projectName: string,
  zoneName: string,
): boolean {
  const pattern = new RegExp(
    `^${escapeRegExp(projectName)}-(?:[0-9a-f]{7,40}|initial)$`,
    "i",
  );
  return pattern.test(zoneName);
}

/**
 * Validate a project name. Returns an error message, or undefined if valid.
 */
export function validateProjectName(value: string): string | undefined {
  if (!/^[a-z0-9-]+$/i.test(value)) {
    return "Name can only contain letters, numbers, and hyphens";
  }
  if (value.length < 3 || value.length > 60) {
    return "Name must be between 3 and 60 characters";
  }
}

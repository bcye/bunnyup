/**
 * Naming conventions for the resources bunnyup creates on Bunny.net.
 *
 * - Deployments are storage zones named `{project}-{gitHash}` (plus the
 *   `{project}-initial` zone created by `bn new`).
 * - The production pull zone is named `{project}` and referenced by id in
 *   bunnyup.json.
 * - Preview pull zones are named `{project}-pre-{preview}` and are discovered
 *   by name through the API.
 *
 * Neither project names nor preview names may contain `pre` as a
 * hyphen-separated word. That keeps `-pre-` occurring exactly once in a
 * preview pull zone name, so it can always be split back into project and
 * preview unambiguously (e.g. `blog-pre-pre-x` can't be read as project
 * `blog`, preview `pre-x`).
 */

export const PREVIEW_SEPARATOR = "pre";

/** Pull zone names become `{name}.b-cdn.net`, so they are capped at one DNS label. */
const MAX_PULL_ZONE_NAME_LENGTH = 63;

function hasReservedWord(value: string): boolean {
  return value.toLowerCase().split("-").includes(PREVIEW_SEPARATOR);
}

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
  if (hasReservedWord(value)) {
    return `Name can't contain "${PREVIEW_SEPARATOR}" as a hyphen-separated word (reserved for preview deployments)`;
  }
}

/**
 * Validate a preview name. Returns an error message, or undefined if valid.
 *
 * When `projectName` is given, also checks that the resulting pull zone name
 * fits in a hostname label.
 */
export function validatePreviewName(
  value: string,
  projectName?: string,
): string | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return "Preview name can only contain lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen";
  }
  if (hasReservedWord(value)) {
    return `Preview name can't contain "${PREVIEW_SEPARATOR}" as a hyphen-separated word`;
  }
  if (projectName !== undefined) {
    const zoneName = previewPullZoneName(projectName, value);
    if (zoneName.length > MAX_PULL_ZONE_NAME_LENGTH) {
      return `Preview name is too long: "${zoneName}" exceeds ${MAX_PULL_ZONE_NAME_LENGTH} characters`;
    }
  }
}

/**
 * Whether this project's name can be used for preview deployments. Projects
 * created before the naming rule may contain the reserved word.
 */
export function validateProjectNameForPreviews(
  projectName: string,
): string | undefined {
  if (hasReservedWord(projectName)) {
    return `Project name "${projectName}" contains the reserved word "${PREVIEW_SEPARATOR}", so it can't be used for preview deployments`;
  }
}

/**
 * The pull zone name for a preview deployment.
 */
export function previewPullZoneName(
  projectName: string,
  previewName: string,
): string {
  return `${projectName}-${PREVIEW_SEPARATOR}-${previewName}`;
}

/**
 * If `zoneName` is a preview pull zone of this project, returns the preview
 * name. Otherwise returns null.
 */
export function parsePreviewPullZoneName(
  projectName: string,
  zoneName: string,
): string | null {
  const prefix = `${projectName}-${PREVIEW_SEPARATOR}-`.toLowerCase();
  const lower = zoneName.toLowerCase();
  if (!lower.startsWith(prefix)) return null;
  const preview = lower.slice(prefix.length);
  return validatePreviewName(preview) === undefined ? preview : null;
}

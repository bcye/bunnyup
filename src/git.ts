import { $ } from "bun";

/**
 * Get the short git hash of the current HEAD
 */
export async function getGitHash(): Promise<string> {
  const result = await $`git rev-parse --short HEAD`.text();
  return result.trim();
}

/**
 * Resolve a git ref (branch, tag, commit) to a short hash
 */
export async function resolveGitRef(ref: string): Promise<string> {
  const result = await $`git rev-parse --short ${ref}`.text();
  return result.trim();
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --git-dir`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  const result = await $`git status --porcelain`.text();
  return result.trim().length > 0;
}

/**
 * Get the current branch name (returns null if detached HEAD)
 */
export async function getCurrentBranch(): Promise<string | null> {
  try {
    const result = await $`git rev-parse --abbrev-ref HEAD`.quiet().text();
    const branch = result.trim();
    return branch === "HEAD" ? null : branch;
  } catch {
    return null;
  }
}

/**
 * Parse a git remote URL into a GitHub owner/repo pair, or null if not a GitHub URL
 */
export function parseGitHubRemote(
  url: string,
): { owner: string; repo: string } | null {
  const trimmed = url.trim();
  // git@github.com:owner/repo(.git)
  // https://github.com/owner/repo(.git)
  // ssh://git@github.com/owner/repo(.git)
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^https?:\/\/(?:[^@]*@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return { owner: m[1]!, repo: m[2]! };
  }
  return null;
}

/**
 * Get the GitHub owner/repo for the `origin` remote, or null if not GitHub or unavailable
 */
export async function getGitHubRepo(): Promise<{
  owner: string;
  repo: string;
} | null> {
  try {
    const result = await $`git remote get-url origin`.quiet().text();
    return parseGitHubRemote(result);
  } catch {
    return null;
  }
}

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

import { secrets } from "bun";
import { join } from "path";

const SERVICE_NAME = "net.bunny.cli";
const SECRET_NAME = "api-key";

export interface ProjectConfig {
  name: string;
  outputFolder: string;
  pruneAfter: string;
  pullZoneId?: number;
}

export interface RequiredProjectConfig extends ProjectConfig {
  pullZoneId: number;
}

const CONFIG_FILE = ".bunny.json";

/**
 * Get the API key from Bun.secrets (keychain) or BUNNY_API_KEY env var
 */
export async function getApiKey(): Promise<string | null> {
  // CI/env takes precedence for automation
  if (process.env.BUNNY_API_KEY) {
    return process.env.BUNNY_API_KEY;
  }

  // Fall back to OS keychain
  try {
    return await secrets.get({
      service: SERVICE_NAME,
      name: SECRET_NAME,
    });
  } catch {
    // Keychain not available (CI, minimal Linux, etc.)
    return null;
  }
}

/**
 * Store API key in OS keychain
 */
export async function setApiKey(key: string): Promise<void> {
  await secrets.set({
    service: SERVICE_NAME,
    name: SECRET_NAME,
    value: key,
  });
}

/**
 * Delete API key from OS keychain
 */
export async function deleteApiKey(): Promise<boolean> {
  try {
    return await secrets.delete({
      service: SERVICE_NAME,
      name: SECRET_NAME,
    });
  } catch {
    return false;
  }
}

/**
 * Get the config file path for the current directory
 */
export function getConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, CONFIG_FILE);
}

/**
 * Read project config from .bunny.json
 */
export async function readConfig(cwd: string = process.cwd()): Promise<ProjectConfig | null> {
  const configPath = getConfigPath(cwd);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return null;
  }

  try {
    return await file.json();
  } catch {
    return null;
  }
}

/**
 * Write project config to .bunny.json
 */
export async function writeConfig(config: ProjectConfig, cwd: string = process.cwd()): Promise<void> {
  const configPath = getConfigPath(cwd);
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Parse prune duration string (e.g., "30d", "7d", "2w") to milliseconds
 */
export function parsePruneDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dwmh])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like "30d", "7d", "2w", "24h"`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    h: 60 * 60 * 1000,           // hours
    d: 24 * 60 * 60 * 1000,      // days
    w: 7 * 24 * 60 * 60 * 1000,  // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approx)
  };

  return value * multipliers[unit]!;
}

/**
 * Require API key or exit with helpful message
 */
export async function requireApiKey(): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    const pc = await import("picocolors").then(m => m.default);
    console.error(`${pc.red("Error:")} Not logged in. Run ${pc.cyan("bn login")} first.`);
    process.exit(1);
  }
  return apiKey;
}

/**
 * Require project config or exit with helpful message
 */
export async function requireConfig(): Promise<RequiredProjectConfig> {
  const config = await readConfig();
  if (!config || !config.pullZoneId) {
    const pc = await import("picocolors").then(m => m.default);
    console.error(`${pc.red("Error:")} No configuration found. Run ${pc.cyan("bn new")} first.`);
    process.exit(1);
  }
  return config as RequiredProjectConfig;
}

/**
 * Get default project name from package.json or folder name
 */
export async function getDefaultProjectName(cwd: string = process.cwd()): Promise<string> {
  const pkgPath = join(cwd, "package.json");
  const pkgFile = Bun.file(pkgPath);

  if (await pkgFile.exists()) {
    try {
      const pkg = await pkgFile.json();
      if (pkg.name && typeof pkg.name === "string") {
        // Sanitize: remove scope, replace invalid chars
        return pkg.name.replace(/^@[^/]+\//, "").replace(/[^a-z0-9-]/gi, "-");
      }
    } catch {
      // Fall through to folder name
    }
  }

  // Use folder name, sanitized
  const folderName = cwd.split("/").pop() || "site";
  return folderName.replace(/[^a-z0-9-]/gi, "-");
}

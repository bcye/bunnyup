import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "path";
import { requireApiKey, requireConfig } from "../config.ts";
import {
  createStorageZone,
  uploadFile,
  findStorageZoneByName,
  listFiles,
  BunnyApiError,
  type StorageZone,
} from "../api.ts";
import { getGitHash, isGitRepo, hasUncommittedChanges } from "../git.ts";
import { sleep } from "bun";

const STORAGE_READY_TIMEOUT_MS = 60_000;
const STORAGE_READY_POLL_MS = 500;

async function waitForStorageZoneReady(zone: StorageZone): Promise<void> {
  const deadline = Date.now() + STORAGE_READY_TIMEOUT_MS;
  while (true) {
    try {
      await listFiles(zone.Name, zone.Password);
      return;
    } catch (err) {
      const retryable =
        err instanceof BunnyApiError &&
        (err.status === 401 || err.status === 404);
      if (!retryable || Date.now() >= deadline) throw err;
      await sleep(STORAGE_READY_POLL_MS);
    }
  }
}

const CONCURRENT_UPLOADS = 5;
const FRESH_BUILD_THRESHOLD_MS = 60_000;

export interface UploadResult {
  storageZone: StorageZone;
  fileCount: number;
  gitHash: string;
}

export interface UploadOptions {
  force?: boolean;
  nested?: boolean;
}

export async function upload(
  options: UploadOptions = {},
): Promise<UploadResult> {
  if (!options.nested) {
    p.intro(pc.bgCyan(pc.black(" bunnyup upload ")));
  }

  const apiKey = await requireApiKey();
  const config = await requireConfig();

  // Check git repo
  if (!(await isGitRepo())) {
    p.cancel("Not a git repository. bunnyup requires git for versioning.");
    process.exit(1);
  }

  // Fail if dirty (unless --force)
  if (await hasUncommittedChanges()) {
    if (options.force) {
      p.log.warn("Uploading with uncommitted changes (--force)");
    } else {
      p.cancel("Uncommitted changes. Commit first or use --force to override.");
      process.exit(1);
    }
  }

  const folder = config.outputFolder;
  const folderPath = join(process.cwd(), folder);

  // Check folder exists and collect files
  let files: string[] = [];
  try {
    const glob = new Bun.Glob("**/*");
    files = await Array.fromAsync(
      glob.scan({ cwd: folderPath, onlyFiles: true }),
    );
  } catch {
    p.cancel(
      `Output folder "${folder}" does not exist. Build your project first.`,
    );
    process.exit(1);
  }

  if (files.length === 0) {
    p.cancel(`Output folder "${folder}" is empty. Build your project first.`);
    process.exit(1);
  }

  // Warn if build looks stale
  let mostRecentMtime = 0;
  for (const relativePath of files) {
    const mtime = Bun.file(join(folderPath, relativePath)).lastModified;
    if (mtime > mostRecentMtime) mostRecentMtime = mtime;
  }
  if (Date.now() - mostRecentMtime > FRESH_BUILD_THRESHOLD_MS) {
    if (options.force) {
      p.log.warn(
        `Output folder "${folder}" hasn't been modified recently (--force)`,
      );
    } else {
      p.cancel(
        `Output folder "${folder}" hasn't been modified in the last minute. Rebuild or use --force to upload anyway.`,
      );
      process.exit(1);
    }
  }

  // Get git hash
  const gitHash = await getGitHash();
  const storageZoneName = `${config.name}-${gitHash}`;

  const spinner = p.spinner();

  // Check if this version already exists
  let storageZone = await findStorageZoneByName(apiKey, storageZoneName);

  if (storageZone) {
    if (options.force) {
      p.log.warn(`Version ${pc.cyan(gitHash)} exists, re-uploading (--force)`);
    } else {
      p.cancel(
        `Version ${pc.cyan(gitHash)} already uploaded. Use --force to re-upload.`,
      );
      process.exit(1);
    }
  } else {
    spinner.start(`Creating ${pc.dim(storageZoneName)}`);
    storageZone = await createStorageZone(apiKey, storageZoneName);
    spinner.message(`Waiting for ${pc.dim(storageZoneName)} to be ready`);
    await waitForStorageZoneReady(storageZone);
    spinner.stop(`Created ${pc.dim(storageZoneName)}`);
  }

  // Upload files in parallel with streaming
  spinner.start(`Uploading 0/${files.length} files`);

  let uploaded = 0;
  const queue = [...files];

  async function uploadNext(): Promise<void> {
    while (queue.length > 0) {
      const relativePath = queue.shift()!;
      const filePath = join(folderPath, relativePath);
      const file = Bun.file(filePath);

      // Stream file directly to API (no buffering)
      await uploadFile(
        storageZone!.Name,
        storageZone!.Password,
        relativePath,
        file,
      );

      uploaded++;
      spinner.message(`Uploading ${uploaded}/${files.length} files`);
    }
  }

  // Start concurrent uploaders
  const workers = Array.from({ length: CONCURRENT_UPLOADS }, () =>
    uploadNext(),
  );
  await Promise.all(workers);

  spinner.stop(`Uploaded ${files.length} files`);

  const msg = `${pc.green("✓")} Version ${pc.cyan(gitHash)} ready`;
  options.nested ? p.log.success(msg) : p.outro(msg);

  return {
    storageZone,
    fileCount: files.length,
    gitHash,
  };
}

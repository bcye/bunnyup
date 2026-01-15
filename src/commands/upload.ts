import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "path";
import { requireApiKey, requireConfig } from "../config.ts";
import {
  createStorageZone,
  uploadFile,
  findStorageZoneByName,
  type StorageZone,
} from "../api.ts";
import { getGitHash, isGitRepo, hasUncommittedChanges } from "../git.ts";

export interface UploadResult {
  storageZone: StorageZone;
  fileCount: number;
  gitHash: string;
}

export interface UploadOptions {
  force?: boolean;
}

export async function upload(options: UploadOptions = {}): Promise<UploadResult> {
  p.intro(pc.bgCyan(pc.black(" bunny upload ")));

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
    files = await Array.fromAsync(glob.scan({ cwd: folderPath, onlyFiles: true }));
  } catch {
    p.cancel(`Output folder "${folder}" does not exist. Build your project first.`);
    process.exit(1);
  }

  if (files.length === 0) {
    p.cancel(`Output folder "${folder}" is empty. Build your project first.`);
    process.exit(1);
  }

  // Get git hash
  const gitHash = await getGitHash();
  const storageZoneName = `${config.name}-${gitHash}`;

  const spinner = p.spinner();

  // Check if this version already exists
  let storageZone = await findStorageZoneByName(apiKey, storageZoneName);

  if (storageZone) {
    p.log.warn(`Version ${pc.cyan(gitHash)} already uploaded. Reusing.`);
  } else {
    spinner.start(`Creating ${pc.dim(storageZoneName)}`);
    storageZone = await createStorageZone(apiKey, storageZoneName);
    spinner.stop(`Created ${pc.dim(storageZoneName)}`);
  }

  // Upload files
  spinner.start(`Uploading 0/${files.length} files`);

  let uploaded = 0;
  for (const relativePath of files) {
    const filePath = join(folderPath, relativePath);
    const file = Bun.file(filePath);
    const content = await file.arrayBuffer();

    await uploadFile(storageZone.Name, storageZone.Password, relativePath, content);

    uploaded++;
    spinner.message(`Uploading ${uploaded}/${files.length} files`);
  }

  spinner.stop(`Uploaded ${files.length} files`);

  p.outro(`${pc.green("✓")} Version ${pc.cyan(gitHash)} ready`);

  return {
    storageZone,
    fileCount: files.length,
    gitHash,
  };
}

#!/usr/bin/env bun
import { Command } from "commander";
import { login } from "./commands/login.ts";
import { newProject } from "./commands/new.ts";
import { upload } from "./commands/upload.ts";
import { activate } from "./commands/activate.ts";
import { deploy } from "./commands/deploy.ts";
import { prune } from "./commands/prune.ts";
import { setupCi } from "./commands/setup-ci.ts";
import pc from "picocolors";
import packageJson from "../package.json";

const program = new Command();

program
  .name("bunnyup")
  .description("CLI tool for deploying sites with Bunny.net")
  .version(packageJson.version);

program
  .command("login")
  .description("Authenticate with your Bunny.net API key")
  .action(async () => {
    await login();
  });

program
  .command("new")
  .description("Set up a new site for deployment")
  .action(async () => {
    await newProject();
  });

program
  .command("upload")
  .description("Upload files to a new storage zone version")
  .option("-f, --force", "Upload even with uncommitted changes")
  .action(async (opts: { force?: boolean }) => {
    await upload({ force: opts.force });
  });

program
  .command("activate")
  .description("Activate a specific deployment version")
  .argument("[version]", "Git ref or commit hash (default: HEAD)")
  .action(async (version?: string) => {
    await activate({ version });
  });

program
  .command("deploy")
  .description("Upload, activate, and prune in one step")
  .option("--no-prune", "Skip pruning old deployments")
  .option("-f, --force", "Upload even with uncommitted changes")
  .action(async (opts: { prune: boolean; force?: boolean }) => {
    await deploy({
      noPrune: !opts.prune,
      force: opts.force,
    });
  });

program
  .command("prune")
  .description("Delete old deployment versions")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (opts: { yes?: boolean }) => {
    await prune({ yes: opts.yes });
  });

program
  .command("setup-ci")
  .description("Generate a CI workflow that deploys on push")
  .action(async () => {
    await setupCi();
  });

program.parseAsync().catch((err) => {
  process.on("exit", () => {
    process.stdout.write("\n");
    console.error(pc.dim("─".repeat(10)));
    console.error(pc.bold("Debug info") + pc.dim(" — please open an issue if this looks like a bug:"));
    console.error(pc.dim("https://github.com/<you>/bunnyup/issues/new\n"));
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  });
  process.exit(1);
});

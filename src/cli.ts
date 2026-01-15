#!/usr/bin/env bun
import { Command } from "commander";
import { login } from "./commands/login.ts";
import { newProject } from "./commands/new.ts";
import { upload } from "./commands/upload.ts";
import { activate } from "./commands/activate.ts";
import { deploy } from "./commands/deploy.ts";
import { prune } from "./commands/prune.ts";

const program = new Command();

program
  .name("bunnyup")
  .description("CLI tool for managing sites deployed with Bunny.net")
  .version("0.1.0");

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

program.parse();

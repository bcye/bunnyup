import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "path";
import { mkdir } from "node:fs/promises";
import {
  requireApiKey,
  getDefaultProjectName,
  readConfig,
  writeConfig,
  type ProjectConfig,
} from "../config.ts";
import {
  checkPullZoneAvailability,
  createPullZone,
  createStorageZone,
} from "../api.ts";
import { deploy } from "./deploy.ts";

const EXAMPLE_WORKFLOW = `name: Deploy to Bunny.net

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - run: bun run build

      - run: bunx bunnyup deploy
        env:
          BUNNY_API_KEY: \${{ secrets.BUNNY_API_KEY }}
`;

export async function newProject(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bunny new ")));

  const apiKey = await requireApiKey();

  // Check for existing config
  const existingConfig = await readConfig();
  if (existingConfig) {
    p.log.warn("This project is already configured.");
    const shouldReconfigure = await p.confirm({
      message: "Reconfigure this project?",
      initialValue: false,
    });

    if (p.isCancel(shouldReconfigure) || !shouldReconfigure) {
      p.outro("Keeping existing configuration.");
      return;
    }
  }

  // Gather configuration
  const defaultName = await getDefaultProjectName();

  const config = await p.group(
    {
      name: () =>
        p.text({
          message: "Project name:",
          placeholder: defaultName,
          defaultValue: defaultName,
          validate: (value) => {
            if (!/^[a-z0-9-]+$/i.test(value)) {
              return "Name can only contain letters, numbers, and hyphens";
            }
            if (value.length < 3 || value.length > 60) {
              return "Name must be between 3 and 60 characters";
            }
          },
        }),
      outputFolder: () =>
        p.text({
          message: "Output folder:",
          placeholder: "dist",
          defaultValue: "dist",
        }),
      pruneAfter: () =>
        p.text({
          message: "Prune deployments older than (days):",
          placeholder: "30",
          defaultValue: "30",
          validate: (value) => {
            const num = parseInt(value, 10);
            if (isNaN(num) || num <= 0) {
              return "Must be a positive number of days";
            }
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(1);
      },
    }
  );

  // Check availability
  const spinner = p.spinner();
  spinner.start("Checking name availability...");

  const available = await checkPullZoneAvailability(apiKey, config.name);
  if (!available) {
    spinner.stop("Name not available");
    p.cancel(
      `The name "${config.name}" is already taken. Please choose a different name.`
    );
    process.exit(1);
  }

  spinner.stop("Name is available");

  // Confirm creation
  const siteUrl = `https://${config.name}.b-cdn.net`;

  p.note(
    [
      `${pc.dim("Name:")} ${config.name}`,
      `${pc.dim("Output:")} ${config.outputFolder}`,
      `${pc.dim("Prune:")} ${config.pruneAfter}`,
      `${pc.dim("URL:")} ${siteUrl}`,
    ].join("\n"),
    "Configuration"
  );

  const shouldCreate = await p.confirm({
    message: "Create this site?",
    initialValue: true,
  });

  if (p.isCancel(shouldCreate) || !shouldCreate) {
    p.cancel("Setup cancelled.");
    process.exit(1);
  }

  // Create initial storage zone
  spinner.start("Creating storage zone...");
  const storageZone = await createStorageZone(apiKey, `${config.name}-initial`);
  spinner.stop("Storage zone created");

  // Create pull zone
  spinner.start("Creating pull zone...");
  const pullZone = await createPullZone(apiKey, config.name, storageZone.Id);
  spinner.stop("Pull zone created");

  // Save configuration
  const projectConfig: ProjectConfig = {
    name: config.name,
    outputFolder: config.outputFolder,
    pruneAfter: config.pruneAfter,
    pullZoneId: pullZone.Id,
  };

  await writeConfig(projectConfig);
  p.log.success("Configuration saved to .bunny.json");

  // Run deploy
  p.log.step("Running initial deploy...");
  await deploy({ noPrune: true, quiet: true });

  // Success message
  const dashboardUrl = `https://dash.bunny.net/cdn/${pullZone.Id}`;

  p.note(
    [
      `${pc.green("🌐")} ${pc.cyan(siteUrl)}`,
      "",
      `Dashboard: ${pc.dim(dashboardUrl)}`,
    ].join("\n"),
    "Site deployed!"
  );

  // Offer to create GitHub workflow
  const createWorkflow = await p.confirm({
    message: "Create example GitHub Actions workflow?",
    initialValue: true,
  });

  if (!p.isCancel(createWorkflow) && createWorkflow) {
    const examplesDir = join(process.cwd(), "examples");
    const workflowPath = join(examplesDir, "github-deploy.yml");

    try {
      await mkdir(examplesDir, { recursive: true });
      await Bun.write(workflowPath, EXAMPLE_WORKFLOW);
      p.log.success(`Created ${pc.dim("examples/github-deploy.yml")}`);
      p.note(
        `Copy to ${pc.cyan(".github/workflows/")} and add ${pc.cyan("BUNNY_API_KEY")} secret.`,
        "Next step"
      );
    } catch {
      p.log.warn("Could not create example workflow file.");
    }
  }

  p.outro(pc.green("Setup complete!"));
}

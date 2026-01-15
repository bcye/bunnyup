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

const WORKFLOW_URL =
  "https://raw.githubusercontent.com/bcye/bunnyup/main/examples/github-deploy.yml";

async function fetchWorkflowTemplate(): Promise<string | null> {
  try {
    const response = await fetch(WORKFLOW_URL);
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Fall through
  }
  return null;
}

export async function newProject(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bunnyup new ")));

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
    },
  );

  // Check availability
  const spinner = p.spinner();
  spinner.start("Checking name availability...");

  const available = await checkPullZoneAvailability(apiKey, config.name);
  if (!available) {
    spinner.stop("Name not available");
    p.cancel(
      `The name "${config.name}" is already taken. Please choose a different name.`,
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
      `${pc.dim("Prune:")} ${config.pruneAfter} days`,
      `${pc.dim("URL:")} ${siteUrl}`,
    ].join("\n"),
    "Configuration",
  );

  const shouldCreate = await p.confirm({
    message: "Create and deploy this site now?",
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
  p.log.success("Configuration saved to .bunnyup.json");

  // Run initial deploy (skip prune since there's nothing to prune yet)
  await deploy({ noPrune: true });

  // Show dashboard link
  const dashboardUrl = `https://dash.bunny.net/cdn/${pullZone.Id}`;
  p.log.info(`Dashboard: ${pc.dim(dashboardUrl)}`);

  // Offer to create GitHub workflow
  const createWorkflow = await p.confirm({
    message: "Create example GitHub Actions workflow?",
    initialValue: true,
  });

  if (!p.isCancel(createWorkflow) && createWorkflow) {
    const workflowContent = await fetchWorkflowTemplate();

    if (workflowContent) {
      const workflowDir = join(process.cwd(), ".github", "workflows");
      const workflowPath = join(workflowDir, "deploy.yml");

      try {
        await mkdir(workflowDir, { recursive: true });
        await Bun.write(workflowPath, workflowContent);
        p.log.success(`Created ${pc.dim(".github/workflows/deploy.yml")}`);
        p.note(
          `Add ${pc.cyan("BUNNY_API_KEY")} to your repository secrets.`,
          "Next step",
        );
      } catch {
        p.log.warn("Could not create workflow file.");
      }
    } else {
      p.log.warn(
        "Could not fetch workflow template. See https://github.com/bcye/bunnyup/tree/main/examples",
      );
    }
  }

  p.outro(pc.green("Setup complete!"));
}

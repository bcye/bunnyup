import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  addOrUpdateEdgeRule,
  checkPullZoneAvailability,
  createPullZone,
  createStorageZone,
} from "../api.ts";
import {
  CONFIG_FILE,
  getDefaultProjectName,
  readConfig,
  requireApiKey,
  writeConfig,
  type ProjectConfig,
} from "../config.ts";
import { isGitRepo } from "../git.ts";
import { ci } from "./ci.ts";

export async function newProject(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bunnyup new ")));

  // Check git repo
  if (!(await isGitRepo())) {
    p.cancel("Not a git repository. bunnyup requires git for versioning.");
    process.exit(1);
  }

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

  p.note("Enter to accept the default value", "Tip");

  // Empty values will be substituted with default if one is given. So validation accepts them.

  const config = await p.group(
    {
      name: () =>
        p.text({
          message: "Project name:",
          defaultValue: defaultName,
          placeholder: defaultName,
          validate: (value) => {
            if (!value) return;
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
          defaultValue: "dist",
          placeholder: "dist",
        }),
      pruneAfter: () =>
        p.text({
          message: "Prune deployments older than (days):",
          defaultValue: "30",
          placeholder: "30",
          validate: (value) => {
            if (!value) return;
            const num = parseInt(value as string, 10);
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

  // Override browser cache setting to immutable for known framework, hashed, assets
  await addOrUpdateEdgeRule(apiKey, pullZone.Id, {
    Guid: null,
    ActionType: 25,
    ActionParameter1: "public, max-age=31536000, immutable",
    ActionParameter2: "",
    ActionParameter3: "",
    Triggers: [
      {
        Type: 0,
        PatternMatches: [
          "*/_next/static/*",
          "*/_astro/*",
          "*/_app/immutable/*",
          "*/_nuxt/*",
        ],
        PatternMatchingType: 0,
        Parameter1: "",
      },
    ],
    ExtraActions: [],
    TriggerMatchingType: 0,
    Description: "",
    Enabled: true,
    OrderIndex: 0,
    ReadOnly: false,
  });
  spinner.stop("Pull zone created");

  // Save configuration
  const projectConfig: ProjectConfig = {
    name: config.name,
    outputFolder: config.outputFolder,
    pruneAfter: config.pruneAfter,
    pullZoneId: pullZone.Id,
  };

  await writeConfig(projectConfig);
  p.log.success(`Configuration saved to ${CONFIG_FILE}`);

  // Show dashboard link
  const dashboardUrl = `https://dash.bunny.net/cdn/${pullZone.Id}`;
  p.log.info(`Dashboard: ${pc.dim(dashboardUrl)}`);

  p.note(
    [
      "Build your project, commit the new configuration file and then deploy with:",
      "",
      `  ${pc.cyan("bn deploy")}`,
      "",
      `Your site will be live at ${pc.cyan(siteUrl)}. Please visit your Bunny.net Pull Zone dashboard to customise caching and other important settings.`,
    ].join("\n"),
    "Next Steps",
  );

  const setupCi = await p.confirm({
    message: "Set up a GitHub Actions workflow to deploy on push?",
    initialValue: true,
  });

  if (!p.isCancel(setupCi) && setupCi) {
    await ci();
    return;
  }

  p.log.info(`You can run ${pc.cyan("bn ci")} later to set this up.`);
  p.outro(pc.green("Setup complete!"));
}

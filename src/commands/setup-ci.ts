import * as p from "@clack/prompts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";
import { getCurrentBranch, getGitHubRepo, isGitRepo } from "../git.ts";

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

interface PackageManagerConfig {
  label: string;
  lockfiles: string[];
  defaultBuildCommand: string;
  /** YAML steps that prepare the runtime + dependencies. */
  setupSteps: string;
}

const PACKAGE_MANAGERS: Record<PackageManager, PackageManagerConfig> = {
  bun: {
    label: "bun",
    lockfiles: ["bun.lock", "bun.lockb"],
    defaultBuildCommand: "bun run build",
    setupSteps: `      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile`,
  },
  pnpm: {
    label: "pnpm",
    lockfiles: ["pnpm-lock.yaml"],
    defaultBuildCommand: "pnpm run build",
    setupSteps: `      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: pnpm

      - run: pnpm install --frozen-lockfile`,
  },
  yarn: {
    label: "yarn",
    lockfiles: ["yarn.lock"],
    defaultBuildCommand: "yarn build",
    setupSteps: `      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: yarn

      - run: yarn install --frozen-lockfile`,
  },
  npm: {
    label: "npm",
    lockfiles: ["package-lock.json"],
    defaultBuildCommand: "npm run build",
    setupSteps: `      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm

      - run: npm ci`,
  },
};

export async function detectPackageManager(
  cwd: string = process.cwd(),
): Promise<PackageManager | null> {
  for (const [pm, cfg] of Object.entries(PACKAGE_MANAGERS) as [
    PackageManager,
    PackageManagerConfig,
  ][]) {
    for (const lockfile of cfg.lockfiles) {
      if (await Bun.file(join(cwd, lockfile)).exists()) {
        return pm;
      }
    }
  }
  return null;
}

function buildWorkflow(opts: {
  packageManager: PackageManager;
  buildCommand: string;
  branch: string;
}): string {
  const cfg = PACKAGE_MANAGERS[opts.packageManager];
  // `bunx bunnyup deploy` requires the Bun runtime — add a setup step when the
  // build itself doesn't already provide it.
  const bunSetupForDeploy =
    opts.packageManager === "bun"
      ? ""
      : `

      - uses: oven-sh/setup-bun@v2`;

  return `name: Deploy to Bunny.net

on:
  push:
    branches: [${opts.branch}]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

${cfg.setupSteps}

      - run: ${opts.buildCommand}${bunSetupForDeploy}

      - run: bunx bunnyup deploy
        env:
          BUNNY_API_KEY: \${{ secrets.BUNNY_API_KEY }}
`;
}

export async function setupCi(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bunnyup setup-ci ")));

  if (!(await isGitRepo())) {
    p.cancel("Not a git repository. A git repo is required to set up CI.");
    process.exit(1);
  }

  const workflowDir = join(process.cwd(), ".github", "workflows");
  const workflowPath = join(workflowDir, "deploy.yml");

  if (await Bun.file(workflowPath).exists()) {
    const overwrite = await p.confirm({
      message: `${pc.dim(".github/workflows/deploy.yml")} already exists. Overwrite?`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Setup cancelled.");
      process.exit(1);
    }
  }

  const detectedPm = await detectPackageManager();
  const currentBranch = (await getCurrentBranch()) ?? "main";

  const onCancel = () => {
    p.cancel("Setup cancelled.");
    process.exit(1);
  };

  const packageManager = await p.select<PackageManager>({
    message: "Package manager:",
    initialValue: detectedPm ?? "bun",
    options: [
      { value: "bun", label: "bun" },
      { value: "pnpm", label: "pnpm" },
      { value: "yarn", label: "yarn" },
      { value: "npm", label: "npm" },
    ],
  });
  if (p.isCancel(packageManager)) onCancel();

  const defaultBuild =
    PACKAGE_MANAGERS[packageManager as PackageManager].defaultBuildCommand;
  const buildCommand = await p.text({
    message: "Build command:",
    defaultValue: defaultBuild,
    placeholder: defaultBuild,
  });
  if (p.isCancel(buildCommand)) onCancel();

  const branch = await p.text({
    message: "Deployment branch:",
    defaultValue: currentBranch,
    placeholder: currentBranch,
  });
  if (p.isCancel(branch)) onCancel();

  const config = {
    packageManager: packageManager as PackageManager,
    buildCommand: buildCommand as string,
    branch: branch as string,
  };

  const workflow = buildWorkflow({
    packageManager: config.packageManager,
    buildCommand: config.buildCommand,
    branch: config.branch,
  });

  try {
    await mkdir(workflowDir, { recursive: true });
    await Bun.write(workflowPath, workflow);
  } catch {
    p.cancel("Could not write the workflow file.");
    process.exit(1);
  }

  p.log.success(`Created ${pc.dim(".github/workflows/deploy.yml")}`);

  const repo = await getGitHubRepo();
  const secretName = "BUNNY_API_KEY";
  const secretsUrl = repo
    ? `https://github.com/${repo.owner}/${repo.repo}/settings/secrets/actions/new?name=${secretName}`
    : null;

  p.note(
    [
      `Add a repository secret named ${pc.cyan(secretName)} with your Bunny.net API key.`,
      "",
      secretsUrl
        ? `Open: ${pc.cyan(secretsUrl)}`
        : `In your repo on GitHub: Settings → Secrets and variables → Actions → New repository secret`,
    ].join("\n"),
    "Add GitHub Actions secret",
  );

  p.outro(
    pc.green(
      `CI configured. Commit ${pc.dim(".github/workflows/deploy.yml")} and push to ${pc.dim(config.branch)} to deploy.`,
    ),
  );
}

[![Open on npmx.dev](https://npmx.dev/api/registry/badge/version/bunnyup)](https://npmx.dev/package/bunnyup)
[![Open on npmx.dev](https://npmx.dev/api/registry/badge/license/bunnyup)](https://npmx.dev/package/bunnyup)
[![Open on npmx.dev](https://npmx.dev/api/registry/badge/downloads/bunnyup)](https://npmx.dev/package/bunnyup)

# bunnyup

CLI tool for deploying static sites to [Bunny.net](https://bunny.net). Go from zero to your site deployed across the globe in under a minute.

- Supports one-command rollbacks (Deployments are identified by their git hash)
- Sensible caching out of the box
- Deploy on push via the provided GitHub Actions example

_Note: Still in beta, I'm testing it on my own projects. Further configuration of CDN & Caching settings may still be required depending on your project. This project is not affiliated with bunny.net._

## Installation

Requires the [Bun](https://bun.sh) runtime installed. Installing & running using npm, pnpm, etc. will fail!

```bash
bun add -g bunnyup
```

## Quick Start

```bash
# 1. Authenticate
bn login

# 2. Set up your project
bn new

# 3. Commit Files (bn new creates a config file, bn deploy expects a clean repository)
git add . && git commit -m "setup bunnyup"

# 4. Build and deploy
npm run build && bn deploy
```

## Why

I wanted Vercel-like static site deployments with EU-based hosting.

Bunny.net has the infrastructure for great static site hosting, but no good way to iteratively ship to it. This CLI is the missing piece.

## Concept

Bunnyup simplifies the deployment of statically built sites to bunny.net. It follows the following deployment process:

1. Upload files to a new storage zone _(i.e. bucket)_, identified by the git commit hash.
2. Activate that deployment by pointing the pull zone _(i.e. CDN configuration)_ at the new storage zone
3. Prune deployments older than x days

Old deployments remain available until pruned and can be rolled back to at any time via `bn activate`.

The Pull Zone the CLI creates is long-lived and only reconfigured afterwards. By default, html, json, xml is uncached. Other assets are cached infinitely on the CDN and for 1 hour on browsers. Known, framework assets (\_next, \_astro, \_nuxt, \_app/immutable) are cached with `"public, max-age=31536000, immutable"` on the browser.

You may want to visit the Bunny.net dashboard after running `bn new` to make any applicable adjustments for your setup.

## Commands

| Command                 | Description                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bn login`              | Save your Bunny.net API key (this is stored securely in your OS Keychain via [Bun.secrets](https://bun.com/docs/runtime/secrets)) |
| `bn new`                | Configure a new site                                                                                                              |
| `bn deploy`             | Upload → activate → prune                                                                                                         |
| `bn upload`             | Upload files to a new version                                                                                                     |
| `bn activate [version]` | Switch to a git ref/hash (default: HEAD)                                                                                          |
| `bn prune`              | Delete old deployments                                                                                                            |

### Options

- `--no-prune` - Skip pruning old versions (deploy)
- `-f, --force` - Upload with uncommitted git changes (upload, deploy)
- `-y, --yes` - Skip confirmation prompts (prune)

Requires clean git working directory by default. Use `--force` to override.

### Configuration

`bn new` creates a `bunnyup.json` file:

```json
{
  "name": "my-site",
  "outputFolder": "dist",
  "pruneAfter": "30",
  "pullZoneId": 123456
}
```

- `pruneAfter` is the number of days after which old deployments will be deleted by `bn prune`

### CI/CD

Set the `BUNNY_API_KEY` environment variable. See `examples/github-deploy.yml` for a GitHub Actions example.

## Trying development branches / PRs

You can evaluate an unreleased branch or PR without touching the `bunnyup` you've installed globally for production deploys. The trick is to **never `bun link` or `bun add -g` from the checkout** — instead, invoke the source file directly with `bun`.

### One-time setup

```bash
# Clone outside any project directory you care about
git clone https://github.com/bcye/bunnyup ~/src/bunnyup-dev
cd ~/src/bunnyup-dev
bun install
```

### Run a specific branch or PR

```bash
cd ~/src/bunnyup-dev

# A branch
git fetch origin <branch-name> && git checkout <branch-name>

# Or a PR by number (works with the GitHub CLI)
gh pr checkout <pr-number>

# Invoke directly — no global install touched
bun ~/src/bunnyup-dev/src/cli.ts --version
bun ~/src/bunnyup-dev/src/cli.ts deploy
```

A throwaway shell alias makes this less verbose for the duration of your session:

```bash
alias bn-dev="bun $HOME/src/bunnyup-dev/src/cli.ts"
bn-dev deploy
```

Your production `bn` / `bunny` commands continue to resolve to the globally-installed version — confirm with `which bn` vs. `type bn-dev`.

### Test several PRs in parallel

Use `git worktree` so each PR has its own folder, no checkout-juggling:

```bash
cd ~/src/bunnyup-dev
git fetch origin pull/123/head:pr-123
git worktree add ../bunnyup-pr-123 pr-123
bun ../bunnyup-pr-123/src/cli.ts deploy
# When done:
git worktree remove ../bunnyup-pr-123
```

### Important: keep dev runs away from production resources

The dev CLI is isolated as a binary, but **two pieces of state are shared with your production install**:

1. **API key in the OS keychain.** `bn login` stores credentials under a fixed service name, so a dev branch will happily authenticate as you and can mutate real Bunny.net resources. Override it per-shell with a scoped or test-account key:
   ```bash
   export BUNNY_API_KEY=<test-account-key>   # takes precedence over the keychain
   bn-dev deploy
   ```
2. **`bunnyup.json` in the current directory.** Whichever folder you `cd` into decides which pull zone the dev CLI talks to. Always test from a **separate sandbox project** with its own `bunnyup.json` pointing at a dedicated test pull/storage zone — don't run an unverified `bn-dev deploy` from your production site folder.

A safe smoke-test directory looks like:

```bash
mkdir ~/bunnyup-sandbox && cd ~/bunnyup-sandbox
export BUNNY_API_KEY=<test-account-key>
bn-dev login        # optional; env var already covers auth
bn-dev new          # creates an isolated bunnyup.json + test zone
echo "<h1>hi</h1>" > dist/index.html
bn-dev deploy
```

### Run the test suite

```bash
cd ~/src/bunnyup-dev
bun install
bun test
bun run typecheck
```

## Roadmap

- [ ] Tailor setup (i.e. caching) to framework in use
- [ ] Support preview deployments

Please open an issue if you want to help work on these.

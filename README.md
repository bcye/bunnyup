# bunnyup

CLI tool for deploying static sites to [Bunny.net](https://bunny.net) CDN.

_Note: This CLI is in beta and I am using it on personal projects. Further CDN configuration is up to you, by default all assets are cached except html, json, xml -- this should be fine for modern frameworks._

## Installation

Requires [Bun](https://bun.sh) runtime.

```bash
bun add -g bunnyup
```

## Quick Start

```bash
# 1. Authenticate
bn login

# 2. Set up your project
bn new

# 3. Build and deploy
npm run build && bn deploy
```

## Concept

Bunnyup simplifies the deployment of statically built sites to bunny.net. It follows the following deployment process:

1. Upload files to a new storage zone _(i.e. bucket)_, identified by the git commit hash.
2. Activate that deployment by pointing the pull zone _(i.e. CDN configuration)_ at the new storage zone
3. Prune deployments older than x days

Old deployments remain available until pruned and can be rolled back to at any time via `bn activate`.

The Pull Zone the CLI creates is long-lived and only reconfigured afterwards. By default, html, json, xml is uncached. Other assets are cached infinitely on the CDN and for 1 hour on browsers. Known, framework assets (\_next, \_astro, \_nuxt, \_app/immutable) are cached with `"public, max-age=31536000, immutable"` on the browser.

You may want to visit the Bunny.net dashboard after running `bn new` to make any applicable adjustments for your setup.

## Commands

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `bn login`              | Save your Bunny.net API key              |
| `bn new`                | Configure a new site                     |
| `bn deploy`             | Upload → activate → prune                |
| `bn upload`             | Upload files to a new version            |
| `bn activate [version]` | Switch to a git ref/hash (default: HEAD) |
| `bn prune`              | Delete old deployments                   |

### Options

- `--no-prune` - Skip pruning old versions (deploy)
- `-f, --force` - Upload with uncommitted git changes (upload, deploy)
- `-y, --yes` - Skip confirmation prompts (prune)

Requires clean git working directory by default. Use `--force` to override.

## Configuration

`bn new` creates a `bunnyup.json` file:

```json
{
  "name": "my-site",
  "outputFolder": "dist",
  "pruneAfter": "30",
  "pullZoneId": 123456
}
```

- `pruneAfter` is the number of days after which old deployments are deleted

## CI/CD

Set the `BUNNY_API_KEY` environment variable. See `examples/github-deploy.yml` for a GitHub Actions example.

## API Key

Get your API key from: https://dash.bunny.net/account/api-key

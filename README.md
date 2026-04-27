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
| `bn ci`                 | Generate a GitHub Actions workflow that deploys on push                                                                           |
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

Run `bn ci` to generate a GitHub Actions workflow tailored to your package manager and build command. You'll be linked to your repo's secrets page to add the `BUNNY_API_KEY` secret. See `examples/github-deploy.yml` for a hand-written reference.

## Roadmap

- [ ] Tailor setup (i.e. caching) to framework in use
- [ ] Support preview deployments

Please open an issue if you want to help work on these.

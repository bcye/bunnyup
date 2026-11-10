[![Open on npmx.dev](https://npmx.dev/api/registry/badge/version/bunnyup)](https://npmx.dev/package/bunnyup)
[![Open on npmx.dev](https://npmx.dev/api/registry/badge/license/bunnyup)](https://npmx.dev/package/bunnyup)
[![Open on npmx.dev](https://npmx.dev/api/registry/badge/downloads/bunnyup)](https://npmx.dev/package/bunnyup)

# bunnyup

CLI tool for deploying static sites to [Bunny.net](https://bunny.net). Go from zero to your site deployed across the globe in under a minute.

- Supports one-command rollbacks (Deployments are identified by their git hash)
- Sensible caching out of the box
- Preview deployments per pull request, each on its own URL
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

### Preview deployments

`bn preview deploy <name>` uploads the current commit like `bn upload` and points a separate preview pull zone at it, served at `https://<project>-pre-<name>.b-cdn.net`. The first run creates the pull zone; later runs re-point it and purge its cache. `bn preview remove <name>` deletes the preview pull zone, and its deployment unless production or another preview still serves it.

- Preview pull zones are created with bunnyup's standard settings. Changes you make to the production pull zone in the Bunny.net dashboard are **not** copied to previews.
- Previews and production share deployments: if production later activates a commit that was previewed, nothing is uploaded again.
- Previews expire with their deployment: when `bn prune` deletes a storage zone older than `pruneAfter`, any preview pointing at it is deleted too.
- Preview names may contain lowercase letters, numbers and hyphens. Because `-pre-` separates project and preview in pull zone names, neither project names nor preview names may contain `pre` as a hyphen-separated word (e.g. `pre-launch`). Words like `preview` are fine.

The example workflows open or update a preview named `pr-<number>` on every push to a pull request and remove it when the pull request is merged or closed.

The Pull Zone the CLI creates is long-lived and only reconfigured afterwards. By default, html, json, xml is uncached. Other assets are cached infinitely on the CDN and for 1 hour on browsers. Known, framework assets (\_next, \_astro, \_nuxt, \_app/immutable) are cached with `"public, max-age=31536000, immutable"` on the browser.

You may want to visit the Bunny.net dashboard after running `bn new` to make any applicable adjustments for your setup.

### Caching

Caching is configured by default, oriented around framework-built static sites, with the following settings. CDN Cache is not purged in between deployments. Uncached content is served from the 15 edge storage regions.

| CDN Cache  | Browser Cache                           | Assets                                                     |
| ---------- | --------------------------------------- | ---------------------------------------------------------- |
| not cached | not cached                              | html, json, xml                                            |
| 3 hours    | `public, max-age=31536000, immutable`   | Framework assets (\_next, \_astro, \_nuxt, \_app/immutable) |
| 3 hours    | 3 hours                                 | All other assets                                           |

## Commands

| Command                 | Description                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bn login`              | Save your Bunny.net API key (this is stored securely in your OS Keychain via [Bun.secrets](https://bun.com/docs/runtime/secrets)) |
| `bn new`                | Configure a new site                                                                                                              |
| `bn deploy`             | Upload → activate → prune                                                                                                         |
| `bn upload`             | Upload files to a new version                                                                                                     |
| `bn activate [version]` | Switch to a git ref/hash (default: HEAD)                                                                                          |
| `bn prune`              | Delete old deployments                                                                                                            |
| `bn preview deploy <name>` | Upload the current commit and create or update the named preview                                                              |
| `bn preview remove <name>` | Delete the named preview                                                                                                       |
| `bn cleanup`            | Delete the pull zone, preview pull zones and all storage zones for this project on Bunny.net                                      |

### Options

- `--no-prune` - Skip pruning old versions (deploy)
- `-f, --force` - Upload with uncommitted git changes (upload, deploy, preview deploy)
- `-y, --yes` - Skip confirmation prompts (prune, cleanup)

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

- `pruneAfter` is the number of days after which old deployments, and previews pointing at them, will be deleted by `bn prune`

### CI/CD

Set the `BUNNY_API_KEY` environment variable. See `examples/github-deploy.yml` for a GitHub Actions example.

For preview deployments, add `examples/github-preview-deploy.yml` and `examples/github-preview-remove.yml` to `.github/workflows/`.

## Roadmap

- [x] Support preview deployments

Please open an issue if you want to help work on these.

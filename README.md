# bunnyup

CLI tool for deploying static sites to [Bunny.net](https://bunny.net) CDN.

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

## Commands

| Command | Description |
|---------|-------------|
| `bn login` | Save your Bunny.net API key |
| `bn new` | Configure a new site |
| `bn deploy` | Upload → activate → prune |
| `bn upload` | Upload files to a new version |
| `bn activate [version]` | Switch to a git ref/hash (default: HEAD) |
| `bn prune` | Delete old deployments |

### Options

- `bn deploy --no-prune` - Skip pruning old versions
- `bn deploy -y` / `bn prune -y` - Skip confirmation prompts

The output folder is always read from `.bunny.json` configuration.

## Configuration

`bn new` creates a `.bunny.json` file:

```json
{
  "name": "my-site",
  "outputFolder": "dist",
  "pruneAfter": "30d",
  "pullZoneId": 123456
}
```

## CI/CD

Set the `BUNNY_API_KEY` environment variable. See `examples/github-deploy.yml` for a GitHub Actions example.

## API Key

Get your API key from: https://dash.bunny.net/account/api-key

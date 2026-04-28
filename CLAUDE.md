
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

When making changes, add or update tests where applicable to cover the new behavior, bug fix, or refactor. Place tests in `tests/` and run `bun test` to confirm they pass before committing.

## This Project: bunnyup

CLI tool for deploying static sites to Bunny.net CDN.

### Development

```bash
# Run CLI in dev mode
bun run dev -- <command>

# Run tests
bun test

# Type check
bun run typecheck

# Build for npm
bun run build
```

### Project Structure

- `src/cli.ts` - Commander entry point
- `src/commands/` - Individual command implementations
- `src/api.ts` - Bunny.net API client
- `src/config.ts` - Configuration and secrets handling
- `src/git.ts` - Git utilities
- `tests/` - Test files

### Bunny.net API Docs

- [Pull Zone API](https://docs.bunny.net/reference/pullzonepublic_index)
- [Storage Zone API](https://docs.bunny.net/reference/storagezonepublic_index)
- [Edge Storage API](https://docs.bunny.net/reference/edge-storage-api)

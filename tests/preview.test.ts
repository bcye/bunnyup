import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { $ } from "bun";
import { join } from "path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { previewDeploy, previewRemove } from "../src/commands/preview.ts";
import type { PullZone, StorageZone } from "../src/api.ts";

/**
 * A minimal in-memory stand-in for the Bunny.net API, enough for the preview
 * commands. Every request is recorded as "METHOD /path".
 */
class FakeBunny {
  pullZones: PullZone[] = [];
  storageZones: StorageZone[] = [];
  calls: string[] = [];
  private nextId = 1000;

  addPullZone(Id: number, Name: string, StorageZoneId: number): PullZone {
    const zone = {
      Id,
      Name,
      StorageZoneId,
      Hostnames: [{ Value: `${Name}.b-cdn.net` }],
    } as unknown as PullZone;
    this.pullZones.push(zone);
    return zone;
  }

  addStorageZone(Id: number, Name: string): StorageZone {
    const zone: StorageZone = {
      Id,
      Name,
      Password: `pw-${Id}`,
      DateModified: new Date().toISOString(),
      Region: "DE",
    };
    this.storageZones.push(zone);
    return zone;
  }

  handle = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    this.calls.push(
      `${method} ${url.host === "storage.bunnycdn.com" ? "storage:" : ""}${url.pathname}`,
    );
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });
    const noContent = () => new Response(null, { status: 204 });
    const body =
      init?.body && typeof init.body === "string"
        ? JSON.parse(init.body)
        : undefined;

    if (url.host === "storage.bunnycdn.com") {
      return method === "GET" ? json([]) : json({}, 201);
    }

    const path = url.pathname;
    let m: RegExpMatchArray | null;

    if (method === "GET" && path === "/pullzone") {
      const search = url.searchParams.get("search") ?? "";
      return json(this.pullZones.filter((z) => z.Name.includes(search)));
    }
    if (method === "POST" && path === "/pullzone/checkavailability") {
      return json({
        Available: !this.pullZones.some((z) => z.Name === body.Name),
      });
    }
    if (method === "POST" && path === "/pullzone") {
      return json(
        this.addPullZone(this.nextId++, body.Name, body.StorageZoneId),
        201,
      );
    }
    if ((m = path.match(/^\/pullzone\/(\d+)(\/.*)?$/))) {
      const id = Number(m[1]);
      const zone = this.pullZones.find((z) => z.Id === id);
      if (!zone) return new Response("Not Found", { status: 404 });
      if (m[2]) return noContent(); // edge rules, purgeCache
      if (method === "GET") return json(zone);
      if (method === "POST") {
        zone.StorageZoneId = body.StorageZoneId;
        return noContent();
      }
      if (method === "DELETE") {
        this.pullZones = this.pullZones.filter((z) => z.Id !== id);
        return noContent();
      }
    }
    if (method === "GET" && path === "/storagezone") {
      return json(this.storageZones);
    }
    if (method === "POST" && path === "/storagezone") {
      return json(this.addStorageZone(this.nextId++, body.Name), 201);
    }
    if (method === "DELETE" && (m = path.match(/^\/storagezone\/(\d+)$/))) {
      this.storageZones = this.storageZones.filter(
        (z) => z.Id !== Number(m![1]),
      );
      return noContent();
    }
    return new Response(`Unhandled ${method} ${path}`, { status: 500 });
  };
}

const PRODUCTION_PULL_ZONE_ID = 1;

let bunny: FakeBunny;
let repo: string;
let gitHash: string;
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const originalExit = process.exit;
const originalApiKey = process.env.BUNNY_API_KEY;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "bunnyup-preview-"));
  await Bun.write(
    join(repo, "bunnyup.json"),
    JSON.stringify({
      name: "blog",
      outputFolder: "dist",
      pruneAfter: "30",
      pullZoneId: PRODUCTION_PULL_ZONE_ID,
    }),
  );
  await Bun.write(join(repo, ".gitignore"), "dist\n");
  await $`git init -q && git add . && git -c user.name=test -c user.email=test@example.com commit -q -m init`
    .cwd(repo)
    .quiet();
  gitHash = (await $`git rev-parse --short HEAD`.cwd(repo).text()).trim();
  await mkdir(join(repo, "dist"));
  await Bun.write(join(repo, "dist/index.html"), "<h1>hi</h1>");

  process.chdir(repo);
  process.env.BUNNY_API_KEY = "test-api-key";
  process.exit = mock((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as typeof process.exit;

  bunny = new FakeBunny();
  globalThis.fetch = mock(bunny.handle) as unknown as typeof fetch;

  // Production serves an existing deployment
  bunny.addStorageZone(10, "blog-aaaaaaa");
  bunny.addPullZone(PRODUCTION_PULL_ZONE_ID, "blog", 10);
});

afterEach(async () => {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  process.exit = originalExit;
  if (originalApiKey === undefined) delete process.env.BUNNY_API_KEY;
  else process.env.BUNNY_API_KEY = originalApiKey;
  await rm(repo, { recursive: true, force: true });
});

describe("preview deploy", () => {
  test("creates a preview pull zone pointing at the new deployment", async () => {
    const url = await previewDeploy("pr-42", { nested: true });

    expect(url).toBe("https://blog-pre-pr-42.b-cdn.net");
    const deployment = bunny.storageZones.find(
      (z) => z.Name === `blog-${gitHash}`,
    );
    expect(deployment).toBeDefined();
    const preview = bunny.pullZones.find((z) => z.Name === "blog-pre-pr-42");
    expect(preview?.StorageZoneId).toBe(deployment!.Id);
    expect(bunny.calls).toContain(
      `POST /pullzone/${preview!.Id}/edgerules/addOrUpdate`,
    );
    expect(bunny.calls).toContain(
      "PUT storage:/" + `blog-${gitHash}/index.html`,
    );

    // Production is untouched
    expect(
      bunny.pullZones.find((z) => z.Id === PRODUCTION_PULL_ZONE_ID)
        ?.StorageZoneId,
    ).toBe(10);
  });

  test("updates an existing preview in place and purges its cache", async () => {
    bunny.addStorageZone(20, "blog-bbbbbbb");
    const existing = bunny.addPullZone(2, "blog-pre-pr-42", 20);

    await previewDeploy("pr-42", { nested: true });

    const deployment = bunny.storageZones.find(
      (z) => z.Name === `blog-${gitHash}`,
    );
    expect(existing.StorageZoneId).toBe(deployment!.Id);
    expect(
      bunny.pullZones.filter((z) => z.Name === "blog-pre-pr-42"),
    ).toHaveLength(1);
    expect(bunny.calls).toContain("POST /pullzone/2/purgeCache");
    expect(bunny.calls).not.toContain("POST /pullzone");
  });

  test("re-uploads into an existing deployment instead of failing", async () => {
    bunny.addStorageZone(30, `blog-${gitHash}`);

    await previewDeploy("pr-42", { nested: true });

    expect(
      bunny.storageZones.filter((z) => z.Name === `blog-${gitHash}`),
    ).toHaveLength(1);
    expect(bunny.calls).toContain(
      "PUT storage:/" + `blog-${gitHash}/index.html`,
    );
    expect(
      bunny.pullZones.find((z) => z.Name === "blog-pre-pr-42")?.StorageZoneId,
    ).toBe(30);
  });

  test("rejects invalid preview names before touching Bunny.net", async () => {
    await expect(previewDeploy("pre-launch", { nested: true })).rejects.toThrow(
      "process.exit(1)",
    );
    await expect(previewDeploy("PR-42", { nested: true })).rejects.toThrow(
      "process.exit(1)",
    );
    expect(bunny.calls).toEqual([]);
  });

  test("fails without uploading when the pull zone name is taken elsewhere", async () => {
    // A pull zone with the preview's name that we don't recognise as ours
    // (e.g. owned by another account) shows up only via checkavailability.
    globalThis.fetch = mock(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/pullzone/checkavailability")) {
        bunny.calls.push("POST /pullzone/checkavailability");
        return new Response(JSON.stringify({ Available: false }), {
          status: 200,
        });
      }
      return bunny.handle(input, init);
    }) as unknown as typeof fetch;

    await expect(previewDeploy("pr-42", { nested: true })).rejects.toThrow(
      "process.exit(1)",
    );
    expect(bunny.calls.some((c) => c.startsWith("POST /storagezone"))).toBe(
      false,
    );
  });
});

describe("preview remove", () => {
  test("deletes the preview pull zone and its unused deployment", async () => {
    bunny.addStorageZone(20, "blog-bbbbbbb");
    bunny.addPullZone(2, "blog-pre-pr-42", 20);

    const removed = await previewRemove("pr-42", { nested: true });

    expect(removed).toBe(true);
    expect(bunny.pullZones.map((z) => z.Id)).toEqual([PRODUCTION_PULL_ZONE_ID]);
    expect(bunny.storageZones.map((z) => z.Id)).toEqual([10]);
  });

  test("keeps the deployment when production serves it", async () => {
    bunny.addPullZone(2, "blog-pre-pr-42", 10);

    await previewRemove("pr-42", { nested: true });

    expect(bunny.pullZones.map((z) => z.Id)).toEqual([PRODUCTION_PULL_ZONE_ID]);
    expect(bunny.storageZones.map((z) => z.Id)).toEqual([10]);
  });

  test("keeps the deployment when another preview serves it", async () => {
    bunny.addStorageZone(20, "blog-bbbbbbb");
    bunny.addPullZone(2, "blog-pre-pr-42", 20);
    bunny.addPullZone(3, "blog-pre-pr-43", 20);

    await previewRemove("pr-42", { nested: true });

    expect(bunny.pullZones.map((z) => z.Id)).toEqual([
      PRODUCTION_PULL_ZONE_ID,
      3,
    ]);
    expect(bunny.storageZones.map((z) => z.Id)).toEqual([10, 20]);
  });

  test("succeeds without changes when the preview doesn't exist", async () => {
    const removed = await previewRemove("pr-42", { nested: true });

    expect(removed).toBe(false);
    expect(bunny.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  test("only matches the exact preview name", async () => {
    bunny.addStorageZone(20, "blog-bbbbbbb");
    bunny.addPullZone(2, "blog-pre-pr-420", 20);

    const removed = await previewRemove("pr-42", { nested: true });

    expect(removed).toBe(false);
    expect(bunny.pullZones.map((z) => z.Id)).toEqual([
      PRODUCTION_PULL_ZONE_ID,
      2,
    ]);
  });
});

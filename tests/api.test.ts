import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import {
  checkPullZoneAvailability,
  createPullZone,
  createStorageZone,
  deletePullZone,
  deleteStorageZone,
  listStorageZones,
  listFiles,
  validateApiKey,
  BunnyApiError,
} from "../src/api.ts";

const TEST_API_KEY = "test-api-key";

// Store original fetch
const originalFetch = globalThis.fetch;

// Helper to mock fetch
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("checkPullZoneAvailability", () => {
  test("returns true when available", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ Available: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await checkPullZoneAvailability(TEST_API_KEY, "test-site");
    expect(result).toBe(true);
  });

  test("returns false when not available", async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ Available: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await checkPullZoneAvailability(TEST_API_KEY, "taken-site");
    expect(result).toBe(false);
  });
});

describe("createPullZone", () => {
  test("creates pull zone and returns data", async () => {
    const mockPullZone = {
      Id: 123,
      Name: "test-site",
      StorageZoneId: 456,
      Hostnames: [{ Value: "test-site.b-cdn.net" }],
    };

    mockFetch(() =>
      new Response(JSON.stringify(mockPullZone), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await createPullZone(TEST_API_KEY, "test-site", 456);
    expect(result.Id).toBe(123);
    expect(result.Name).toBe("test-site");
  });
});

describe("createStorageZone", () => {
  test("creates storage zone and returns data", async () => {
    const mockStorageZone = {
      Id: 789,
      Name: "test-site-abc123",
      Password: "storage-password",
      DateModified: "2025-01-14T12:00:00",
      Region: "DE",
    };

    mockFetch(() =>
      new Response(JSON.stringify(mockStorageZone), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await createStorageZone(TEST_API_KEY, "test-site-abc123");
    expect(result.Id).toBe(789);
    expect(result.Password).toBe("storage-password");
  });
});

describe("listStorageZones", () => {
  test("returns array of storage zones", async () => {
    const mockZones = [
      { Id: 1, Name: "zone-1", Password: "pw1", DateModified: "2025-01-01", Region: "DE" },
      { Id: 2, Name: "zone-2", Password: "pw2", DateModified: "2025-01-02", Region: "DE" },
    ];

    mockFetch(() =>
      new Response(JSON.stringify(mockZones), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await listStorageZones(TEST_API_KEY);
    expect(result).toHaveLength(2);
    expect(result[0]?.Name).toBe("zone-1");
  });

  test("handles Items wrapper response", async () => {
    const mockResponse = {
      Items: [
        { Id: 1, Name: "zone-1", Password: "pw1", DateModified: "2025-01-01", Region: "DE" },
      ],
    };

    mockFetch(() =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await listStorageZones(TEST_API_KEY);
    expect(result).toHaveLength(1);
  });
});

describe("validateApiKey", () => {
  test("returns true for valid key", async () => {
    mockFetch(() =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await validateApiKey(TEST_API_KEY);
    expect(result).toBe(true);
  });

  test("returns false for invalid key", async () => {
    mockFetch(() =>
      new Response("Unauthorized", { status: 401 })
    );

    const result = await validateApiKey("bad-key");
    expect(result).toBe(false);
  });
});

describe("listFiles", () => {
  test("GETs the storage zone root with AccessKey", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAccessKey: string | null = "";

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      const headers = new Headers(init?.headers);
      capturedAccessKey = headers.get("AccessKey");
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await listFiles("my-zone", "storage-pw");
    expect(capturedMethod).toBe("GET");
    expect(capturedUrl).toBe("https://storage.bunnycdn.com/my-zone/");
    expect(capturedAccessKey).toBe("storage-pw");
    expect(result).toEqual([]);
  });

  test("returns parsed file entries", async () => {
    const mockFiles = [
      {
        Guid: "abc",
        StorageZoneName: "my-zone",
        Path: "/my-zone/",
        ObjectName: "index.html",
        Length: 1234,
        LastChanged: "2026-01-01T00:00:00",
        IsDirectory: false,
        ContentType: "text/html",
      },
    ];

    mockFetch(() =>
      new Response(JSON.stringify(mockFiles), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await listFiles("my-zone", "storage-pw");
    expect(result).toHaveLength(1);
    expect(result[0]?.ObjectName).toBe("index.html");
    expect(result[0]?.IsDirectory).toBe(false);
  });

  test("normalizes subpath to a trailing slash", async () => {
    let capturedUrl = "";
    mockFetch((url) => {
      capturedUrl = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await listFiles("my-zone", "pw", "/assets/");
    expect(capturedUrl).toBe("https://storage.bunnycdn.com/my-zone/assets/");
  });

  test("throws BunnyApiError with status on 401", async () => {
    mockFetch(() => new Response("Unauthorized", { status: 401 }));

    try {
      await listFiles("my-zone", "bad-pw");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(BunnyApiError);
      if (error instanceof BunnyApiError) {
        expect(error.status).toBe(401);
      }
    }
  });
});

describe("deletePullZone", () => {
  test("DELETEs the pull zone by id", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAccessKey: string | null = "";

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      const headers = new Headers(init?.headers);
      capturedAccessKey = headers.get("AccessKey");
      return new Response(null, { status: 204 });
    });

    await deletePullZone(TEST_API_KEY, 123);
    expect(capturedMethod).toBe("DELETE");
    expect(capturedUrl).toBe("https://api.bunny.net/pullzone/123");
    expect(capturedAccessKey).toBe(TEST_API_KEY);
  });

  test("throws BunnyApiError with status on 404", async () => {
    mockFetch(() => new Response("Not Found", { status: 404 }));

    try {
      await deletePullZone(TEST_API_KEY, 999);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(BunnyApiError);
      if (error instanceof BunnyApiError) {
        expect(error.status).toBe(404);
      }
    }
  });
});

describe("deleteStorageZone", () => {
  test("DELETEs the storage zone without cascading to linked pull zones", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    mockFetch((url, init) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      return new Response(null, { status: 204 });
    });

    await deleteStorageZone(TEST_API_KEY, 456);
    expect(capturedMethod).toBe("DELETE");
    expect(capturedUrl).toBe(
      "https://api.bunny.net/storagezone/456?deleteLinkedPullZones=false",
    );
  });

  test("throws BunnyApiError with status on 404", async () => {
    mockFetch(() => new Response("Not Found", { status: 404 }));

    try {
      await deleteStorageZone(TEST_API_KEY, 999);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(BunnyApiError);
      if (error instanceof BunnyApiError) {
        expect(error.status).toBe(404);
      }
    }
  });
});

describe("BunnyApiError", () => {
  test("throws on non-2xx response", async () => {
    mockFetch(() =>
      new Response("Not Found", { status: 404 })
    );

    await expect(createStorageZone(TEST_API_KEY, "test")).rejects.toBeInstanceOf(BunnyApiError);
  });

  test("includes status and body in error", async () => {
    mockFetch(() =>
      new Response("Error message", { status: 400 })
    );

    try {
      await createStorageZone(TEST_API_KEY, "test");
      expect(true).toBe(false); // Should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(BunnyApiError);
      if (error instanceof BunnyApiError) {
        expect(error.status).toBe(400);
        expect(error.body).toBe("Error message");
      }
    }
  });
});

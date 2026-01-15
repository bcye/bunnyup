const API_BASE = "https://api.bunny.net";

export interface PullZone {
  Id: number;
  Name: string;
  StorageZoneId: number;
  Hostnames: Array<{ Value: string }>;
}

export interface StorageZone {
  Id: number;
  Name: string;
  Password: string;
  DateModified: string;
  Region: string;
}

export class BunnyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string
  ) {
    super(message);
    this.name = "BunnyApiError";
  }
}

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BunnyApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      text
    );
  }

  return response.json() as Promise<T>;
}

async function requestVoid(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<void> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      AccessKey: apiKey,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BunnyApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status,
      text
    );
  }
}

// ============ Pull Zone API ============

export async function checkPullZoneAvailability(
  apiKey: string,
  name: string
): Promise<boolean> {
  const result = await request<{ Available: boolean }>(
    apiKey,
    "POST",
    "/pullzone/checkavailability",
    { Name: name }
  );
  return result.Available;
}

export async function createPullZone(
  apiKey: string,
  name: string,
  storageZoneId: number
): Promise<PullZone> {
  return request<PullZone>(apiKey, "POST", "/pullzone", {
    Name: name,
    Type: 0,
    OriginType: 2,
    StorageZoneId: storageZoneId,
    OriginHostHeader: null,
    OriginUrl: null,
    EnableGeoZoneEU: true,
    EnableGeoZoneASIA: true,
    EnableGeoZoneUS: true,
    EnableGeoZoneAF: true,
    EnableGeoZoneSA: true,
  });
}

export async function getPullZone(apiKey: string, id: number): Promise<PullZone> {
  return request<PullZone>(apiKey, "GET", `/pullzone/${id}`);
}

export async function updatePullZoneStorageZone(
  apiKey: string,
  pullZoneId: number,
  storageZoneId: number
): Promise<void> {
  await request<PullZone>(apiKey, "POST", `/pullzone/${pullZoneId}`, {
    StorageZoneId: storageZoneId,
  });
  // Returns updated PullZone but we don't need it
}

// ============ Storage Zone API ============

export async function createStorageZone(
  apiKey: string,
  name: string
): Promise<StorageZone> {
  return request<StorageZone>(apiKey, "POST", "/storagezone", {
    Name: name,
    Region: "DE",
    ZoneTier: "Edge",
    ReplicationRegions: [
      "DE", "UK", "ES", "CZ", "SE", "LA", "MI", "NY", "WA", "HK", "SYD", "JP", "BR", "JH"
    ],
  });
}

export async function listStorageZones(apiKey: string): Promise<StorageZone[]> {
  const result = await request<{ Items: StorageZone[] } | StorageZone[]>(
    apiKey,
    "GET",
    "/storagezone?page=0&perPage=1000&includeDeleted=false"
  );
  // API returns either { Items: [...] } or just [...]
  return Array.isArray(result) ? result : result.Items;
}

export async function deleteStorageZone(
  apiKey: string,
  id: number
): Promise<void> {
  await requestVoid(
    apiKey,
    "DELETE",
    `/storagezone/${id}?deleteLinkedPullZones=false`
  );
}

export async function findStorageZoneByName(
  apiKey: string,
  name: string
): Promise<StorageZone | undefined> {
  const zones = await listStorageZones(apiKey);
  return zones.find((z) => z.Name === name);
}

// ============ Storage Upload API ============

const STORAGE_BASE = "https://storage.bunnycdn.com";

export async function uploadFile(
  storageZoneName: string,
  password: string,
  remotePath: string,
  content: ArrayBuffer
): Promise<void> {
  const url = `${STORAGE_BASE}/${storageZoneName}/${remotePath}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: password,
      "Content-Type": "application/octet-stream",
      Accept: "application/json",
    },
    body: content,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BunnyApiError(
      `Upload failed: ${response.status} ${response.statusText}`,
      response.status,
      text
    );
  }
}

// ============ Validation ============

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // List storage zones as a simple validation
    await listStorageZones(apiKey);
    return true;
  } catch (error) {
    if (error instanceof BunnyApiError && error.status === 401) {
      return false;
    }
    throw error;
  }
}

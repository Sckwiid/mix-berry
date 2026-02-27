import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ImageProvider = "pexels" | "pixabay" | "unsplash";

export interface ImageSuggestion {
  url: string;
  thumbUrl: string | null;
  provider: ImageProvider;
  author: string | null;
  width: number | null;
  height: number | null;
}

interface CacheEntry {
  key: string;
  query: string;
  createdAt: number;
  expiresAt: number;
  providers: ImageProvider[];
  items: ImageSuggestion[];
}

interface CacheFileShape {
  version: 1;
  updatedAt: number;
  entries: CacheEntry[];
}

interface CacheStore {
  entries: Map<string, CacheEntry>;
  writePromise: Promise<void> | null;
}

export interface ImageSuggestionParams {
  title?: string;
  tags?: string[];
  limit?: number;
  forceRefresh?: boolean;
}

export interface ImageSuggestionResponse {
  query: string;
  cacheKey: string;
  cacheHit: boolean;
  providersUsed: ImageProvider[];
  items: ImageSuggestion[];
}

const CACHE_FILE_VERSION = 1;
const CACHE_TTL_SECONDS = Math.max(
  3600,
  Number(process.env.IMAGE_CACHE_TTL_SECONDS ?? String(60 * 60 * 24 * 14))
);
const EMPTY_CACHE_TTL_SECONDS = Math.min(CACHE_TTL_SECONDS, 60 * 60 * 6);
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_SEED_PATH = path.join(process.cwd(), "data", "image-suggestions-cache.json");
const CACHE_RUNTIME_PATH = process.env.IMAGE_CACHE_PATH?.trim() || path.join("/tmp", "smoothies-image-suggestions-cache.json");

const STOP_TERMS = new Set([
  "smoothie",
  "smoothies",
  "recette",
  "recipe",
  "drink",
  "boisson",
  "cube",
  "cubes",
  "glace",
  "glacons",
  "glaçons",
  "eau",
  "water",
  "sucre",
  "sugar",
  "yaourt",
  "yogurt",
  "lait",
  "milk"
]);

const TERM_TRANSLATION: Record<string, string> = {
  banane: "banana",
  bananes: "banana",
  fraise: "strawberry",
  fraises: "strawberry",
  framboise: "raspberry",
  framboises: "raspberry",
  myrtille: "blueberry",
  myrtilles: "blueberry",
  mangue: "mango",
  ananas: "pineapple",
  kiwi: "kiwi",
  peche: "peach",
  peches: "peach",
  pêche: "peach",
  pêches: "peach",
  pomme: "apple",
  pommes: "apple",
  poire: "pear",
  poires: "pear",
  orange: "orange",
  oranges: "orange",
  citron: "lemon",
  citrons: "lemon",
  lime: "lime",
  limes: "lime",
  raisin: "grape",
  raisins: "grape",
  avocat: "avocado",
  avocats: "avocado",
  coco: "coconut",
  noix: "nut",
  pasteque: "watermelon",
  pastèque: "watermelon",
  melon: "melon"
};

function normalizeTerm(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTokens(input: string) {
  return normalizeTerm(input)
    .split(/[\s-]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pickQueryTerms(title: string | undefined, tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  const consume = (value: string) => {
    for (const token of splitTokens(value)) {
      if (token.length < 3 || STOP_TERMS.has(token)) {
        continue;
      }
      const translated = TERM_TRANSLATION[token] || token;
      if (seen.has(translated)) {
        continue;
      }
      seen.add(translated);
      result.push(translated);
      if (result.length >= 5) {
        return;
      }
    }
  };

  for (const tag of tags) {
    consume(tag);
    if (result.length >= 5) {
      break;
    }
  }

  if (result.length < 3 && title) {
    consume(title);
  }

  return result;
}

function buildImageQuery(title: string | undefined, tags: string[]) {
  const terms = pickQueryTerms(title, tags);
  const parts = [...terms];
  if (!parts.includes("smoothie")) {
    parts.push("smoothie");
  }
  if (!parts.includes("drink")) {
    parts.push("drink");
  }
  return parts.join(" ").trim() || "fruit smoothie drink";
}

function makeCacheKey(query: string, limit: number) {
  return createHash("sha1").update(`${query}|${limit}`).digest("hex");
}

function clampLimit(raw: number | undefined) {
  if (!raw || Number.isNaN(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(raw)));
}

function ensureHttpsUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }
  if (!/^https?:\/\//i.test(raw)) {
    return null;
  }
  return raw;
}

function sanitizeItems(items: ImageSuggestion[]) {
  const seen = new Set<string>();
  const output: ImageSuggestion[] = [];

  for (const item of items) {
    const url = ensureHttpsUrl(item.url);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    output.push({
      ...item,
      url,
      thumbUrl: ensureHttpsUrl(item.thumbUrl) || null
    });
  }

  return output;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFromPexels(query: string, limit: number): Promise<ImageSuggestion[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) {
    return [];
  }

  try {
    const url = `https://api.pexels.com/v1/search?${new URLSearchParams({
      query,
      per_page: String(Math.max(limit, 4)),
      orientation: "landscape"
    }).toString()}`;
    const json = (await fetchJsonWithTimeout(url, {
      headers: {
        Authorization: key
      },
      cache: "no-store"
    })) as {
      photos?: Array<{
        width?: number;
        height?: number;
        photographer?: string;
        src?: {
          large2x?: string;
          large?: string;
          medium?: string;
          small?: string;
        };
      }>;
    };

    return (json.photos || []).map((photo) => ({
      url: photo.src?.large2x || photo.src?.large || photo.src?.medium || "",
      thumbUrl: photo.src?.small || photo.src?.medium || null,
      provider: "pexels",
      author: photo.photographer || null,
      width: typeof photo.width === "number" ? photo.width : null,
      height: typeof photo.height === "number" ? photo.height : null
    }));
  } catch {
    return [];
  }
}

async function fetchFromPixabay(query: string, limit: number): Promise<ImageSuggestion[]> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) {
    return [];
  }

  try {
    const url = `https://pixabay.com/api/?${new URLSearchParams({
      key,
      q: query,
      image_type: "photo",
      category: "food",
      safesearch: "true",
      per_page: String(Math.max(limit, 6))
    }).toString()}`;
    const json = (await fetchJsonWithTimeout(url, {
      cache: "no-store"
    })) as {
      hits?: Array<{
        largeImageURL?: string;
        webformatURL?: string;
        user?: string;
        imageWidth?: number;
        imageHeight?: number;
      }>;
    };

    return (json.hits || []).map((hit) => ({
      url: hit.largeImageURL || hit.webformatURL || "",
      thumbUrl: hit.webformatURL || hit.largeImageURL || null,
      provider: "pixabay",
      author: hit.user || null,
      width: typeof hit.imageWidth === "number" ? hit.imageWidth : null,
      height: typeof hit.imageHeight === "number" ? hit.imageHeight : null
    }));
  } catch {
    return [];
  }
}

async function fetchFromUnsplash(query: string, limit: number): Promise<ImageSuggestion[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return [];
  }

  try {
    const url = `https://api.unsplash.com/search/photos?${new URLSearchParams({
      query,
      orientation: "landscape",
      per_page: String(Math.max(limit, 5))
    }).toString()}`;
    const json = (await fetchJsonWithTimeout(url, {
      headers: {
        Authorization: `Client-ID ${key}`
      },
      cache: "no-store"
    })) as {
      results?: Array<{
        width?: number;
        height?: number;
        user?: { name?: string };
        urls?: {
          regular?: string;
          small?: string;
        };
      }>;
    };

    return (json.results || []).map((item) => ({
      url: item.urls?.regular || item.urls?.small || "",
      thumbUrl: item.urls?.small || item.urls?.regular || null,
      provider: "unsplash",
      author: item.user?.name || null,
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null
    }));
  } catch {
    return [];
  }
}

function parseCacheFile(raw: string): CacheEntry[] {
  const parsed = JSON.parse(raw) as Partial<CacheFileShape>;
  if (parsed.version !== CACHE_FILE_VERSION || !Array.isArray(parsed.entries)) {
    return [];
  }

  const now = Date.now();
  return parsed.entries
    .filter((entry): entry is CacheEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (typeof entry.key !== "string" || typeof entry.query !== "string") {
        return false;
      }
      if (!Array.isArray(entry.items)) {
        return false;
      }
      if (typeof entry.expiresAt !== "number" || entry.expiresAt < now) {
        return false;
      }
      return true;
    })
    .map((entry) => ({
      ...entry,
      items: sanitizeItems(entry.items)
    }));
}

async function readCacheEntries(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return parseCacheFile(raw);
  } catch {
    return [];
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __smoothiesImageSuggestionStorePromise: Promise<CacheStore> | undefined;
}

async function initStore(): Promise<CacheStore> {
  const store: CacheStore = {
    entries: new Map<string, CacheEntry>(),
    writePromise: null
  };

  const [seedEntries, runtimeEntries] = await Promise.all([
    readCacheEntries(CACHE_SEED_PATH),
    readCacheEntries(CACHE_RUNTIME_PATH)
  ]);

  for (const entry of [...seedEntries, ...runtimeEntries]) {
    store.entries.set(entry.key, entry);
  }

  return store;
}

async function getStore() {
  if (!globalThis.__smoothiesImageSuggestionStorePromise) {
    globalThis.__smoothiesImageSuggestionStorePromise = initStore();
  }
  return globalThis.__smoothiesImageSuggestionStorePromise;
}

async function persistStore(store: CacheStore) {
  if (store.writePromise) {
    return store.writePromise;
  }

  store.writePromise = (async () => {
    const payload: CacheFileShape = {
      version: CACHE_FILE_VERSION,
      updatedAt: Date.now(),
      entries: [...store.entries.values()]
    };

    const dir = path.dirname(CACHE_RUNTIME_PATH);
    await mkdir(dir, { recursive: true });
    const tempPath = `${CACHE_RUNTIME_PATH}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload), "utf-8");
    await rename(tempPath, CACHE_RUNTIME_PATH);
  })()
    .catch(() => undefined)
    .finally(() => {
      store.writePromise = null;
    });

  return store.writePromise;
}

async function fetchProviderResults(query: string, limit: number) {
  const providers: Array<{ provider: ImageProvider; fetcher: (query: string, limit: number) => Promise<ImageSuggestion[]> }> = [
    { provider: "pexels", fetcher: fetchFromPexels },
    { provider: "pixabay", fetcher: fetchFromPixabay },
    { provider: "unsplash", fetcher: fetchFromUnsplash }
  ];

  const providersUsed: ImageProvider[] = [];
  let combined: ImageSuggestion[] = [];

  for (const entry of providers) {
    const items = await entry.fetcher(query, limit);
    if (items.length > 0) {
      providersUsed.push(entry.provider);
      combined = combined.concat(items);
      if (combined.length >= limit) {
        break;
      }
    }
  }

  combined = sanitizeItems(combined).slice(0, limit);
  return {
    providersUsed,
    items: combined
  };
}

export async function getImageSuggestions(params: ImageSuggestionParams): Promise<ImageSuggestionResponse> {
  const title = params.title?.trim() || undefined;
  const tags = (params.tags || []).map((tag) => String(tag).trim()).filter(Boolean);
  const query = buildImageQuery(title, tags);
  const limit = clampLimit(params.limit);
  const cacheKey = makeCacheKey(query, limit);
  const store = await getStore();

  const now = Date.now();
  const cached = store.entries.get(cacheKey);
  if (cached && cached.expiresAt > now && !params.forceRefresh) {
    return {
      query,
      cacheKey,
      cacheHit: true,
      providersUsed: cached.providers,
      items: cached.items.slice(0, limit)
    };
  }

  const fetched = await fetchProviderResults(query, limit);
  const hasItems = fetched.items.length > 0;
  const nextEntry: CacheEntry = {
    key: cacheKey,
    query,
    createdAt: now,
    expiresAt: now + (hasItems ? CACHE_TTL_SECONDS : EMPTY_CACHE_TTL_SECONDS) * 1000,
    providers: fetched.providersUsed,
    items: fetched.items
  };
  store.entries.set(cacheKey, nextEntry);
  void persistStore(store);

  return {
    query,
    cacheKey,
    cacheHit: false,
    providersUsed: fetched.providersUsed,
    items: fetched.items
  };
}

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DatasetMeta,
  ExclusionPresetKey,
  SmoothieDetail,
  SmoothieListItem,
  SmoothieListResponse,
  SortKey
} from "@/lib/types";

type RecipeFlags = SmoothieListItem["tags"];

interface SmoothieRecordInternal extends Omit<SmoothieDetail, "orderScore"> {
  searchBlob: string;
  ingredientSlugs: string[];
  sortName: string;
}

interface DatasetCache {
  items: SmoothieRecordInternal[];
  meta: DatasetMeta;
  bySlug: Map<string, SmoothieRecordInternal>;
  byId: Map<string, SmoothieRecordInternal>;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const CSV_PATH = path.join(process.cwd(), "smoothies.csv");

const PRESET_LABELS: Record<
  ExclusionPresetKey,
  { label: string; description: string }
> = {
  vegan: {
    label: "Vegan",
    description: "Masque les recettes non vegan (lait, yaourt, miel, etc.)"
  },
  lactose: {
    label: "Sans lactose",
    description: "Masque les recettes avec lait / yaourt / produits laitiers"
  },
  nuts: {
    label: "Sans fruits à coque",
    description: "Masque amande, noix, noisette, cajou, pistache..."
  },
  peanut: {
    label: "Sans arachide",
    description: "Masque cacahuète / peanut"
  },
  soy: {
    label: "Sans soja",
    description: "Masque lait/produits de soja"
  },
  gluten: {
    label: "Sans gluten",
    description: "Masque ingrédients contenant du blé/avoine/granola..."
  },
  sesame: {
    label: "Sans sésame",
    description: "Masque sésame et tahini"
  }
};

const STOP_INGREDIENTS = new Set([
  "cubes",
  "cube",
  "glacons",
  "glace",
  "glace-pilee",
  "eau",
  "eau-froide",
  "¼",
  "½",
  "⅓",
  "de",
  "du",
  "des"
]);

const DAIRY_TERMS = [
  "lait",
  "yaourt",
  "yogurt",
  "yogourt",
  "fromage blanc",
  "kefir",
  "kéfir",
  "cream",
  "creme",
  "crème",
  "whey",
  "lactose",
  "lait en poudre",
  "lait concentre",
  "lait concentré"
];

const NON_VEGAN_EXTRA_TERMS = ["miel", "gelatine", "gélatine", "oeuf", "œuf"];

const NUT_TERMS = [
  "amande",
  "amandes",
  "noix",
  "noisette",
  "noisettes",
  "cajou",
  "cashew",
  "pistache",
  "pistaches",
  "pecan",
  "pécan",
  "macadamia"
];

const PEANUT_TERMS = ["cacahuete", "cacahuètes", "arachide", "peanut"];
const SOY_TERMS = ["soja", "soy"];
const GLUTEN_TERMS = [
  "ble",
  "blé",
  "orge",
  "seigle",
  "avoine",
  "granola",
  "biscuit",
  "cookies",
  "cookie"
];
const SESAME_TERMS = ["sesame", "sésame", "tahini"];

function clampLimit(raw: number | null | undefined) {
  if (!raw || Number.isNaN(raw)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(raw)));
}

function safeProtocolUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

function stripBom(value: string) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseCsvRows(csvText: string): string[][] {
  const text = stripBom(csvText);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(value: string) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value: string) {
  return normalizeForSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "smoothie";
}

function extractQuotedItems(raw: string) {
  const items: string[] = [];
  for (const match of raw.matchAll(/"([^"]+)"/g)) {
    const candidate = normalizeWhitespace(match[1]);
    if (candidate) {
      items.push(candidate);
    }
  }
  for (const match of raw.matchAll(/«\s*([^»]+?)\s*»/g)) {
    const candidate = normalizeWhitespace(match[1]);
    if (candidate) {
      items.push(candidate);
    }
  }
  return items;
}

function parseLooseJsonArray(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeWhitespace(String(entry)))
        .filter(Boolean);
    }
  } catch {
    // fall through
  }

  const normalizedQuotes = trimmed
    .replace(/[«»]/g, "\"")
    .replace(/[“”]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'");

  try {
    const parsed = JSON.parse(normalizedQuotes);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => normalizeWhitespace(String(entry)))
        .filter(Boolean);
    }
  } catch {
    // fall through
  }

  return null;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function parseIngredientTokens(nerRaw: string, ingredientsRaw: string) {
  const fromNer =
    parseLooseJsonArray(nerRaw) ??
    extractQuotedItems(nerRaw) ??
    [];

  if (fromNer.length > 0) {
    return uniqueStrings(
      fromNer.map((item) =>
        normalizeWhitespace(item.replace(/^['"“”«»]+|['"“”«»]+$/g, ""))
      )
    );
  }

  const quoted = extractQuotedItems(ingredientsRaw);
  if (quoted.length > 0) {
    return uniqueStrings(quoted);
  }

  return uniqueStrings(
    ingredientsRaw
      .split(/[;,]/g)
      .map((item) => normalizeWhitespace(item))
      .filter((item) => item.length > 1)
  );
}

function parseIngredientLines(ingredientsRaw: string, ingredientTokens: string[]) {
  const quoted = extractQuotedItems(ingredientsRaw);
  if (quoted.length > 0) {
    return quoted;
  }

  const split = ingredientsRaw
    .split(/[;,]/g)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);

  if (split.length >= 2) {
    return split;
  }

  return ingredientTokens;
}

function parseDirections(raw: string) {
  const parsed = parseLooseJsonArray(raw);
  if (parsed && parsed.length > 0) {
    return parsed;
  }

  const quoted = extractQuotedItems(raw);
  if (quoted.length > 0) {
    return quoted;
  }

  return raw
    .split(/[.;•]/g)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)
    .slice(0, 8);
}

function detectImageUrlFromRow(record: Record<string, string>) {
  const priorityKeys = ["image", "image_url", "photo", "thumbnail", "img", "picture"];
  const values: string[] = [];
  for (const key of priorityKeys) {
    if (record[key]) {
      values.push(record[key]);
    }
  }
  for (const value of Object.values(record)) {
    values.push(value);
  }
  for (const value of values) {
    const match = value.match(
      /(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)|\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif))/i
    );
    if (match) {
      return match[1];
    }
  }
  return null;
}

function containsAny(haystacks: string[], terms: string[]) {
  for (const haystack of haystacks) {
    for (const term of terms) {
      const normalizedTerm = normalizeForSearch(term);
      if (!normalizedTerm) {
        continue;
      }
      if (haystack.includes(normalizedTerm)) {
        return true;
      }
    }
  }
  return false;
}

function computeFlags(ingredientTokens: string[], ingredientsRaw: string, directions: string[]): RecipeFlags {
  const normalizedHaystacks = [
    ...ingredientTokens.map(normalizeForSearch),
    normalizeForSearch(ingredientsRaw),
    normalizeForSearch(directions.join(" "))
  ];
  const hasLactose = containsAny(normalizedHaystacks, DAIRY_TERMS);
  const hasNuts = containsAny(normalizedHaystacks, NUT_TERMS);
  const hasPeanut = containsAny(normalizedHaystacks, PEANUT_TERMS);
  const hasSoy = containsAny(normalizedHaystacks, SOY_TERMS);
  const hasGluten = containsAny(normalizedHaystacks, GLUTEN_TERMS);
  const hasSesame = containsAny(normalizedHaystacks, SESAME_TERMS);
  const nonVegan = hasLactose || containsAny(normalizedHaystacks, NON_VEGAN_EXTRA_TERMS);

  return {
    vegan: !nonVegan,
    lactose: hasLactose,
    nuts: hasNuts,
    peanut: hasPeanut,
    soy: hasSoy,
    gluten: hasGluten,
    sesame: hasSesame
  };
}

function hash32(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomOrderScore(seed: string, id: string) {
  return hash32(`${seed}:${id}`);
}

function rowToRecord(row: string[], header: string[], index: number): SmoothieRecordInternal | null {
  if (row.length === 0 || row.every((cell) => !normalizeWhitespace(cell))) {
    return null;
  }

  const record: Record<string, string> = {};
  header.forEach((key, headerIndex) => {
    record[key] = row[headerIndex] ?? "";
  });

  const title = normalizeWhitespace(record.title || `Smoothie ${index + 1}`);
  if (!title) {
    return null;
  }

  const ingredientTokens = parseIngredientTokens(record.NER ?? "", record.ingredients ?? "");
  const ingredientLines = parseIngredientLines(record.ingredients ?? "", ingredientTokens);
  const directions = parseDirections(record.directions ?? "");
  const flags = computeFlags(ingredientTokens, record.ingredients ?? "", directions);
  const imageUrl = detectImageUrlFromRow(record);
  const numericId = index + 1;
  const id = `sm-${numericId}`;
  const slug = `${slugify(title)}-${numericId}`;
  const sourceLink = safeProtocolUrl(record.link);
  const source = normalizeWhitespace(record.source || "Source inconnue");
  const ingredientsRaw = normalizeWhitespace(record.ingredients || "");
  const searchableFields = [title, ingredientsRaw, ...ingredientTokens, ...ingredientLines, ...directions];
  const searchBlob = normalizeForSearch(searchableFields.join(" | "));
  const ingredientSlugs = uniqueStrings(ingredientTokens.map(slugify));

  return {
    id,
    slug,
    title,
    imageUrl,
    hasImage: Boolean(imageUrl),
    ingredients: ingredientTokens,
    ingredientsRaw,
    ingredientLines,
    directions,
    portions: normalizeWhitespace(record.portions || "") || null,
    source,
    sourceLink,
    directionsPreview: directions[0] || null,
    tags: flags,
    popularityScore: 0,
    searchBlob,
    ingredientSlugs,
    sortName: normalizeForSearch(title)
  };
}

async function loadDatasetInternal(): Promise<DatasetCache> {
  const csvText = await readFile(CSV_PATH, "utf-8");
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      items: [],
      bySlug: new Map(),
      byId: new Map(),
      meta: {
        total: 0,
        withImages: 0,
        presetOptions: [],
        ingredientOptions: []
      }
    };
  }

  const header = rows[0].map((cell) => normalizeWhitespace(cell));
  const rawItems: SmoothieRecordInternal[] = [];
  const ingredientFreq = new Map<string, { label: string; count: number }>();
  const presetCounts: Record<ExclusionPresetKey, number> = {
    vegan: 0,
    lactose: 0,
    nuts: 0,
    peanut: 0,
    soy: 0,
    gluten: 0,
    sesame: 0
  };

  for (let i = 1; i < rows.length; i += 1) {
    const recipe = rowToRecord(rows[i], header, rawItems.length);
    if (!recipe) {
      continue;
    }

    rawItems.push(recipe);

    for (const ingredient of recipe.ingredients) {
      const slug = slugify(ingredient);
      if (!slug || STOP_INGREDIENTS.has(slug) || slug.length < 2) {
        continue;
      }
      const current = ingredientFreq.get(slug);
      if (current) {
        current.count += 1;
      } else {
        ingredientFreq.set(slug, { label: ingredient, count: 1 });
      }
    }

    if (!recipe.tags.vegan) {
      presetCounts.vegan += 1;
    }
    if (recipe.tags.lactose) {
      presetCounts.lactose += 1;
    }
    if (recipe.tags.nuts) {
      presetCounts.nuts += 1;
    }
    if (recipe.tags.peanut) {
      presetCounts.peanut += 1;
    }
    if (recipe.tags.soy) {
      presetCounts.soy += 1;
    }
    if (recipe.tags.gluten) {
      presetCounts.gluten += 1;
    }
    if (recipe.tags.sesame) {
      presetCounts.sesame += 1;
    }
  }

  for (const recipe of rawItems) {
    let score = 0;
    for (const ingredient of recipe.ingredients) {
      const meta = ingredientFreq.get(slugify(ingredient));
      if (meta) {
        score += Math.min(meta.count, 400);
      }
    }
    if (recipe.tags.vegan) {
      score += 40;
    }
    if (!recipe.tags.lactose) {
      score += 25;
    }
    if (recipe.hasImage) {
      score += 10;
    }
    recipe.popularityScore = score;
  }

  const presetOptions = Object.entries(PRESET_LABELS)
    .map(([key, config]) => ({
      key: key as ExclusionPresetKey,
      label: config.label,
      description: config.description,
      count: presetCounts[key as ExclusionPresetKey]
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));

  const ingredientOptions = [...ingredientFreq.entries()]
    .filter(([, meta]) => meta.count >= 35)
    .map(([slug, meta]) => ({ slug, label: meta.label, count: meta.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
    .slice(0, 36);

  const bySlug = new Map<string, SmoothieRecordInternal>();
  const byId = new Map<string, SmoothieRecordInternal>();
  for (const item of rawItems) {
    bySlug.set(item.slug, item);
    byId.set(item.id, item);
  }

  return {
    items: rawItems,
    bySlug,
    byId,
    meta: {
      total: rawItems.length,
      withImages: rawItems.filter((item) => item.hasImage).length,
      presetOptions,
      ingredientOptions
    }
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __smoothiesDatasetCache: Promise<DatasetCache> | undefined;
}

async function getCache() {
  if (!globalThis.__smoothiesDatasetCache) {
    globalThis.__smoothiesDatasetCache = loadDatasetInternal();
  }
  return globalThis.__smoothiesDatasetCache;
}

function matchesPreset(item: SmoothieRecordInternal, preset: ExclusionPresetKey) {
  switch (preset) {
    case "vegan":
      return !item.tags.vegan;
    case "lactose":
      return item.tags.lactose;
    case "nuts":
      return item.tags.nuts;
    case "peanut":
      return item.tags.peanut;
    case "soy":
      return item.tags.soy;
    case "gluten":
      return item.tags.gluten;
    case "sesame":
      return item.tags.sesame;
    default:
      return false;
  }
}

function toListItem(item: SmoothieRecordInternal, orderScore: number): SmoothieListItem {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    imageUrl: item.imageUrl,
    hasImage: item.hasImage,
    ingredients: item.ingredients,
    portions: item.portions,
    source: item.source,
    sourceLink: item.sourceLink,
    directionsPreview: item.directionsPreview,
    tags: item.tags,
    popularityScore: item.popularityScore,
    orderScore
  };
}

export async function getDatasetMeta(): Promise<DatasetMeta> {
  const cache = await getCache();
  return cache.meta;
}

export interface QueryOptions {
  q?: string;
  excludeIngredients?: string[];
  excludePresets?: ExclusionPresetKey[];
  includeIds?: string[];
  sort?: SortKey;
  seed?: string;
  offset?: number;
  limit?: number;
}

export async function querySmoothies(options: QueryOptions = {}): Promise<SmoothieListResponse> {
  const cache = await getCache();
  const q = normalizeWhitespace(options.q || "");
  const searchTerms = normalizeForSearch(q).split(/\s+/).filter(Boolean);
  const excludeIngredients = new Set((options.excludeIngredients || []).map((value) => slugify(value)));
  const excludePresets = new Set(options.excludePresets || []);
  const includeIds = new Set((options.includeIds || []).map((value) => String(value).trim()).filter(Boolean));
  const sort: SortKey = options.sort || "random";
  const seed = options.seed && options.seed.trim() ? options.seed.trim() : "seed";
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = clampLimit(options.limit);

  let filtered = cache.items;

  if (includeIds.size > 0) {
    filtered = filtered.filter((item) => includeIds.has(item.id));
  }

  if (searchTerms.length > 0) {
    filtered = filtered.filter((item) => searchTerms.every((term) => item.searchBlob.includes(term)));
  }

  if (excludeIngredients.size > 0) {
    filtered = filtered.filter(
      (item) => !item.ingredientSlugs.some((ingredientSlug) => excludeIngredients.has(ingredientSlug))
    );
  }

  if (excludePresets.size > 0) {
    filtered = filtered.filter((item) => {
      for (const preset of excludePresets) {
        if (matchesPreset(item, preset)) {
          return false;
        }
      }
      return true;
    });
  }

  const decorated = filtered.map((item) => {
    let orderScore = item.popularityScore;
    if (sort === "random") {
      orderScore = randomOrderScore(seed, item.id);
    }
    return { item, orderScore };
  });

  if (sort === "random") {
    decorated.sort((a, b) => a.orderScore - b.orderScore || a.item.sortName.localeCompare(b.item.sortName));
  } else if (sort === "name") {
    decorated.sort((a, b) => a.item.sortName.localeCompare(b.item.sortName, "fr"));
  } else {
    decorated.sort((a, b) => b.item.popularityScore - a.item.popularityScore || a.item.sortName.localeCompare(b.item.sortName, "fr"));
  }

  const slice = decorated.slice(offset, offset + limit);
  const items = slice.map(({ item, orderScore }) => toListItem(item, orderScore));
  const nextOffset = offset + items.length < decorated.length ? offset + items.length : null;

  return {
    items,
    total: decorated.length,
    offset,
    nextOffset,
    limit
  };
}

export async function getSmoothieBySlug(slug: string): Promise<SmoothieDetail | null> {
  const cache = await getCache();
  const direct = cache.bySlug.get(slug);
  if (direct) {
    return { ...direct, orderScore: 0 };
  }

  const numericSuffix = Number(slug.split("-").at(-1));
  if (Number.isFinite(numericSuffix) && numericSuffix > 0) {
    const byId = cache.byId.get(`sm-${numericSuffix}`);
    if (byId) {
      return { ...byId, orderScore: 0 };
    }
  }

  return null;
}

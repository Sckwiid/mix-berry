import { readFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.IMAGE_API_BASE_URL || "http://localhost:3000";
const CSV_PATH = path.join(process.cwd(), "smoothies.csv");

function parseArg(name, fallback) {
  const entry = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!entry) {
    return fallback;
  }
  const value = Number(entry.split("=")[1]);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.trunc(value);
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseCsvRows(csvText) {
  const text = stripBom(csvText);
  const rows = [];
  let row = [];
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

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTagsFromNer(raw) {
  const tags = [];
  for (const match of String(raw || "").matchAll(/"([^"]+)"/g)) {
    const value = normalizeWhitespace(match[1]);
    if (value) {
      tags.push(value);
    }
  }
  return tags.slice(0, 8);
}

async function postSuggestion(payload) {
  const response = await fetch(`${API_BASE}/api/image-suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function main() {
  const offset = parseArg("offset", 0);
  const limit = parseArg("limit", 80);
  const concurrency = Math.max(1, Math.min(6, parseArg("concurrency", 3)));

  const raw = await readFile(CSV_PATH, "utf-8");
  const rows = parseCsvRows(raw);
  const header = rows[0] || [];
  const titleIndex = header.indexOf("title");
  const nerIndex = header.indexOf("NER");

  if (titleIndex === -1) {
    throw new Error("Missing column: title");
  }

  const selected = rows
    .slice(1 + offset, 1 + offset + limit)
    .map((row) => ({
      title: normalizeWhitespace(row[titleIndex] || ""),
      tags: nerIndex === -1 ? [] : parseTagsFromNer(row[nerIndex] || "")
    }))
    .filter((item) => item.title);

  let cursor = 0;
  let success = 0;
  let failed = 0;

  async function worker(workerId) {
    while (cursor < selected.length) {
      const index = cursor;
      cursor += 1;
      const entry = selected[index];
      try {
        const data = await postSuggestion({
          title: entry.title,
          tags: entry.tags,
          limit: 4
        });
        success += 1;
        const providerCount = Array.isArray(data.providersUsed) ? data.providersUsed.length : 0;
        console.log(`[${workerId}] ok ${index + 1}/${selected.length} :: providers=${providerCount} :: ${entry.title}`);
      } catch (error) {
        failed += 1;
        console.log(`[${workerId}] fail ${index + 1}/${selected.length} :: ${entry.title} :: ${String(error)}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log(`Done. success=${success} failed=${failed} total=${selected.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

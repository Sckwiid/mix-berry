import { NextRequest } from "next/server";

import { getImageSuggestions } from "@/lib/image-suggestions";

export const runtime = "nodejs";

function parseTagsCsv(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLimit(value: string | number | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return numeric;
}

function parseBoolean(value: string | boolean | undefined) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const title = params.get("title") ?? undefined;
  const tags = parseTagsCsv(params.get("tags"));

  if (!title && tags.length === 0) {
    return Response.json(
      {
        error: "Missing parameters: provide title or tags"
      },
      { status: 400 }
    );
  }

  const payload = await getImageSuggestions({
    title,
    tags,
    limit: parseLimit(params.get("limit") ?? undefined),
    forceRefresh: parseBoolean(params.get("refresh") ?? undefined)
  });

  return Response.json(payload);
}

export async function POST(request: NextRequest) {
  let body: {
    title?: string;
    tags?: string[];
    limit?: number;
    refresh?: boolean;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    // ignore and keep empty body
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const title = typeof body.title === "string" ? body.title.trim() : undefined;

  if (!title && tags.length === 0) {
    return Response.json(
      {
        error: "Missing parameters: provide title or tags"
      },
      { status: 400 }
    );
  }

  const payload = await getImageSuggestions({
    title,
    tags,
    limit: parseLimit(body.limit),
    forceRefresh: parseBoolean(body.refresh)
  });

  return Response.json(payload);
}

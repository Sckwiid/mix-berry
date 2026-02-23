import { NextRequest } from "next/server";

import { querySmoothies } from "@/lib/dataset";
import type { ExclusionPresetKey, SortKey } from "@/lib/types";

const PRESETS: ExclusionPresetKey[] = ["vegan", "lactose", "nuts", "peanut", "soy", "gluten", "sesame"];
const SORTS: SortKey[] = ["random", "rating", "name"];

function parseCsvParam(value: string | null) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const excludePresets = parseCsvParam(params.get("excludePresets")).filter((value): value is ExclusionPresetKey =>
    PRESETS.includes(value as ExclusionPresetKey)
  );
  const sortParam = params.get("sort");
  const sort: SortKey = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : "random";

  const data = await querySmoothies({
    q: params.get("q") ?? undefined,
    excludeIngredients: parseCsvParam(params.get("excludeIngredients")),
    excludePresets,
    sort,
    seed: params.get("seed") ?? undefined,
    offset: params.get("offset") ? Number(params.get("offset")) : 0,
    limit: params.get("limit") ? Number(params.get("limit")) : 24
  });

  return Response.json(data);
}

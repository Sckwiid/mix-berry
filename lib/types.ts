export type ExclusionPresetKey =
  | "vegan"
  | "lactose"
  | "nuts"
  | "peanut"
  | "soy"
  | "gluten"
  | "sesame";

export type SortKey = "random" | "rating" | "name";

export interface SmoothieListItem {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  hasImage: boolean;
  ingredients: string[];
  portions: string | null;
  source: string;
  sourceLink: string | null;
  directionsPreview: string | null;
  tags: {
    vegan: boolean;
    lactose: boolean;
    nuts: boolean;
    peanut: boolean;
    soy: boolean;
    gluten: boolean;
    sesame: boolean;
  };
  popularityScore: number;
  orderScore: number;
}

export interface SmoothieDetail extends SmoothieListItem {
  ingredientsRaw: string;
  ingredientLines: string[];
  directions: string[];
}

export interface PopularIngredientOption {
  slug: string;
  label: string;
  count: number;
}

export interface ExclusionPresetOption {
  key: ExclusionPresetKey;
  label: string;
  description: string;
  count: number;
}

export interface DatasetMeta {
  total: number;
  withImages: number;
  presetOptions: ExclusionPresetOption[];
  ingredientOptions: PopularIngredientOption[];
}

export interface SmoothieListResponse {
  items: SmoothieListItem[];
  total: number;
  offset: number;
  nextOffset: number | null;
  limit: number;
}

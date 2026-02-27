export interface FruitEmojiBadge {
  emoji: string;
  label: string;
}

const FRUIT_EMOJI_RULES = [
  { terms: ["banane", "banana"], emoji: "🍌" },
  { terms: ["fraise", "fraises", "strawberry"], emoji: "🍓" },
  { terms: ["framboise", "framboises", "raspberry"], emoji: "🍓" },
  { terms: ["myrtille", "myrtilles", "blueberry", "blueberries"], emoji: "🫐" },
  { terms: ["mangue", "mango"], emoji: "🥭" },
  { terms: ["ananas", "pineapple"], emoji: "🍍" },
  { terms: ["kiwi"], emoji: "🥝" },
  { terms: ["peche", "peach", "pêche", "peaches"], emoji: "🍑" },
  { terms: ["poire", "pear"], emoji: "🍐" },
  { terms: ["pomme", "apple"], emoji: "🍏" },
  { terms: ["orange"], emoji: "🍊" },
  { terms: ["citron", "lemon", "lime"], emoji: "🍋" },
  { terms: ["raisin", "grape"], emoji: "🍇" },
  { terms: ["cerise", "cherry"], emoji: "🍒" },
  { terms: ["pasteque", "pastèque", "watermelon"], emoji: "🍉" },
  { terms: ["melon", "cantaloup"], emoji: "🍈" },
  { terms: ["coco", "coconut"], emoji: "🥥" },
  { terms: ["avocat", "avocado"], emoji: "🥑" }
] as const;

const NOISY_INGREDIENT_TERMS = [
  "cube",
  "cubes",
  "glace",
  "glacons",
  "glaçons",
  "ice",
  "water",
  "eau"
];

function normalizeIngredient(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isNoisyIngredient(value: string) {
  const normalized = normalizeIngredient(value);
  return NOISY_INGREDIENT_TERMS.some(
    (term) =>
      normalized === term ||
      normalized.includes(`${term} `) ||
      normalized.includes(` ${term}`)
  );
}

export function getFruitEmojiBadges(ingredients: string[], limit = 4): FruitEmojiBadge[] {
  const seenEmojis = new Set<string>();
  const badges: FruitEmojiBadge[] = [];

  for (const ingredient of ingredients) {
    if (isNoisyIngredient(ingredient)) {
      continue;
    }

    const normalized = normalizeIngredient(ingredient);
    let emoji: string | null = null;
    for (const rule of FRUIT_EMOJI_RULES) {
      if (rule.terms.some((term) => normalized.includes(term))) {
        emoji = rule.emoji;
        break;
      }
    }

    if (!emoji || seenEmojis.has(emoji)) {
      continue;
    }

    seenEmojis.add(emoji);
    badges.push({ emoji, label: ingredient });
    if (badges.length >= limit) {
      break;
    }
  }

  return badges;
}


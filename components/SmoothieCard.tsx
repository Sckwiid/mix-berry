import Link from "next/link";

import type { SmoothieListItem } from "@/lib/types";

import { RatingStars } from "@/components/RatingStars";

interface SmoothieCardProps {
  item: SmoothieListItem;
  localRating: number;
  onRate: (rating: number) => void;
}

const FRUIT_EMOJI_RULES = [
  { terms: ["banane", "banana"], emoji: "🍌" },
  { terms: ["fraise", "fraises", "strawberry"], emoji: "🍓" },
  { terms: ["framboise", "framboises", "raspberry"], emoji: "🍓" },
  { terms: ["myrtille", "myrtilles", "blueberry", "blueberries"], emoji: "🫐" },
  { terms: ["mangue", "mango"], emoji: "🥭" },
  { terms: ["ananas", "pineapple"], emoji: "🍍" },
  { terms: ["kiwi"], emoji: "🥝" },
  { terms: ["peche", "peaches", "peach"], emoji: "🍑" },
  { terms: ["poire", "pear"], emoji: "🍐" },
  { terms: ["pomme", "apple"], emoji: "🍏" },
  { terms: ["orange"], emoji: "🍊" },
  { terms: ["citron", "lemon", "lime"], emoji: "🍋" },
  { terms: ["raisin", "grape"], emoji: "🍇" },
  { terms: ["cerise", "cherry"], emoji: "🍒" },
  { terms: ["pasteque", "watermelon"], emoji: "🍉" },
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

function mediaGradient(seed: string) {
  const code = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = code % 360;
  const hueB = (code * 1.7 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 72% 90%), hsl(${hueB} 70% 84%))`;
}

function pickLabel(item: SmoothieListItem) {
  if (item.tags.vegan && !item.tags.lactose) {
    return "Vegan";
  }
  if (item.tags.lactose) {
    return "Lactose";
  }
  if (item.tags.nuts) {
    return "Fruits à coque";
  }
  if (item.tags.peanut) {
    return "Arachide";
  }
  if (item.tags.soy) {
    return "Soja";
  }
  return null;
}

function compactSourceLabel(source: string) {
  return source.replace(/\s+/g, " ").trim();
}

function normalizeIngredient(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isNoisyIngredient(value: string) {
  const normalized = normalizeIngredient(value);
  return NOISY_INGREDIENT_TERMS.some((term) => normalized === term || normalized.includes(`${term} `) || normalized.includes(` ${term}`));
}

function getFruitEmoji(value: string) {
  const normalized = normalizeIngredient(value);
  for (const rule of FRUIT_EMOJI_RULES) {
    if (rule.terms.some((term) => normalized.includes(term))) {
      return rule.emoji;
    }
  }
  return null;
}

function getFruitEmojiBadges(ingredients: string[]) {
  const seenEmojis = new Set<string>();
  const badges: Array<{ emoji: string; label: string }> = [];

  for (const ingredient of ingredients) {
    if (isNoisyIngredient(ingredient)) {
      continue;
    }
    const emoji = getFruitEmoji(ingredient);
    if (!emoji || seenEmojis.has(emoji)) {
      continue;
    }
    seenEmojis.add(emoji);
    badges.push({ emoji, label: ingredient });
    if (badges.length >= 4) {
      break;
    }
  }

  return badges;
}

export function SmoothieCard({ item, localRating, onRate }: SmoothieCardProps) {
  const primaryTag = pickLabel(item);
  const cleanIngredients = item.ingredients.filter((ingredient) => !isNoisyIngredient(ingredient));
  const ingredientPreview = cleanIngredients.slice(0, 3).join(" • ");
  const fruitEmojiBadges = getFruitEmojiBadges(item.ingredients);
  const heroFruitLabel = fruitEmojiBadges[0]?.label ?? "Smoothie";
  const heroSymbol = fruitEmojiBadges[0]?.emoji ?? "🍹";
  const bodyIngredientsSource = cleanIngredients;
  const bodyIngredients = bodyIngredientsSource.slice(0, 2);
  const extraIngredientCount = Math.max(0, bodyIngredientsSource.length - bodyIngredients.length);
  const sourceLabel = compactSourceLabel(item.source);

  return (
    <article className="smCard">
      <Link href={`/smoothie/${item.slug}`} className="smCardLink" prefetch={false}>
        <div
          className={`smCardMedia ${item.imageUrl ? "hasPhoto" : "isIllustrated"}`}
          style={!item.imageUrl ? { background: mediaGradient(item.id) } : undefined}
        >
          {item.imageUrl ? (
            <>
              <img
                src={item.imageUrl}
                alt={item.title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
              <div className="smCardPhotoShade" aria-hidden="true" />
            </>
          ) : (
            <div className="smCardMediaPlaceholder smCardMediaPlaceholderRich">
              <div className="smCardMediaDecor" aria-hidden="true">
                <i className="smCardOrb smCardOrbA" />
                <i className="smCardOrb smCardOrbB" />
                <i className="smCardOrb smCardOrbC" />
              </div>
              <span>{heroSymbol}</span>
              <small>{heroFruitLabel}</small>
              {fruitEmojiBadges.length > 0 ? (
                <div className="smCardMediaChips">
                  {fruitEmojiBadges.map((badge, index) => (
                    <span
                      key={`${badge.emoji}-${badge.label}-${index}`}
                      className="smCardMediaChip"
                      title={badge.label}
                      aria-label={badge.label}
                    >
                      {badge.emoji}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <div className="smCardMediaBadge">{item.hasImage ? "Photo" : "Sans photo"}</div>
        </div>

        <div className="smCardBody">
          <div className="smCardTopline">
            {primaryTag ? <span className="smTag smTagSoft">{primaryTag}</span> : <span className="smTag">Recette</span>}
            {item.portions ? (
              <span className="smMeta">Portions {item.portions}</span>
            ) : (
              <span className="smMeta">{sourceLabel}</span>
            )}
          </div>

          <h3 className="smCardTitle">{item.title}</h3>

          {bodyIngredients.length > 0 ? (
            <div className="smCardKeyIngredients" aria-label="Ingrédients principaux">
              {bodyIngredients.map((ingredient) => (
                <span key={ingredient} className="smMiniChip">
                  {ingredient}
                </span>
              ))}
              {extraIngredientCount > 0 ? (
                <span className="smMiniChip smMiniChipMuted">+{extraIngredientCount}</span>
              ) : null}
            </div>
          ) : (
            <p className="smCardIngredients">{ingredientPreview || "Ingrédients non renseignés"}</p>
          )}
          <p className="smCardPreview">{item.directionsPreview || "Voir la recette complète"}</p>
        </div>
      </Link>

      <div className="smCardFooter">
        <div className="smRatingBlock">
          <RatingStars value={localRating} onChange={onRate} size="sm" compact />
          <span className="smRatingText">{localRating > 0 ? `Votre note: ${localRating}/5` : "Noter"}</span>
        </div>
        <span className="smMeta">Score {Math.round(item.popularityScore)}</span>
      </div>
    </article>
  );
}

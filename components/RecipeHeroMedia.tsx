"use client";

import { useSuggestedImage } from "@/components/useSuggestedImage";
import { getFruitEmojiBadges } from "@/lib/fruit-emoji";

interface RecipeHeroMediaProps {
  id: string;
  title: string;
  ingredients: string[];
  imageUrl: string | null;
}

function heroGradient(seed: string) {
  const code = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hueA = code % 360;
  const hueB = (code * 2.3 + 80) % 360;
  return `linear-gradient(135deg, hsl(${hueA} 75% 90%), hsl(${hueB} 66% 82%))`;
}

export function RecipeHeroMedia({ id, title, ingredients, imageUrl }: RecipeHeroMediaProps) {
  const media = useSuggestedImage({
    id,
    title,
    tags: ingredients,
    imageUrl,
    enabled: true,
    refreshOnMiss: true
  });

  const badgeLabel =
    media.source === "dataset"
      ? "Photo"
      : media.source === "suggested"
        ? "Photo suggérée"
        : media.isLoading
          ? "Recherche image..."
          : "Sans photo";
  const fruitEmojiBadges = getFruitEmojiBadges(ingredients, 4);
  const placeholderEmojiBadges =
    fruitEmojiBadges.length > 0
      ? fruitEmojiBadges
      : media.isLoading
        ? [
            { emoji: "🍓", label: "fraise" },
            { emoji: "🍌", label: "banane" },
            { emoji: "🍍", label: "ananas" },
            { emoji: "🥭", label: "mangue" }
          ]
        : [];

  return (
    <div className="recipeMedia" style={!media.imageUrl ? { background: heroGradient(id) } : undefined}>
      {media.imageUrl ? (
        <img src={media.imageUrl} alt={title} loading="eager" decoding="async" />
      ) : (
        <div className="recipeMediaPlaceholder">
          <div className="recipeMediaDecor" aria-hidden="true">
            <i className="recipeMediaOrb recipeMediaOrbA" />
            <i className="recipeMediaOrb recipeMediaOrbB" />
            <i className="recipeMediaOrb recipeMediaOrbC" />
          </div>
          <p className="recipeMediaKicker">Illustration générée à partir des ingrédients</p>
          <span>{title.slice(0, 1).toUpperCase()}</span>
          <small>{ingredients.slice(0, 2).join(" • ") || "Sans photo dans le dataset"}</small>
          {placeholderEmojiBadges.length > 0 ? (
            <div className="recipeMediaChips">
              {placeholderEmojiBadges.map((badge, index) => (
                <span
                  key={`${badge.emoji}-${badge.label}-${index}`}
                  className="recipeMediaChip recipeMediaChipEmoji"
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
      <div className="recipeMediaBadge">{badgeLabel}</div>
    </div>
  );
}

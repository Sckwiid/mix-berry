"use client";

import { useSuggestedImage } from "@/components/useSuggestedImage";

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
    enabled: true
  });

  const badgeLabel =
    media.source === "dataset"
      ? "Photo"
      : media.source === "suggested"
        ? "Photo suggérée"
        : media.isLoading
          ? "Recherche image..."
          : "Sans photo";

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
          {ingredients.length > 0 ? (
            <div className="recipeMediaChips">
              {ingredients.slice(0, 4).map((ingredient) => (
                <span key={ingredient} className="recipeMediaChip">
                  {ingredient}
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


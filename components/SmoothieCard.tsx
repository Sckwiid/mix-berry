"use client";

import { useEffect } from "react";
import Link from "next/link";

import type { SmoothieListItem } from "@/lib/types";
import { getFruitEmojiBadges, isNoisyIngredient } from "@/lib/fruit-emoji";

import { RatingStars } from "@/components/RatingStars";
import { useSuggestedImage } from "@/components/useSuggestedImage";

interface SmoothieCardProps {
  item: SmoothieListItem;
  localRating: number;
  onRate: (rating: number) => void;
  isFavorite: boolean;
  isRated: boolean;
  onImageStatusChange?: (id: string, hasImage: boolean) => void;
  onToggleFavorite: () => void;
}

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

const DEFAULT_LOADING_BADGES = [
  { emoji: "🍓", label: "fraise" },
  { emoji: "🍌", label: "banane" },
  { emoji: "🍍", label: "ananas" }
];

export function SmoothieCard({
  item,
  localRating,
  onRate,
  isFavorite,
  isRated,
  onImageStatusChange,
  onToggleFavorite
}: SmoothieCardProps) {
  const media = useSuggestedImage({
    id: item.id,
    title: item.title,
    tags: item.ingredients,
    imageUrl: item.imageUrl,
    enabled: true
  });

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
  const visualEmojiBadges =
    fruitEmojiBadges.length > 0
      ? fruitEmojiBadges
      : media.isLoading
        ? DEFAULT_LOADING_BADGES
        : [];
  const mediaBadgeLabel =
    media.source === "dataset"
      ? "Photo"
      : media.source === "suggested"
        ? "Photo suggérée"
        : media.isLoading
          ? "Recherche image..."
          : "Sans photo";

  useEffect(() => {
    onImageStatusChange?.(item.id, media.source !== "none");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, media.source]);

  return (
    <article className={`smCard ${isFavorite ? "isFavorite" : ""} ${isRated ? "isRated" : ""}`}>
      <Link href={`/smoothie/${item.slug}`} className="smCardLink" prefetch={false}>
        <div
          className={`smCardMedia ${media.imageUrl ? "hasPhoto" : "isIllustrated"}`}
          style={!media.imageUrl ? { background: mediaGradient(item.id) } : undefined}
        >
          {media.imageUrl ? (
            <>
              <img
                src={media.imageUrl}
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
              {visualEmojiBadges.length > 0 ? (
                <div className="smCardMediaChips">
                  {visualEmojiBadges.map((badge, index) => (
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
          <div className="smCardMediaBadge">{mediaBadgeLabel}</div>
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
        <div className="smCardActions">
          <span className="smMeta">Score {Math.round(item.popularityScore)}</span>
          <button
            type="button"
            className={`smFavoriteButton ${isFavorite ? "isActive" : ""}`}
            aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={isFavorite}
            onClick={onToggleFavorite}
            title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
            <span>{isFavorite ? "Favori" : "Favoris"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

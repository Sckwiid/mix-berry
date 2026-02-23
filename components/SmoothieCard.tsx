import Link from "next/link";

import type { SmoothieListItem } from "@/lib/types";

import { RatingStars } from "@/components/RatingStars";

interface SmoothieCardProps {
  item: SmoothieListItem;
  localRating: number;
  onRate: (rating: number) => void;
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

export function SmoothieCard({ item, localRating, onRate }: SmoothieCardProps) {
  const primaryTag = pickLabel(item);
  const ingredientPreview = item.ingredients.slice(0, 3).join(" • ");

  return (
    <article className="smCard">
      <Link href={`/smoothie/${item.slug}`} className="smCardLink" prefetch={false}>
        <div className="smCardMedia" style={!item.imageUrl ? { background: mediaGradient(item.id) } : undefined}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="smCardMediaPlaceholder">
              <span>{item.title.slice(0, 1).toUpperCase()}</span>
              <small>{item.ingredients[0] ?? "Smoothie"}</small>
            </div>
          )}
          <div className="smCardMediaBadge">{item.hasImage ? "Photo" : "Sans photo"}</div>
        </div>

        <div className="smCardBody">
          <div className="smCardTopline">
            {primaryTag ? <span className="smTag smTagSoft">{primaryTag}</span> : <span className="smTag">Recette</span>}
            {item.portions ? <span className="smMeta">Portions {item.portions}</span> : <span className="smMeta">{item.source}</span>}
          </div>

          <h3 className="smCardTitle">{item.title}</h3>

          <p className="smCardIngredients">{ingredientPreview || "Ingrédients non renseignés"}</p>
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

"use client";

import { RatingStars } from "@/components/RatingStars";
import { useLocalRatings } from "@/components/useLocalRatings";

interface RecipeRatingProps {
  recipeId: string;
}

export function RecipeRating({ recipeId }: RecipeRatingProps) {
  const { ratings, ready, setRating } = useLocalRatings();
  const current = ratings[recipeId] ?? 0;

  return (
    <div className="recipeRating">
      <div>
        <p className="recipeRatingTitle">Votre note</p>
        <p className="recipeRatingHint">Enregistrée localement dans ce navigateur.</p>
      </div>
      <div className="recipeRatingControls">
        <RatingStars value={current} onChange={(value) => setRating(recipeId, value)} />
        <span className="recipeRatingValue">{ready ? (current ? `${current}/5` : "Pas encore noté") : "Chargement..."}</span>
      </div>
    </div>
  );
}

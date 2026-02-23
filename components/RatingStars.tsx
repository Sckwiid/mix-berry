"use client";

interface RatingStarsProps {
  value: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md";
  compact?: boolean;
}

export function RatingStars({
  value,
  onChange,
  size = "md",
  compact = false
}: RatingStarsProps) {
  const interactive = typeof onChange === "function";

  return (
    <div className={`ratingStars ratingStars-${size}`} role={interactive ? "group" : undefined}>
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        const filled = rating <= value;
        const label = value === rating ? `Retirer la note ${rating}` : `Noter ${rating}/5`;
        const content = (
          <span aria-hidden="true" className={filled ? "isFilled" : undefined}>
            ★
          </span>
        );

        if (!interactive) {
          return (
            <span key={rating} className="ratingStarStatic">
              {content}
            </span>
          );
        }

        return (
          <button
            key={rating}
            type="button"
            className={`ratingStarButton ${compact ? "isCompact" : ""}`}
            aria-label={label}
            aria-pressed={filled}
            onClick={() => onChange(value === rating ? 0 : rating)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

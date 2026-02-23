"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "smoothies.localRatings.v1";

type RatingsMap = Record<string, number>;

function readRatings(): RatingsMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safe: RatingsMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 5) {
        safe[id] = Math.round(numeric);
      }
    }
    return safe;
  } catch {
    return {};
  }
}

export function useLocalRatings() {
  const [ratings, setRatings] = useState<RatingsMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRatings(readRatings());
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setRatings(readRatings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setRating = (id: string, rating: number) => {
    setRatings((current) => {
      const next = { ...current };
      if (rating <= 0) {
        delete next[id];
      } else {
        next[id] = Math.max(1, Math.min(5, Math.round(rating)));
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return {
    ratings,
    ready,
    setRating
  };
}

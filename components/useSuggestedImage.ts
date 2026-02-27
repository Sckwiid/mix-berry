"use client";

import { useEffect, useMemo, useState } from "react";

type ImageSource = "dataset" | "suggested" | "none";

interface UseSuggestedImageParams {
  id: string;
  title: string;
  tags: string[];
  imageUrl: string | null;
  enabled?: boolean;
}

interface UseSuggestedImageResult {
  imageUrl: string | null;
  source: ImageSource;
  isLoading: boolean;
}

const suggestionCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;

function runQueued() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    activeRequests += 1;
    next();
  }
}

function enqueueRequest(task: () => Promise<string | null>) {
  return new Promise<string | null>((resolve, reject) => {
    const execute = () => {
      Promise.resolve()
        .then(task)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests = Math.max(0, activeRequests - 1);
          runQueued();
        });
    };
    queue.push(execute);
    runQueued();
  });
}

function buildCacheKey(id: string, title: string, tags: string[]) {
  const normalizedTags = tags.map((entry) => entry.trim().toLowerCase()).filter(Boolean).slice(0, 6);
  return `${id}|${title.trim().toLowerCase()}|${normalizedTags.join(",")}`;
}

async function fetchSuggestedImage(title: string, tags: string[]) {
  const params = new URLSearchParams();
  params.set("title", title);
  const cleanTags = tags.map((entry) => entry.trim()).filter(Boolean).slice(0, 8);
  if (cleanTags.length > 0) {
    params.set("tags", cleanTags.join(","));
  }
  params.set("limit", "1");

  const response = await fetch(`/api/image-suggestions?${params.toString()}`, {
    method: "GET"
  });
  if (!response.ok) {
    throw new Error(`Image API error ${response.status}`);
  }

  const payload = (await response.json()) as {
    items?: Array<{ url?: string | null }>;
  };
  const firstUrl = payload.items?.[0]?.url;
  return typeof firstUrl === "string" && firstUrl.trim() ? firstUrl : null;
}

export function useSuggestedImage({
  id,
  title,
  tags,
  imageUrl,
  enabled = true
}: UseSuggestedImageParams): UseSuggestedImageResult {
  const key = useMemo(() => buildCacheKey(id, title, tags), [id, title, tags]);
  const [suggestedUrl, setSuggestedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || imageUrl) {
      setSuggestedUrl(null);
      setIsLoading(false);
      return;
    }

    const cached = suggestionCache.get(key);
    if (cached !== undefined) {
      setSuggestedUrl(cached);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    const pending =
      inFlight.get(key) ??
      enqueueRequest(() => fetchSuggestedImage(title, tags))
        .then((url) => {
          suggestionCache.set(key, url);
          return url;
        })
        .catch(() => {
          suggestionCache.set(key, null);
          return null;
        })
        .finally(() => {
          inFlight.delete(key);
        });

    inFlight.set(key, pending);

    void pending.then((url) => {
      if (!active) {
        return;
      }
      setSuggestedUrl(url);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [enabled, imageUrl, key, tags, title]);

  if (imageUrl) {
    return {
      imageUrl,
      source: "dataset",
      isLoading: false
    };
  }

  if (suggestedUrl) {
    return {
      imageUrl: suggestedUrl,
      source: "suggested",
      isLoading
    };
  }

  return {
    imageUrl: null,
    source: "none",
    isLoading
  };
}

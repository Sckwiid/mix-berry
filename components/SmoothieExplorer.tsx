"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { DatasetMeta, ExclusionPresetKey, SmoothieListItem, SmoothieListResponse, SortKey } from "@/lib/types";

import { SmoothieCard } from "@/components/SmoothieCard";
import { VirtualSmoothieGrid } from "@/components/VirtualSmoothieGrid";
import { useLocalFavorites } from "@/components/useLocalFavorites";
import { useLocalRatings } from "@/components/useLocalRatings";

interface SmoothieExplorerProps {
  meta: DatasetMeta;
}

const PAGE_SIZE = 24;
type LibraryView = "all" | "rated" | "favorites";

function randomSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function joinCsv(values: string[]) {
  return values.join(",");
}

function buildListKey(input: {
  q: string;
  excludePresets: string[];
  excludeIngredients: string[];
  sort: SortKey;
  seed: string;
  libraryView: LibraryView;
  scopedIds: string[];
}) {
  return JSON.stringify(input);
}

export function SmoothieExplorer({ meta }: SmoothieExplorerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortKey>("random");
  const [excludePresets, setExcludePresets] = useState<ExclusionPresetKey[]>([]);
  const [excludeIngredients, setExcludeIngredients] = useState<string[]>([]);
  const [showExclusions, setShowExclusions] = useState(false);
  const [seed, setSeed] = useState(randomSeed);
  const [libraryView, setLibraryView] = useState<LibraryView>("all");

  const [items, setItems] = useState<SmoothieListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [resolvedImageIds, setResolvedImageIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRequestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const { ratings, ready: ratingsReady, setRating } = useLocalRatings();
  const { favoriteIds, ready: favoritesReady, toggleFavorite } = useLocalFavorites();

  const ratedIds = useMemo(
    () => Object.entries(ratings).filter(([, rating]) => rating > 0).map(([id]) => id).sort(),
    [ratings]
  );
  const favoriteIdsSorted = useMemo(() => [...favoriteIds].sort(), [favoriteIds]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const libraryScopedIds = useMemo(() => {
    if (libraryView === "rated") {
      return ratedIds;
    }
    if (libraryView === "favorites") {
      return favoriteIdsSorted;
    }
    return [];
  }, [favoriteIdsSorted, libraryView, ratedIds]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const filterState = useMemo(
    () => ({
      q: deferredQuery.trim(),
      excludePresets: [...excludePresets].sort(),
      excludeIngredients: [...excludeIngredients].sort(),
      sort,
      seed,
      libraryView,
      scopedIds: libraryScopedIds
    }),
    [deferredQuery, excludePresets, excludeIngredients, sort, seed, libraryView, libraryScopedIds]
  );

  const listKey = useMemo(() => buildListKey(filterState), [filterState]);

  async function fetchPage(offset: number, reset: boolean) {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("offset", String(offset));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort", filterState.sort);
      params.set("seed", filterState.seed);
      if (filterState.libraryView !== "all" && filterState.scopedIds.length > 0) {
        params.set("ids", joinCsv(filterState.scopedIds));
      }
      if (filterState.q) {
        params.set("q", filterState.q);
      }
      if (filterState.excludePresets.length > 0) {
        params.set("excludePresets", joinCsv(filterState.excludePresets));
      }
      if (filterState.excludeIngredients.length > 0) {
        params.set("excludeIngredients", joinCsv(filterState.excludeIngredients));
      }

      const response = await fetch(`/api/smoothies?${params.toString()}`, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      const payload = (await response.json()) as SmoothieListResponse;
      if (!mountedRef.current || activeRequestRef.current !== requestId) {
        return;
      }

      setItems((current) => (reset ? payload.items : [...current, ...payload.items]));
      setTotal(payload.total);
      setNextOffset(payload.nextOffset);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
      if (reset) {
        setItems([]);
        setTotal(0);
        setNextOffset(null);
      }
    } finally {
      if (mountedRef.current && activeRequestRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (filterState.libraryView !== "all" && filterState.scopedIds.length === 0) {
      abortRef.current?.abort();
      setItems([]);
      setTotal(0);
      setNextOffset(null);
      setResolvedImageIds(new Set());
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }
    setItems([]);
    setNextOffset(0);
    setResolvedImageIds(new Set());
    void fetchPage(0, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const displayItems = useMemo(() => {
    const sorted = [...items];
    const getPriorityBoost = (item: SmoothieListItem) => {
      let boost = 0;
      if (item.hasImage || resolvedImageIds.has(item.id)) {
        boost += 40;
      }
      const personalRating = ratings[item.id] ?? 0;
      if (personalRating > 0) {
        boost += 70 + personalRating * 8;
      }
      if (favoriteSet.has(item.id)) {
        boost += 115;
      }
      return boost;
    };

    sorted.sort((a, b) => {
      const priorityDiff = getPriorityBoost(b) - getPriorityBoost(a);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      if (sort === "rating") {
        const ratingDiff = (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0);
        if (ratingDiff !== 0) {
          return ratingDiff;
        }
        if (b.popularityScore !== a.popularityScore) {
          return b.popularityScore - a.popularityScore;
        }
        return a.orderScore - b.orderScore;
      }

      if (sort === "name") {
        return a.title.localeCompare(b.title, "fr");
      }

      return a.orderScore - b.orderScore;
    });

    return sorted;
  }, [items, ratings, sort, favoriteSet, resolvedImageIds]);

  const selectedExclusionsCount = excludePresets.length + excludeIngredients.length;
  const notesCount = ratedIds.length;
  const favoritesCount = favoriteIds.length;

  const togglePreset = (preset: ExclusionPresetKey) => {
    startTransition(() => {
      setExcludePresets((current) =>
        current.includes(preset) ? current.filter((value) => value !== preset) : [...current, preset]
      );
    });
  };

  const toggleIngredient = (slug: string) => {
    startTransition(() => {
      setExcludeIngredients((current) =>
        current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug]
      );
    });
  };

  const resetFilters = () => {
    startTransition(() => {
      setQuery("");
      setSort("random");
      setExcludePresets([]);
      setExcludeIngredients([]);
      setLibraryView("all");
      setSeed(randomSeed());
    });
  };

  return (
    <main className="explorerShell">
      <section className="heroPanel">
        <div>
          <p className="eyebrow">Recettes de smoothies</p>
          <h1>Explore {meta.total.toLocaleString("fr-FR")} smoothies sans te perdre</h1>
          <p className="heroText">
            Affichage aléatoire, scroll infini optimisé (grille virtualisée), recherche par nom ou ingrédient,
            exclusions rapides et tri par note (vos votes d’abord).
          </p>
          <div className="heroPillRow" aria-label="Points forts">
            <span className="heroPill">Scroll infini fluide</span>
            <span className="heroPill">Recherche nom + ingrédients</span>
            <span className="heroPill">Filtres d’exclusion</span>
            <span className="heroPill">Notes locales</span>
            {meta.withImages === 0 ? (
              <span className="heroPill heroPillAccent">Mode sans photos optimisé</span>
            ) : null}
          </div>
        </div>
        <div className="heroStats">
          <button
            type="button"
            className={`statCard statCardButton ${libraryView === "all" ? "isActive" : ""}`}
            onClick={() => setLibraryView("all")}
            aria-pressed={libraryView === "all"}
          >
            <span className="statLabel">Recettes</span>
            <strong>{meta.total.toLocaleString("fr-FR")}</strong>
          </button>
          <div className="statCard">
            <span className="statLabel">Photos dataset</span>
            <strong>{meta.withImages.toLocaleString("fr-FR")}</strong>
          </div>
          <button
            type="button"
            className={`statCard statCardButton ${libraryView === "rated" ? "isActive" : ""}`}
            onClick={() => setLibraryView((current) => (current === "rated" ? "all" : "rated"))}
            aria-pressed={libraryView === "rated"}
          >
            <span className="statLabel">Notes personnelles</span>
            <strong>{ratingsReady ? notesCount : 0}</strong>
          </button>
          <button
            type="button"
            className={`statCard statCardButton ${libraryView === "favorites" ? "isActive" : ""}`}
            onClick={() => setLibraryView((current) => (current === "favorites" ? "all" : "favorites"))}
            aria-pressed={libraryView === "favorites"}
          >
            <span className="statLabel">Favoris</span>
            <strong>{favoritesReady ? favoritesCount : 0}</strong>
          </button>
        </div>
      </section>

      <section className="controlsPanel">
        <div className="searchRow">
          <label className="searchField">
            <span className="srOnly">Rechercher un smoothie</span>
            <input
              type="search"
              placeholder="Rechercher par nom ou ingrédient (banane, fraise, avoine...)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <button
            type="button"
            className={`btn ${showExclusions ? "isActive" : ""}`}
            onClick={() => setShowExclusions((current) => !current)}
          >
            Exclusions {selectedExclusionsCount > 0 ? `(${selectedExclusionsCount})` : ""}
          </button>

          <label className="selectWrap">
            <span className="srOnly">Tri</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="random">Aléatoire</option>
              <option value="rating">Note (vos votes d’abord)</option>
              <option value="name">Nom</option>
            </select>
          </label>

          <button type="button" className="btn btnGhost" onClick={() => setSeed(randomSeed())}>
            Nouveau hasard
          </button>

          <button type="button" className="btn btnGhost" onClick={resetFilters}>
            Réinitialiser
          </button>
        </div>

        {showExclusions ? (
          <div className="exclusionPanel">
            <div className="exclusionSection">
              <div className="sectionHeader">
                <h2>Exclusions populaires (allergènes / régimes)</h2>
                <p>Les plus fréquents dans le dataset sont affichés en premier.</p>
              </div>
              <div className="chipWrap">
                {meta.presetOptions.map((preset) => {
                  const active = excludePresets.includes(preset.key);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`chip ${active ? "isSelected" : ""}`}
                      onClick={() => togglePreset(preset.key)}
                      title={preset.description}
                    >
                      <span>{preset.label}</span>
                      <small>{preset.count}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="exclusionSection">
              <div className="sectionHeader">
                <h2>Ingrédients populaires à exclure</h2>
                <p>Exemple: banane, lait, miel, beurre de cacahuète...</p>
              </div>
              <div className="chipWrap">
                {meta.ingredientOptions.map((ingredient) => {
                  const active = excludeIngredients.includes(ingredient.slug);
                  return (
                    <button
                      key={ingredient.slug}
                      type="button"
                      className={`chip ${active ? "isSelected" : ""}`}
                      onClick={() => toggleIngredient(ingredient.slug)}
                    >
                      <span>{ingredient.label}</span>
                      <small>{ingredient.count}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

      </section>

      <VirtualSmoothieGrid
        items={displayItems}
        hasMore={nextOffset !== null}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        error={error}
        listKey={listKey}
        total={total}
        onLoadMore={() => {
          if (nextOffset === null || isLoading || isLoadingMore) {
            return;
          }
          void fetchPage(nextOffset, false);
        }}
        renderCard={(item) => (
          <SmoothieCard
            item={item}
            localRating={ratings[item.id] ?? 0}
            isRated={(ratings[item.id] ?? 0) > 0}
            onRate={(rating) => setRating(item.id, rating)}
            isFavorite={favoriteSet.has(item.id)}
            onImageStatusChange={(id, hasImage) => {
              setResolvedImageIds((current) => {
                const already = current.has(id);
                if (already === hasImage) {
                  return current;
                }
                const next = new Set(current);
                if (hasImage) {
                  next.add(id);
                } else {
                  next.delete(id);
                }
                return next;
              });
            }}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        )}
      />
    </main>
  );
}

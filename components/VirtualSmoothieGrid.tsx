"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SmoothieListItem } from "@/lib/types";

interface VirtualSmoothieGridProps {
  items: SmoothieListItem[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  listKey: string;
  total: number;
  renderCard: (item: SmoothieListItem) => React.ReactNode;
}

const GAP = 16;
const MIN_CARD_WIDTH = 280;
const CARD_HEIGHT = 360;
const OVERSCAN_ROWS = 3;

export function VirtualSmoothieGrid({
  items,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  onLoadMore,
  listKey,
  total,
  renderCard
}: VirtualSmoothieGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const loadTriggerRef = useRef<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight
      });
    });

    resizeObserver.observe(viewport);
    setViewportSize({
      width: viewport.clientWidth,
      height: viewport.clientHeight
    });

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = 0;
    setScrollTop(0);
  }, [listKey]);

  const layout = useMemo(() => {
    const width = Math.max(viewportSize.width, 1);
    const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
    const itemWidth = (width - GAP * (columns - 1)) / columns;
    const rowStep = CARD_HEIGHT + GAP;
    const rowCount = Math.ceil(items.length / columns);
    const contentHeight = rowCount > 0 ? rowCount * rowStep - GAP : 0;

    const viewportHeight = Math.max(viewportSize.height, CARD_HEIGHT);
    const startRow = Math.max(0, Math.floor(scrollTop / rowStep) - OVERSCAN_ROWS);
    const endRowExclusive = Math.min(
      rowCount,
      Math.ceil((scrollTop + viewportHeight) / rowStep) + OVERSCAN_ROWS
    );

    return {
      columns,
      itemWidth,
      rowStep,
      rowCount,
      contentHeight,
      startRow,
      endRowExclusive,
      viewportHeight
    };
  }, [items.length, viewportSize.width, viewportSize.height, scrollTop]);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) {
      loadTriggerRef.current = null;
      return;
    }

    const triggerKey = `${items.length}:${layout.endRowExclusive}:${layout.rowCount}`;
    if (loadTriggerRef.current === triggerKey) {
      return;
    }

    if (items.length === 0) {
      loadTriggerRef.current = triggerKey;
      onLoadMore();
      return;
    }

    const remainingRows = layout.rowCount - layout.endRowExclusive;
    if (remainingRows <= 4) {
      loadTriggerRef.current = triggerKey;
      onLoadMore();
    }
  }, [hasMore, isLoading, isLoadingMore, items.length, layout.rowCount, layout.endRowExclusive, onLoadMore]);

  const visibleCards = [];
  for (let row = layout.startRow; row < layout.endRowExclusive; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      const index = row * layout.columns + col;
      const item = items[index];
      if (!item) {
        continue;
      }

      visibleCards.push(
        <div
          key={item.id}
          className="vgCell"
          style={{
            width: `${layout.itemWidth}px`,
            height: `${CARD_HEIGHT}px`,
            transform: `translate(${col * (layout.itemWidth + GAP)}px, ${row * layout.rowStep}px)`
          }}
        >
          {renderCard(item)}
        </div>
      );
    }
  }

  const loadedInfo = total > 0 ? `${items.length.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")}` : "0";

  return (
    <section className="vgShell">
      <div className="vgHeader">
        <span>{loadedInfo} smoothies chargés</span>
        <span>{hasMore ? "Scroll infini actif" : "Fin de la liste"}</span>
      </div>

      <div
        ref={viewportRef}
        className="vgViewport"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {items.length === 0 && !isLoading ? (
          <div className="vgEmpty">
            <h2>Aucun smoothie trouvé</h2>
            <p>Essaie de retirer un filtre d’exclusion ou de simplifier la recherche.</p>
          </div>
        ) : (
          <div className="vgInner" style={{ height: `${Math.max(layout.contentHeight, 0)}px` }}>
            {visibleCards}
          </div>
        )}

        {(isLoading || isLoadingMore) && (
          <div className={`vgLoader ${items.length > 0 ? "isFloating" : ""}`}>
            <div className="spinner" aria-hidden="true" />
            <span>{items.length > 0 ? "Chargement de plus de recettes..." : "Chargement des recettes..."}</span>
          </div>
        )}

        {error ? <div className="vgError">{error}</div> : null}
      </div>
    </section>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import type { RegistryItem } from "@hyperframes/core/registry";
import {
  BLOCK_CATEGORIES,
  type BlockCategory,
  resolveBlockCategory,
} from "../utils/blockCategories";

type CatalogItem = RegistryItem & {
  category: BlockCategory;
};

/** One shared catalog request, aborted once no hook instance is still waiting on it. */
interface CatalogRequest {
  promise: Promise<CatalogItem[]>;
  controller: AbortController;
  consumers: number;
}

/** A hook instance's claim on the shared request; release() drops that claim once. */
interface CatalogLease {
  promise: Promise<CatalogItem[]>;
  release: () => void;
}

let catalogCache: CatalogItem[] | null = null;
let catalogRequest: CatalogRequest | null = null;

function sortByCategory(items: CatalogItem[]): CatalogItem[] {
  const indexOf = (category: BlockCategory) => {
    const index = BLOCK_CATEGORIES.findIndex((entry) => entry.id === category);
    return index === -1 ? 99 : index;
  };
  return items.sort((a, b) => indexOf(a.category) - indexOf(b.category));
}

function startCatalogRequest(): CatalogRequest {
  const controller = new AbortController();
  const request: CatalogRequest = { promise: Promise.resolve([]), controller, consumers: 0 };
  request.promise = fetch("/api/registry/blocks", { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load catalog");
      return response.json() as Promise<RegistryItem[]>;
    })
    .then((items) => {
      const loaded = sortByCategory(
        items.map((item) => ({ ...item, category: resolveBlockCategory(item.tags) })),
      );
      catalogCache = loaded;
      return loaded;
    })
    .catch((error: unknown) => {
      if (catalogRequest === request) catalogRequest = null;
      throw error;
    });
  return request;
}

/** Joins the shared catalog request. The request is aborted when its last consumer leaves. */
function acquireCatalog(): CatalogLease {
  const request = catalogRequest ?? startCatalogRequest();
  catalogRequest = request;
  request.consumers += 1;
  let released = false;
  return {
    promise: request.promise,
    release() {
      if (released) return;
      released = true;
      request.consumers -= 1;
      if (request.consumers === 0 && !catalogCache && catalogRequest === request) {
        catalogRequest = null;
        request.controller.abort();
      }
    },
  };
}

export function useBlockCatalog() {
  const [blocks, setBlocks] = useState<CatalogItem[]>(() => catalogCache ?? []);
  const [loading, setLoading] = useState(catalogCache === null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<BlockCategory | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (catalogCache) return;
    let cancelled = false;
    const lease = acquireCatalog();
    setLoading(true);
    setError(null);
    lease.promise
      .then(
        (items) => {
          if (!cancelled) setBlocks(items);
        },
        (err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to load catalog");
          }
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      lease.release();
    };
  }, [attempt]);

  /** Loads the catalog again after a failure. */
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    if (category) {
      result = result.filter((b) => b.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [blocks, category, search]);

  return {
    blocks,
    loading,
    error,
    search,
    setSearch,
    category,
    setCategory,
    filteredBlocks,
    retry,
  };
}

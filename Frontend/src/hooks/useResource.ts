"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { toError } from "@/lib/api/services";
import type { ApiError } from "@/lib/types";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

/** Small data-fetching hook: loading, error, retry, and in-place updates. */
export function useResource<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loaderRef.current()
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (active) setState({ data: null, loading: false, error: toError(error) }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  const setData = useCallback((updater: T | ((previous: T | null) => T | null)) => {
    setState((prev) => ({
      ...prev,
      data: typeof updater === "function"
        ? (updater as (previous: T | null) => T | null)(prev.data)
        : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}

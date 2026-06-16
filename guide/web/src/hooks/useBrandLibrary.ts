import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from '../types/library';
import { fetchLibraryItems } from '../utils/libraryApi';
import { usePageVisibleRefresh } from './usePageVisibleRefresh';

export function useBrandLibrary() {
  const [brands, setBrands] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshTick = usePageVisibleRefresh();

  const refresh = useCallback(() => {
    setLoading(true);
    return fetchLibraryItems({ category: 'brand', limit: 120 })
      .then(setBrands)
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchLibraryItems({ category: 'brand', limit: 120, signal: controller.signal })
      .then(setBrands)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setBrands([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [refreshTick]);

  return { brands, loading, refresh };
}
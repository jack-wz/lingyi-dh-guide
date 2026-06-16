import { useEffect, useState } from 'react';

/** Bump a counter when the tab becomes visible again (e.g. returning from /assets). */
export function usePageVisibleRefresh(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', bump);
    window.addEventListener('focus', bump);
    return () => {
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('focus', bump);
    };
  }, []);

  return tick;
}
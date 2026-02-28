import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Sync active tab with URL search params (?tab=xxx).
 * Enables deep-linking and browser back/forward for tabs.
 */
export function useTabs(defaultTab: string, paramName = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get(paramName) || defaultTab;

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab === defaultTab) {
          next.delete(paramName);
        } else {
          next.set(paramName, tab);
        }
        return next;
      }, { replace: true });
    },
    [defaultTab, paramName, setSearchParams],
  );

  return [activeTab, setTab] as const;
}

import { useRef, useCallback } from 'react';

export function useUnsavedChanges() {
  const snapshot = useRef('');

  const takeSnapshot = useCallback((values: unknown) => {
    snapshot.current = JSON.stringify(values);
  }, []);

  const isDirty = useCallback((currentValues: unknown): boolean => {
    return JSON.stringify(currentValues) !== snapshot.current;
  }, []);

  return { takeSnapshot, isDirty };
}

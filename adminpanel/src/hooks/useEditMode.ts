import { useState, useEffect, useCallback } from 'react';

/**
 * Reusable hook for view/edit mode pattern.
 * - View mode (default): shows read-only data
 * - Edit mode: shows editable draft, with save/cancel
 *
 * Syncs draft with initialValues when NOT editing (e.g. after parent reload).
 */
export function useEditMode<T extends Record<string, unknown>>(initialValues: T) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);

  // Sync draft when initialValues change and NOT in edit mode
  useEffect(() => {
    if (!isEditing) {
      setDraft(initialValues);
    }
  }, [initialValues, isEditing]);

  const startEditing = useCallback(() => {
    setDraft(initialValues);
    setIsEditing(true);
  }, [initialValues]);

  const cancelEditing = useCallback(() => {
    setDraft(initialValues);
    setIsEditing(false);
  }, [initialValues]);

  const updateField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    isEditing,
    draft,
    saving,
    setSaving,
    startEditing,
    cancelEditing,
    updateField,
    setIsEditing,
  };
}

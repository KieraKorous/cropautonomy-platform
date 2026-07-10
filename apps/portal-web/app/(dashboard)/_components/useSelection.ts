"use client";

import { useCallback, useEffect, useState } from "react";

// Multi-select state for a list view. `ids` is the current set of selectable ids
// (pass a memoized array so this doesn't churn each render); anything selected
// that drops out of `ids` — e.g. after a bulk discard removes it — is pruned so
// the selection can't reference gone rows.
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const present = new Set(ids);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Select-all toggle over the currently-visible ids: if all are already
  // selected, clear them; otherwise select every visible id.
  const toggleAll = useCallback((visibleIds: string[]) => {
    setSelected((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, toggle, clear, toggleAll, isSelected };
}

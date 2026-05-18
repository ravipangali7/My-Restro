import { useCallback, useMemo, useState } from "react";

export type ListItemId = number | string;

export function useListSelection(pageItems: { id: ListItemId }[]) {
  const [selectedIds, setSelectedIds] = useState<ListItemId[]>([]);

  const pageIds = useMemo(() => pageItems.map((item) => item.id), [pageItems]);
  const pageIdSet = useMemo(() => new Set(pageIds), [pageIds]);

  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const someOnPageSelected = pageIds.some((id) => selectedIds.includes(id));

  const isSelected = useCallback((id: ListItemId) => selectedIds.includes(id), [selectedIds]);

  const toggle = useCallback((id: ListItemId, checked?: boolean) => {
    setSelectedIds((prev) => {
      const on = checked ?? !prev.includes(id);
      if (on) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const merged = new Set([...prev, ...pageIds]);
      return [...merged];
    });
  }, [pageIds]);

  const deselectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
  }, [pageIdSet]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const toggleSelectAllOnPage = useCallback(() => {
    if (allOnPageSelected) deselectAllOnPage();
    else selectAllOnPage();
  }, [allOnPageSelected, deselectAllOnPage, selectAllOnPage]);

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    isSelected,
    toggle,
    selectAllOnPage,
    deselectAllOnPage,
    toggleSelectAllOnPage,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    selectAllIndeterminate: someOnPageSelected && !allOnPageSelected,
  };
}

export type ListSelectionApi = ReturnType<typeof useListSelection>;

export type ListItemSelectionProps = {
  selectable: true;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
};

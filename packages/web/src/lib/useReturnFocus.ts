import { useLayoutEffect, useRef } from 'react';

export function useReturnFocus(open: boolean, target: () => HTMLElement | null | undefined): void {
  const previous = useRef(open);
  useLayoutEffect(() => {
    const active = document.activeElement;
    // Safari can focus the skip-link landing container when a clicked form control disappears.
    // Restore from that neutral container while preserving focus on another control.
    const canRestore = active === document.body || active?.hasAttribute('data-focus-fallback');
    if (previous.current && !open && canRestore) target()?.focus();
    previous.current = open;
  }, [open, target]);
}

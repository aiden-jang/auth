import { useLayoutEffect, useRef } from 'react';

export function useReturnFocus(open: boolean, target: () => HTMLElement | null | undefined): void {
  const previous = useRef(open);
  useLayoutEffect(() => {
    if (previous.current && !open && document.activeElement === document.body) target()?.focus();
    previous.current = open;
  }, [open, target]);
}

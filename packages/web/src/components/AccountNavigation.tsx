import { useEffect, useRef, type ReactNode } from 'react';
import type { useAccountNavigation } from '../lib/useAccountNavigation';

export function AccountNavigation({
  navigation,
}: {
  navigation: ReturnType<typeof useAccountNavigation>;
}): ReactNode {
  const previous = useRef(navigation.selected.id);
  useEffect(() => {
    if (previous.current !== navigation.selected.id) {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || active.getClientRects().length === 0)
        document.getElementById('account-page-heading')?.focus();
    }
    previous.current = navigation.selected.id;
  }, [navigation.selected.id]);
  return (
    <nav className="hub-navigation" aria-label="Account sections">
      {navigation.items.map((section) => (
        <a
          key={section.id}
          href={`#${section.hash}`}
          aria-current={navigation.selected.id === section.id ? 'page' : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigation.select(section.id);
          }}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

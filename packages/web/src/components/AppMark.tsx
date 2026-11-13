import type { ReactNode } from 'react';

const icons: Record<string, string> = {
  bloomnote: 'bloomnote',
  mrrp: 'mrrp',
  owewell: 'owewell',
  wherever: 'wherever',
  iguess: 'iguess',
  'everything is fine': 'everythingisfine',
};

export function AppMark({ name }: { name: string }): ReactNode {
  return icons[name] ? (
    <img className="app-mark" src={`/apps/${icons[name]}.svg`} alt="" aria-hidden />
  ) : (
    <span className="app-mark app-mark-letter" aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

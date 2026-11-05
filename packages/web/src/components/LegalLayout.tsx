import { Children, isValidElement, type ReactNode } from 'react';
import { AccountShell } from './AccountShell';
import { AccountIcon } from './AccountIcon';

function sectionId(heading: string): string {
  return `legal-${heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}): ReactNode {
  const headings = Children.toArray(children).flatMap((child) =>
    isValidElement<{ heading: string }>(child) && child.type === Section
      ? [child.props.heading]
      : [],
  );
  const links = headings.map((heading) => (
    <a href={`#${sectionId(heading)}`} key={heading}>
      {heading}
    </a>
  ));
  return (
    <AccountShell title={title} subtitle={`Last updated: ${updated}`} legal>
      <aside className="legal-contents">
        <h2>On this page</h2>
        <nav aria-label={`${title} sections`}>{links}</nav>
      </aside>
      <div className="min-w-0">
        <details className="legal-mobile-contents">
          <summary>
            <AccountIcon kind="list" />
            On this page
            <AccountIcon kind="chevron" />
          </summary>
          <nav aria-label={`${title} sections`}>{links}</nav>
        </details>
        <article className="legal-document" aria-label={title}>
          {children}
        </article>
      </div>
    </AccountShell>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section id={sectionId(heading)}>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

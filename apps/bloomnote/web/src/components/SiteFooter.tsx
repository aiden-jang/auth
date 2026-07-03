import { AUTH_ORIGIN } from '../auth/AuthContext';

// Privacy + Terms live once on the shared account app (accounts.aidenjang.com). Built from
// AUTH_ORIGIN so local dev points at the local auth service.
const privacyUrl = new URL('/privacy', AUTH_ORIGIN).toString();
const termsUrl = new URL('/terms', AUTH_ORIGIN).toString();

const linkStyle: React.CSSProperties = {
  color: 'var(--color-ink-muted, #6b6963)',
  textDecoration: 'none',
};

export default function SiteFooter() {
  return (
    <footer
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--color-ink-muted, #6b6963)',
      }}
    >
      <p style={{ margin: 0 }}>bloomnote · say it with a garden</p>
      <nav style={{ display: 'flex', gap: '1rem' }}>
        <a href={privacyUrl} style={linkStyle}>
          Privacy
        </a>
        <a href={termsUrl} style={linkStyle}>
          Terms
        </a>
      </nav>
    </footer>
  );
}

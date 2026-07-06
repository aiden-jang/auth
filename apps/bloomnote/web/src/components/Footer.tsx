import { type CSSProperties } from 'react'
import { AUTH_ORIGIN } from '../auth/AuthContext'

// The one site footer, rendered under every bloomnote view (see App.tsx). Credit + the shared
// legal pages, which live on the account app — built from AUTH_ORIGIN so dev points local.
const privacyUrl = new URL('/privacy', AUTH_ORIGIN).toString()
const termsUrl = new URL('/terms', AUTH_ORIGIN).toString()

const wrap: CSSProperties = {
  padding: '2.5rem 1.5rem',
  textAlign: 'center',
  fontSize: '0.8rem',
  color: 'var(--color-ink-muted, #6b6963)',
}
const link: CSSProperties = { color: 'inherit', textDecoration: 'none' }

export default function Footer() {
  return (
    <footer style={wrap}>
      made by{' '}
      <a href="https://www.aidenjang.com" target="_blank" rel="noreferrer" style={link}>
        aiden jang
      </a>
      {' · '}
      <a href={privacyUrl} style={link}>
        privacy
      </a>
      {' · '}
      <a href={termsUrl} style={link}>
        terms
      </a>
    </footer>
  )
}

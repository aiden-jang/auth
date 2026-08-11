/** Direct inbox handoff for the common consumer email providers. */
export function inboxFor(email: string): { label: string; href: string } | null {
  const domain = email.trim().split('@').pop()?.toLowerCase();
  if (!domain) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { label: 'Open Gmail', href: 'https://mail.google.com/' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { label: 'Open Outlook', href: 'https://outlook.live.com/mail/' };
  }
  if (domain === 'yahoo.com') return { label: 'Open Yahoo Mail', href: 'https://mail.yahoo.com/' };
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return { label: 'Open iCloud Mail', href: 'https://www.icloud.com/mail/' };
  }
  return null;
}

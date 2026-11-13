import { useLocation, useNavigate } from 'react-router-dom';

const sections = [
  {
    id: 'apps',
    hash: 'account-apps',
    label: 'Apps',
    title: 'Your apps',
    subtitle: 'One account. A few good places to go.',
  },
  {
    id: 'profile',
    hash: 'account-profile',
    label: 'Profile',
    title: 'Profile',
    subtitle: 'Your name and email, in one place.',
  },
  {
    id: 'signin',
    hash: 'account-security',
    label: 'Sign-in',
    title: 'How you sign in',
    subtitle: 'Manage your password, Google account, and passkeys.',
  },
  {
    id: 'devices',
    hash: 'active-sessions',
    label: 'Devices',
    title: 'Devices',
    subtitle: 'See where your account is signed in.',
  },
  {
    id: 'data',
    hash: 'account-data',
    label: 'Data',
    title: 'Your data',
    subtitle: 'Take a copy of your account data or delete your account.',
  },
] as const;

export function useAccountNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const hash =
    location.hash === '#security'
      ? '#account-security'
      : location.hash === '#delete-account'
        ? '#account-data'
        : location.hash;
  const fallback =
    params.get('delete') === 'confirm'
      ? 4
      : params.get('password') === 'change' ||
          params.get('security') === 'review' ||
          params.get('error') === 'google_failed'
        ? 2
        : 0;
  const selected = sections.find((section) => `#${section.hash}` === hash) ?? sections[fallback];
  const select = (id: (typeof sections)[number]['id'], replace = false) => {
    const section = sections.find((item) => item.id === id)!;
    const current = new URL(window.location.href);
    void navigate(
      { pathname: '/account', search: current.search, hash: `#${section.hash}` },
      { replace },
    );
  };
  return { items: sections, selected, select };
}

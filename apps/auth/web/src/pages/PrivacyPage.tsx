import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function PrivacyPage(): ReactNode {
  return (
    <LegalLayout title="Privacy Policy" updated="July 6, 2026">
      <p>
        Aiden Jang builds a small collection of personal apps under the name aidenjang. This is what
        they store, why, and who else sees it. Written to actually be read, because a privacy policy
        nobody reads protects nobody.
      </p>

      <Section heading="Which apps need an account">
        Only two of them do. owewell and bloomnote share one login, so the account details below
        apply there. wherever and is-it-a-dog need no account at all: they run on temporary room
        codes and forget the room once everyone leaves.
      </Section>

      <Section heading="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account:</strong> your email, display name, and a securely hashed password (never
            the password itself). Email signs you in, verifies your address, and resets it if you
            forget.
          </li>
          <li>
            <strong>owewell:</strong> the groups, expenses, splits, and settlements you enter,
            including names you add for people without accounts. Scanned receipts are sent to an AI
            service to read the line items and are not kept afterward.
          </li>
          <li>
            <strong>bloomnote:</strong> the notes and gardens you make and the short links you share
            them through. Works signed out; signed in, the gardens you send and open are tied to your
            account so you can find them again.
          </li>
          <li>
            <strong>wherever:</strong> the room code, the restaurant options, and everyone&rsquo;s
            votes. Tied to a throwaway room, not to you, and gone when the room ends.
          </li>
          <li>
            <strong>is-it-a-dog:</strong> the room code, the drawings, and the guesses, but only
            while the game is running. Nothing survives the room.
          </li>
          <li>
            <strong>Technical:</strong> standard request logs (IP, timestamp, error traces) kept
            briefly for debugging and abuse prevention, plus aggregate, cookieless page-view counts.
          </li>
        </ul>
      </Section>

      <Section heading="Cookies and analytics">
        One essential cookie holds your login session so you are not asked to sign in on every click.
        That is the only one. Analytics are cookieless (Cloudflare Web Analytics counts visits without
        following you across sites), so there is no consent banner to dismiss.
      </Section>

      <Section heading="Who else sees your data">
        No selling, no renting, no advertising. A few providers process data on our behalf:
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Cloudflare</strong> hosts every app and stores its data (databases, key-value,
            edge storage).
          </li>
          <li>
            <strong>An email provider</strong> delivers verification and password-reset messages.
          </li>
          <li>
            <strong>AI providers</strong> power two features: bloomnote sends your note text to Google
            (Gemini) to grow a garden, and owewell sends receipt images to a vision model to read
            them. Send only what you are fine sharing with those services.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> runs a privacy-preserving bot check on sign-up.
          </li>
        </ul>
      </Section>

      <Section heading="Keeping and deleting your data">
        Account data stays until you remove it or ask us to. You can delete groups, expenses, and
        gardens inside the apps. wherever and is-it-a-dog rooms are temporary and clear themselves, so
        there is nothing to delete. To wipe your entire account and everything attached to it, email{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>{' '}
        and it is done. You can also ask for a copy of what we hold.
      </Section>

      <Section heading="A note on other people's data">
        owewell lets you add names and amounts for people who never signed up. Add only what you are
        entitled to share, and keep it to what a split needs (a name and what they owe, not their life
        story).
      </Section>

      <Section heading="Children and changes">
        These apps are not meant for anyone under 13, and we do not knowingly collect their data. If
        this policy changes in a way that matters, the date at the top changes with it, and continuing
        to use the apps means the update is fine by you. Questions go to{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>
        .
      </Section>
    </LegalLayout>
  );
}

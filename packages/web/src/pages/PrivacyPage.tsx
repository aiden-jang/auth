import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function PrivacyPage(): ReactNode {
  return (
    <LegalLayout title="Privacy Policy" updated="August 27, 2026">
      <p>
        Aiden Jang builds a small collection of personal apps under the name aidenjang. This is what
        they store, why, and who else sees it. Written to actually be read, because a privacy policy
        nobody reads protects nobody.
      </p>

      <Section heading="Do you need an account">
        No. Every app works without one. Signing in is optional and just saves your stuff across
        your devices: your groups and expenses in owewell, the gardens you make in bloomnote, your
        seat in an mrrp room. wherever and iguess run on throwaway room codes that clear when
        everyone leaves, so there is nothing to save and nothing to sign in for. The account details
        below apply only when you choose to sign in.
      </Section>

      <Section heading="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account:</strong> your email and display name, plus a securely hashed password
            if you sign up with one (never the password itself). You can also continue with Google,
            in which case Google confirms your email and name for you and no password is stored.
            Email signs you in, verifies your address, and resets it if you forget.
          </li>
          <li>
            <strong>owewell:</strong> the groups, expenses, splits, and settlements you enter,
            including names you add for people without accounts. Scanned receipts are sent to an AI
            service to read the line items and are not kept afterward.
          </li>
          <li>
            <strong>bloomnote:</strong> the notes and gardens you make and the short links you share
            them through. Works signed out; signed in, the gardens you send and open are tied to
            your account so you can find them again.
          </li>
          <li>
            <strong>mrrp:</strong> a room is one private link shared by two people, so anyone
            holding that link can watch the cat. In it: the two names you type in, her timezone and
            the hour she is usually home, the mood she taps (kept for that day only), one line she
            leaves and the notes he writes for her, a drawing either of you puts in the frame, and a
            date you can ask the room to remember. Also how long the room has been going and a
            short, capped list of recent visits, which is what makes the cat seem to know you. If
            you tie a seat to your account, the room stores which account it is and nothing else
            about you. Unlike the rooms below, an mrrp room is meant to last, so it stays until one
            of you ends it.
          </li>
          <li>
            <strong>wherever:</strong> the room code, the restaurant options, and everyone&rsquo;s
            votes. Tied to a throwaway room, not to you, and gone when the room ends.
          </li>
          <li>
            <strong>iguess:</strong> the room code, the drawings, and the guesses, but only while
            the game is running. Nothing survives the room.
          </li>
          <li>
            <strong>Sessions:</strong> for the "active devices" list on your account, each sign-in
            keeps a device label (like "Chrome on macOS") and a coarse city/country from Cloudflare,
            not your raw IP. You can sign any of them out from your account page.
          </li>
          <li>
            <strong>Technical:</strong> standard request logs (IP, timestamp, error traces) kept
            briefly for debugging and abuse prevention, plus aggregate, cookieless page-view counts.
          </li>
        </ul>
      </Section>

      <Section heading="Cookies and analytics">
        One essential cookie holds your login session so you are not asked to sign in on every
        click. That is the only one. Analytics are cookieless (Cloudflare Web Analytics counts
        visits without following you across sites), so there is no consent banner to dismiss. We
        also count how often each sign-in method is used and when a password is changed or added,
        with no account, email or address attached.
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
            <strong>AI providers</strong> power two features: bloomnote sends your note text to
            Google (Gemini) to grow a garden, and owewell sends receipt images to a vision model to
            read them. Send only what you are fine sharing with those services.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> runs a privacy-preserving bot check on sign-up.
          </li>
          <li>
            <strong>Open-Meteo</strong> tells mrrp what the weather is doing, so the window in the
            room can show it. It is sent a point in the middle of the timezone the room was set to,
            which is the same for everyone who picked that timezone. It is not sent your location,
            and nothing that identifies you or the room goes with it.
          </li>
        </ul>
      </Section>

      <Section heading="Keeping and deleting your data">
        Account data stays until you remove it or ask us to. You can delete groups, expenses, and
        gardens inside the apps. wherever and iguess rooms are temporary and clear themselves, so
        there is nothing to delete. An mrrp room is built to last, and both people in it have a way
        out: whoever made the room can delete the whole thing, and the other one can leave, which
        takes their side of it and leaves the room standing. Both take effect at once, and both can
        be undone for a week. A deleted room is unreachable straight away and erased for good a week
        later, and only the person who deleted it can put it back inside that week. Someone who has
        left can put their side back for a week too, for as long as nobody else has taken the seat
        they freed. To wipe your entire account and everything attached to it, email{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>{' '}
        and it is done. You can also ask for a copy of what we hold, and in mrrp you do not have to
        ask: open &ldquo;delete this room&rdquo; or &ldquo;leave this room&rdquo; and the
        &ldquo;Take a copy first&rdquo; link hands you the lot as a file.
      </Section>

      <Section heading="A note on other people's data">
        owewell lets you add names and amounts for people who never signed up. Add only what you are
        entitled to share, and keep it to what a split needs (a name and what they owe, not their
        life story).
      </Section>

      <Section heading="Children and changes">
        These apps are not meant for anyone under 13, and we do not knowingly collect their data. If
        this policy changes in a way that matters, the date at the top changes with it, and
        continuing to use the apps means the update is fine by you. Questions go to{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>
        .
      </Section>
    </LegalLayout>
  );
}

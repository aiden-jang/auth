import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function PrivacyPage(): ReactNode {
  return (
    <LegalLayout title="Privacy Policy" updated="November 10, 2026">
      <p>
        Aiden Jang builds a small collection of personal apps under the name aidenjang. This is what
        they store, why, and who else sees it. Written to actually be read, because a privacy policy
        nobody reads protects nobody.
      </p>

      <Section heading="Do you need an account">
        It depends on the app. Worth uses an account for your private archive; its signed-out
        example does not save to that archive. owewell and bloomnote offer signed-out use, with
        sign-in for account features, and mrrp can link a room seat to your account. wherever and
        iguess use temporary rooms without an account. The account details below apply when you use
        the shared sign-in service.
      </Section>

      <Section heading="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account:</strong> your email and display name, plus a securely hashed password
            if you sign up with one (never the password itself). You can also continue with Google,
            in which case Google confirms your email and name for you and no password is stored.
            Email is used for verification, password recovery, and security notifications. If you
            add a passkey, we store its public credential, label, and usage metadata. Your private
            key and biometric checks stay with your device or passkey provider.
          </li>
          <li>
            <strong>Worth:</strong> the records, notes, photos, receipts, activity entries, and
            sharing choices you save. Photo-text recognition runs on your device; a receipt image is
            uploaded only if you choose to attach the checked copy. Device drafts and optional
            offline copies also use local storage. Details are in{' '}
            <a className="text-accent hover:underline" href="https://worth.aidenjang.com/privacy">
              Worth’s privacy policy
            </a>
            .
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
            <strong>wherever:</strong> the room code, the search area, restaurant options, and votes
            are stored in a temporary room. wherever keeps individual ballots private from other
            participants. The room sees the group result, and the host can choose to show who has
            finished voting. People in small rooms may infer votes from the result. Rooms expire
            after seven days, along with their visited-place history.
          </li>
          <li>
            <strong>iguess:</strong> the room code, names, avatars, drawings, scores and game
            progress in temporary recovery checkpoints, which expire after a day of inactivity. Chat
            messages are not included in those checkpoints. AI guessing can send drawings and masked
            hints to a configured vision provider. The secret word is not sent to the AI guesser.
          </li>
          <li>
            <strong>Sessions:</strong> for the "active devices" list on your account, each sign-in
            keeps a device label (like "Chrome on macOS") and a coarse city/country from Cloudflare,
            not your raw IP. You can sign any of them out from your account page.
          </li>
          <li>
            <strong>Technical:</strong> standard request logs (IP, timestamp, error traces) kept
            briefly for debugging and abuse prevention, plus aggregate, cookieless page-category and
            feature-use counts.
          </li>
        </ul>
      </Section>

      <Section heading="Cookies and analytics">
        Essential cookies keep your shared login session and protect Google and passkey sign-in
        handshakes. Recent-account email hints and a passkey-use hint stay on this device; you can
        forget a recent account from the sign-in screen. App analytics are cookieless aggregate
        counters. We send fixed page categories and action names, without private URLs, account IDs,
        email addresses, names or message text. Browser counters respect Global Privacy Control and
        Do Not Track. The public portfolio and globe also use privacy-focused traffic and
        performance analytics. We also count how often each sign-in method is used and when a
        password is changed or added, with no account, email or address attached.
      </Section>

      <Section heading="Who else sees your data">
        No selling, no renting, no advertising. A few providers process data on our behalf:
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Cloudflare</strong> hosts Accounts and app services and stores data in its
            databases and edge storage. <strong>Vercel</strong> hosts the public portfolio and
            processes its traffic and performance measurements.
          </li>
          <li>
            <strong>An email provider</strong> delivers verification and password-reset messages.
          </li>
          <li>
            <strong>AI providers:</strong> bloomnote sends your note text to Google (Gemini) to grow
            a garden, and owewell sends receipt images to a vision model to read them. iguess can
            send drawings and masked hints to Cloudflare Workers AI, or to OpenAI or Anthropic when
            those providers are configured. Worth’s photo-text recognition stays on-device. Send
            only what you are fine sharing with those services.
          </li>
          <li>
            <strong>Google Maps in wherever:</strong> When you search by town or ZIP code, wherever
            sends the text you enter to Google’s Geocoding service to find its coordinates. To find
            restaurants, wherever sends Google Places the search area’s latitude, longitude, and
            search radius. The area can come from your device location if you allow and use it, a
            town or ZIP code you searched for, an NYC neighborhood you chose, or the default search
            area in New York City. See{' '}
            <a className="text-accent hover:underline" href="https://policies.google.com/privacy">
              Google’s Privacy Policy
            </a>{' '}
            and{' '}
            <a
              className="text-accent hover:underline"
              href="https://wherever.aidenjang.com/privacy.html"
            >
              wherever’s privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> runs a bot check on sign-in, sign-up, and password
            recovery.
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
        Account data stays until you remove it or ask us to. Accounts lets you download or delete
        your identity account. App data is held separately: remove it in each app before deleting
        your shared sign-in, or contact us for help. Worth has its own export, Trash, and
        data-deletion controls. owewell supports expense removal and reversal of recorded payments;
        contact us for group-wide or account-data removal. Removing a Bloomnote library entry leaves
        its shared garden link working; contact us to request a copy or removal of stored gardens.
        wherever rooms expire after seven days, and iguess recovery checkpoints after a day of
        inactivity. Browser copies and downloaded files are separate from server data and can be
        removed through this browser’s site-data controls or your device’s file manager. An mrrp
        room is built to last, and both people in it have a way out: whoever made the room can
        delete the whole thing, and the other one can leave, which takes their side of it and leaves
        the room standing. Both take effect at once, and both can be undone for a week. A deleted
        room is unreachable straight away and erased for good a week later, and only the person who
        deleted it can put it back inside that week. Someone who has left can put their side back
        for a week too, for as long as nobody else has taken the seat they freed. For deletion or
        data-access requests, email{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>
        . You can also ask for a copy of what we hold, and in mrrp you do not have to ask: open
        &ldquo;delete this room&rdquo; or &ldquo;leave this room&rdquo; and the &ldquo;Take a copy
        first&rdquo; link hands you the lot as a file.
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

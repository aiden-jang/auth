import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function PrivacyPage(): ReactNode {
  return (
    <LegalLayout title="Privacy Policy" updated="July 3, 2026">
      <p>
        aidenjang is a small collection of personal apps (owewell, bloomnote, and friends) that
        share one login. This explains what those apps store, why, and who else sees it. Plain
        language, because a privacy policy nobody reads protects nobody.
      </p>

      <Section heading="Who runs this">
        These apps are a personal, non-commercial project by Aiden Jang. There is no company, no
        sales team, and no one to sell your data to. Questions go to{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>
        .
      </Section>

      <Section heading="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Account:</strong> your email, display name, and a securely hashed password
            (never the password itself). Email is used to sign you in, verify your address, and
            reset it if you forget.
          </li>
          <li>
            <strong>owewell:</strong> the groups, expenses, splits, and settlements you enter,
            including names you add for people who do not have accounts. If you scan a receipt, its
            image is sent to an AI service to read the line items (see below) and is not retained
            afterward.
          </li>
          <li>
            <strong>bloomnote:</strong> the notes and gardens you create and the short links you
            share them through. bloomnote works signed out; if you are signed in, gardens you send
            and open are tied to your account so you can find them again.
          </li>
          <li>
            <strong>Technical:</strong> standard request logs (IP, timestamp, error traces) kept
            briefly for debugging and abuse prevention, and aggregate, cookieless page-view counts.
          </li>
        </ul>
      </Section>

      <Section heading="Cookies">
        One essential cookie holds your login session so you are not asked to sign in on every
        click. That is it. Analytics are cookieless (Cloudflare Web Analytics, which counts visits
        without tracking you across sites), so there is no consent banner to click through.
      </Section>

      <Section heading="Who else sees your data">
        We do not sell or rent your data, and there is no advertising. A few service providers
        process it on our behalf:
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Cloudflare</strong> hosts the apps and stores their data (databases, key-value,
            edge storage).
          </li>
          <li>
            <strong>An email provider</strong> delivers verification and password-reset messages.
          </li>
          <li>
            <strong>AI providers</strong> power a couple of features: bloomnote sends your note text
            to Google (Gemini) to generate a garden, and owewell sends receipt images to a vision
            model to read them. Send only what you are comfortable sharing with those services.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> runs a privacy-preserving bot check on sign-up.
          </li>
        </ul>
      </Section>

      <Section heading="Keeping and deleting your data">
        Your data stays until you remove it or ask us to. You can delete groups, expenses, and
        gardens in the apps. To delete your entire account and everything attached to it, email{' '}
        <a className="text-accent hover:underline" href="mailto:privacy@aidenjang.com">
          privacy@aidenjang.com
        </a>{' '}
        and it will be done. You can also ask for a copy of what we hold about you.
      </Section>

      <Section heading="A note on other people's data">
        owewell lets you add names and amounts for people who never signed up. Only add information
        you are entitled to share, and keep it to what a split actually needs (a name and what they
        owe, not their life story).
      </Section>

      <Section heading="Children">
        These apps are not intended for anyone under 13, and we do not knowingly collect their data.
      </Section>

      <Section heading="Changes">
        If this policy changes in a way that matters, the date at the top changes too. Continuing to
        use the apps after that means you are fine with the update.
      </Section>
    </LegalLayout>
  );
}

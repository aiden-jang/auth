import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function TermsPage(): ReactNode {
  return (
    <LegalLayout title="Terms of Service" updated="July 3, 2026">
      <p>
        By using aidenjang's apps (owewell, bloomnote, and the shared account), you agree to these
        terms. They are short on purpose.
      </p>

      <Section heading="The deal">
        These are free, personal apps offered as-is. They may change, break, or disappear without
        notice, and there is no uptime promise. Do not build anything you cannot afford to lose on
        top of them.
      </Section>

      <Section heading="Your account">
        You are responsible for what happens under your login, so keep your password to yourself.
        You need to be at least 13 to use these apps. One human, one account, no impersonating
        anyone else.
      </Section>

      <Section heading="Your content is yours">
        You keep ownership of what you put in (expenses, notes, gardens, names). You grant us only
        the permission needed to store and display it back to you and to the people you share it
        with. We do not claim it, sell it, or train anything on it.
      </Section>

      <Section heading="Play nice">
        Do not use the apps to break the law, harass people, upload other people's private
        information without permission, attack the service, or try to knock it over. Doing so is a
        quick way to lose access.
      </Section>

      <Section heading="On the math (owewell)">
        owewell does its best to divide the bill fairly, but it is a convenience, not an accountant.
        Double-check anything that matters before real money changes hands. Who actually pays whom is
        between you and your friends.
      </Section>

      <Section heading="On the AI (bloomnote and receipts)">
        Some features are powered by AI, which is confidently wrong on a regular basis. Generated
        gardens are for fun, and scanned receipt totals should be reviewed. Treat both as a helpful
        first draft, not gospel.
      </Section>

      <Section heading="No warranty, limited liability">
        The apps come with no warranties of any kind. To the extent the law allows, aidenjang is not
        liable for any losses arising from using (or being unable to use) them. If some part of this
        is unenforceable where you live, the rest still stands.
      </Section>

      <Section heading="Ending things">
        You can stop using the apps and delete your account any time. We can suspend access if these
        terms are broken or if a feature is retired.
      </Section>

      <Section heading="Questions">
        Reach out at{' '}
        <a className="text-accent hover:underline" href="mailto:hello@aidenjang.com">
          hello@aidenjang.com
        </a>
        . See also the{' '}
        <a className="text-accent hover:underline" href="/privacy">
          Privacy Policy
        </a>
        .
      </Section>
    </LegalLayout>
  );
}

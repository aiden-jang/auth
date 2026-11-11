import type { ReactNode } from 'react';
import { LegalLayout, Section } from '../components/LegalLayout';

export function TermsPage(): ReactNode {
  return (
    <LegalLayout title="Terms of Service" updated="November 10, 2026">
      <p>
        By using Accounts or an aidenjang app, you agree to these terms. Individual apps may also
        explain their own features and data handling in their terms and privacy pages.
      </p>

      <Section heading="The deal">
        These are free, personal apps offered as-is. They may change, break, or disappear without
        notice, and there is no uptime promise. Do not build anything you cannot afford to lose on
        top of them.
      </Section>

      <Section heading="Your account">
        Worth, owewell, and bloomnote use the shared Accounts login, and mrrp can optionally use it;
        wherever and iguess need no account at all. Where you do have a login, you are responsible
        for what happens under it, so keep your password to yourself. You need to be at least 13.
        One human, one account, no impersonating anyone else.
      </Section>

      <Section heading="Your content is yours">
        You keep ownership of what you put in: expenses, notes, gardens, names, drawings, guesses,
        votes. You grant us permission to store and process your content as needed to provide the
        features you use, including showing it to the people you share a link or room with and
        sending it to an AI provider for features described in the Privacy Policy. We do not claim
        ownership of your content, sell it, or use it to train models.
      </Section>

      <Section heading="Play nice">
        Do not use the apps to break the law, harass people, upload other people&rsquo;s private
        information without permission, or attack the service. In iguess, people in your room can
        see your drawings and guesses as the game reveals them. Individual votes in wherever stay
        private. The room sees the group result, and the host can choose to show who has finished
        voting. Misbehaving is a quick way to lose access.
      </Section>

      <Section heading="On the math (owewell)">
        owewell does its best to divide the bill fairly, but it is a convenience, not an accountant.
        Double-check anything that matters before real money changes hands. Who actually pays whom
        is between you and your friends.
      </Section>

      <Section heading="On the AI">
        Bloomnote uses AI to design gardens, and iGuess can use AI to guess drawings. Both are for
        fun, and the AI can get things wrong.
      </Section>

      <Section heading="No warranty, limited liability">
        The apps come with no warranties of any kind. To the extent the law allows, aidenjang is not
        liable for any losses arising from using (or being unable to use) them. If some part of this
        is unenforceable where you live, the rest still stands.
      </Section>

      <Section heading="Ending things">
        You can stop using the apps and delete your identity account in Accounts. App data is
        managed separately, so delete it in each app before removing your shared sign-in or contact
        us for help. You can rejoin a wherever room until it expires seven days after it was
        created. iguess keeps recovery checkpoints for up to a day of inactivity. An mrrp room lasts
        until someone ends it: whoever made it can delete it for both people, with a week to change
        their mind before it is erased, and the other one can undo leaving within a week while the
        seat remains free. We can suspend access if these terms are broken or if a feature is
        retired.
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

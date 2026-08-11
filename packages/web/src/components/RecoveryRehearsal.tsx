import { useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '../lib/api';
import {
  RECOVERY_SCENARIOS,
  recoveryPlan,
  recoveryPlanText,
  type RecoveryScenario,
} from '../lib/recoveryPlan';

interface Props {
  user: AuthUser;
  activeSessions: number;
  onReviewSessions: () => void;
  onVerifyEmail: () => void;
}

export function RecoveryRehearsal({ user, activeSessions, onReviewSessions, onVerifyEmail }: Props): ReactNode {
  const [scenario, setScenario] = useState<RecoveryScenario>('locked_out');
  const [saved, setSaved] = useState(false);
  const plan = useMemo(() => recoveryPlan(user, scenario, activeSessions), [activeSessions, scenario, user]);

  function runPlan(): void {
    if (plan.action === 'verify_email') {
      onVerifyEmail();
      return;
    }
    if (plan.action === 'review_sessions') {
      onReviewSessions();
      return;
    }
    window.location.assign(plan.actionHref ?? '/login');
  }

  function savePlan(): void {
    const body = recoveryPlanText(user, plan);
    const href = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = `aidenjang-recovery-plan-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section aria-labelledby="recovery-rehearsal-heading" className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line bg-gradient-to-br from-accent/10 via-card to-pos/5 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Recovery rehearsal</p>
        <h2 id="recovery-rehearsal-heading" className="mt-1 text-sm font-semibold text-ink">Know your way back in before you need it</h2>
        <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted">Pick a bad day. This uses your actual sign-in setup to show the shortest safe route through it.</p>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Recovery scenario">
          {RECOVERY_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={scenario === item.id}
              onClick={() => setScenario(item.id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                scenario === item.id
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-card/70 text-muted hover:border-accent hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4" aria-live="polite">
        <h3 className="text-sm font-semibold text-ink">{plan.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">{plan.intro}</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {plan.steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line bg-field p-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">{index + 1}</span>
              <strong className="mt-2 block text-xs font-semibold text-ink">{step.title}</strong>
              <span className="mt-1 block text-[11px] leading-snug text-muted">{step.detail}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={runPlan} className="btn-gradient rounded-full px-4 py-2 text-xs font-semibold">
            {plan.actionLabel}
          </button>
          <button type="button" onClick={savePlan} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent">
            {saved ? 'Plan saved ✓' : 'Save offline plan'}
          </button>
          <span className="text-[10px] text-muted">No passwords or session keys are included.</span>
        </div>
      </div>
    </section>
  );
}

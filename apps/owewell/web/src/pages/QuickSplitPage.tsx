import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Money, computeSplit, dollarsToCents, type SplitMethod } from '@aidenjang/shared';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { BrandMark } from '../components/BrandMark';
import {
  clearPendingSplit,
  quickSplitApi,
  stashPendingSplit,
  type PendingItem,
  type PendingSplit,
} from '../lib/quicksplit';

interface Person {
  id: string;
  name: string;
}

interface Item {
  id: string;
  description: string;
  amount: string;
  method: SplitMethod;
  /** Per-person raw value inputs (shares / percent / exact), keyed by person id. */
  values: Record<string, string>;
}

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'EQUAL', label: 'Equally' },
  { value: 'SHARES', label: 'By shares' },
  { value: 'PERCENT', label: 'By percent' },
  { value: 'EXACT', label: 'Exact amounts' },
];

const VALUE_HINT: Record<SplitMethod, string> = {
  EQUAL: '',
  SHARES: 'shares',
  PERCENT: '%',
  EXACT: '$',
};

function newPerson(name = ''): Person {
  return { id: crypto.randomUUID(), name };
}

function newItem(): Item {
  return { id: crypto.randomUUID(), description: '', amount: '', method: 'EQUAL', values: {} };
}

/** Parse a raw per-person input into the server value for a method, or undefined for EQUAL. */
function serverValue(method: SplitMethod, raw: string): number | undefined {
  const trimmed = raw.trim();
  if (method === 'EQUAL') return undefined;
  if (method === 'EXACT') return dollarsToCents(trimmed);
  if (method === 'PERCENT') {
    const pct = Number(trimmed);
    if (!Number.isFinite(pct)) throw new Error('bad percent');
    return Math.round(pct * 100);
  }
  const weight = Number(trimmed);
  if (!Number.isInteger(weight) || weight <= 0) throw new Error('bad share');
  return weight;
}

function PublicHeader(): ReactNode {
  const { login, signup } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
        <Link to="/split" className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <BrandMark /> owewell
        </Link>
        <div className="flex items-center gap-2 text-sm font-medium">
          <button
            type="button"
            onClick={() => login(window.location.origin)}
            className="rounded-full px-3 py-1.5 text-muted transition hover:text-ink"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => signup(window.location.origin)}
            className="btn-gradient rounded-full px-4 py-1.5 font-semibold transition active:scale-[0.98]"
          >
            Sign up
          </button>
        </div>
      </div>
    </header>
  );
}

export function QuickSplitPage(): ReactNode {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([newPerson('You'), newPerson('')]);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [payerId, setPayerId] = useState<string>('');
  const [youId, setYouId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const named = people.filter((p) => p.name.trim());

  // Default the payer/you to the first person until they choose. Everyone using owewell is in
  // the split, so "you" always resolves to a named person (falling back to the first).
  const effectivePayerId = payerId || people[0]?.id || '';
  const effectiveYouId =
    youId && named.some((p) => p.id === youId) ? youId : (named[0]?.id ?? people[0]?.id ?? '');

  function updatePerson(id: string, patch: Partial<Person>): void {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPerson(): void {
    setPeople((prev) => [...prev, newPerson('')]);
  }
  function removePerson(id: string): void {
    setPeople((prev) => (prev.length <= 2 ? prev : prev.filter((p) => p.id !== id)));
  }

  function updateItem(id: string, patch: Partial<Item>): void {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function updateItemValue(itemId: string, personId: string, value: string): void {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, values: { ...it.values, [personId]: value } } : it)),
    );
  }
  function addItem(): void {
    setItems((prev) => [...prev, newItem()]);
  }
  function removeItem(id: string): void {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.id !== id)));
  }

  // Live combined breakdown: each person's total share summed across every valid item, or null
  // until at least one item has a usable amount + valid per-person values.
  let owed: Record<string, number> | null = null;
  let grandTotal = 0;
  try {
    const acc: Record<string, number> = Object.fromEntries(named.map((p) => [p.id, 0]));
    let any = false;
    for (const item of items) {
      const amountCents = item.amount.trim() ? dollarsToCents(item.amount) : 0;
      if (amountCents <= 0 || named.length === 0) continue;
      const shares = computeSplit(
        item.method,
        amountCents,
        named.map((p) => {
          const value = serverValue(item.method, item.values[p.id] ?? '');
          return value === undefined ? { userId: p.id } : { userId: p.id, value };
        }),
      );
      for (const s of shares) acc[s.userId] = (acc[s.userId] ?? 0) + s.owedCents;
      grandTotal += amountCents;
      any = true;
    }
    owed = any ? acc : null;
  } catch {
    owed = null;
  }

  const payerName = people.find((p) => p.id === effectivePayerId)?.name.trim() || 'the payer';

  async function onSave(): Promise<void> {
    setError(null);
    if (named.length < 2) {
      setError('Add at least two people.');
      return;
    }
    if (!named.some((p) => p.id === effectivePayerId)) {
      setError('Pick who paid.');
      return;
    }

    const builtItems: PendingItem[] = [];
    for (const item of items) {
      if (!item.amount.trim()) continue;
      let amountCents: number;
      try {
        amountCents = dollarsToCents(item.amount);
      } catch {
        setError('Enter a valid amount for each item.');
        return;
      }
      if (amountCents <= 0) {
        setError('Each item amount must be more than zero.');
        return;
      }
      let values: (number | null)[];
      try {
        values = named.map((p) => serverValue(item.method, item.values[p.id] ?? '') ?? null);
      } catch {
        setError('Check the per-person values on each item.');
        return;
      }
      builtItems.push({
        description: item.description.trim() || 'Quick split',
        amountCents,
        splitMethod: item.method,
        values,
      });
    }
    if (builtItems.length === 0) {
      setError('Add at least one item with an amount.');
      return;
    }

    const pending: PendingSplit = {
      people: named.map((p) => ({
        name: p.name.trim(),
        isPayer: p.id === effectivePayerId,
        isYou: p.id === effectiveYouId,
      })),
      items: builtItems,
    };
    stashPendingSplit(pending);

    if (!user) {
      // Stash it, send them to sign up on the shared auth service, and land back on the dashboard,
      // which offers to save the pending split once they're signed in.
      signup(window.location.origin);
      return;
    }

    setSaving(true);
    try {
      const { groupId } = await quickSplitApi.save(pending);
      clearPendingSplit();
      navigate(`/groups/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the split.');
      setSaving(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

  return (
    <div className="min-h-screen">
      {user ? <AppHeader /> : <PublicHeader />}
      <main className="mx-auto max-w-xl animate-rise px-4 py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Split a bill</h1>
        <p className="mt-2 text-base text-muted">
          Somebody paid, everybody forgot. Add the group, drop in the damage, and find out who owes
          who. No account unless you get attached.
        </p>

        {/* People — shared across every item */}
        <div className="glass mt-6 space-y-2 rounded-3xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Who's splitting</h2>
          {people.map((person, index) => (
            <div key={person.id} className="flex items-center gap-2">
              <input
                value={person.name}
                onChange={(e) => updatePerson(person.id, { name: e.target.value })}
                placeholder={`Person ${index + 1}`}
                className={inputClass}
                aria-label={`Person ${index + 1} name`}
              />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="radio"
                  name="payer"
                  checked={effectivePayerId === person.id}
                  onChange={() => setPayerId(person.id)}
                />
                paid
              </label>
              {people.length > 2 && (
                <button
                  type="button"
                  onClick={() => removePerson(person.id)}
                  className="rounded-lg border border-line px-2 text-muted transition hover:bg-canvas"
                  aria-label={`Remove person ${index + 1}`}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addPerson}
            className="text-sm font-medium text-accent transition hover:underline"
          >
            + Add person
          </button>

          <label className="block pt-2 text-sm">
            <span className="mb-1 block text-xs font-medium text-muted">Which one are you?</span>
            <select
              value={effectiveYouId}
              onChange={(e) => setYouId(e.target.value)}
              className={inputClass}
              aria-label="Which one are you"
            >
              {named.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.trim()}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Items — one expense per row, each split its own way among everyone above */}
        <div className="mt-6 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">What you spent</h2>
          {items.map((item, index) => (
            <div key={item.id} className="glass space-y-3 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  placeholder={`Item ${index + 1} (e.g. Dinner)`}
                  className={inputClass}
                  aria-label={`Item ${index + 1} description`}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg border border-line px-2 text-muted transition hover:bg-canvas"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={item.amount}
                  onChange={(e) => updateItem(item.id, { amount: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                  className={inputClass}
                  aria-label={`Item ${index + 1} amount`}
                />
                <select
                  value={item.method}
                  onChange={(e) => updateItem(item.id, { method: e.target.value as SplitMethod })}
                  className={inputClass}
                  aria-label={`Item ${index + 1} split method`}
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      Split {m.label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              {item.method !== 'EQUAL' && named.length > 0 && (
                <div className="space-y-1.5 border-t border-line pt-2">
                  {named.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-muted">{p.name.trim()}</span>
                      <input
                        value={item.values[p.id] ?? ''}
                        onChange={(e) => updateItemValue(item.id, p.id, e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        className="w-20 rounded-lg border border-line bg-field px-2 py-1.5 text-right outline-none focus:border-accent"
                        aria-label={`${p.name.trim()} ${VALUE_HINT[item.method]} for item ${index + 1}`}
                      />
                      <span className="w-10 text-xs text-muted">{VALUE_HINT[item.method]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="text-sm font-medium text-accent transition hover:underline"
          >
            + Add item
          </button>
        </div>

        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Who owes what</h2>
            {owed && <span className="text-sm text-muted">total {Money.fromCents(grandTotal).format()}</span>}
          </div>
          {owed ? (
            <ul className="mt-3 space-y-2">
              {named
                .filter((p) => p.id !== effectivePayerId && owed)
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-xl glass px-4 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{p.name.trim()}</span> owes {payerName}
                    </span>
                    <span className="font-medium tabular-nums">
                      {Money.fromCents(owed[p.id] ?? 0).format()}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Names up top, numbers in the middle. We&rsquo;ll handle the part that ends friendships.
            </p>
          )}
        </section>

        {error && <p className="mt-4 text-sm font-medium text-accent">{error}</p>}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="btn-gradient mt-5 w-full rounded-full px-5 py-3 font-semibold transition active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Saving...' : user ? 'Save to my account' : "Save it before someone 'forgets'"}
        </button>
        {user && (
          <Link to="/" className="mt-3 block text-center text-sm font-medium text-accent">
            Back to your groups
          </Link>
        )}

        {!user && (
          <section className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { icon: '🧮', title: 'Split it any way', body: 'Evenly, by shares, by percent, or exact. However the argument shakes out.' },
              { icon: '🧾', title: 'Itemize the chaos', body: "Separate line items, because you didn't touch the calamari." },
              { icon: '🤝', title: 'Settle up', body: 'We boil tangled debts down to the fewest Venmos humanly possible.' },
            ].map((f) => (
              <div key={f.title} className="glass rounded-2xl p-4">
                <span className="text-2xl" aria-hidden>
                  {f.icon}
                </span>
                <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

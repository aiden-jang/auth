import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Money } from '@aidenjang/shared';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@owewell/core';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { MoneyText } from '../components/MoneyText';
import { Sheet } from '../components/Sheet';
import { AddExpenseForm } from '../components/AddExpenseForm';
import { AddItemizedExpenseForm } from '../components/AddItemizedExpenseForm';
import { RecordPaymentForm } from '../components/RecordPaymentForm';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { groupsApi, type Balance, type GroupDetail, type GroupMember } from '../lib/groups';
import { expensesApi, type Expense } from '../lib/expenses';
import { settlementsApi, type Settlement, type SuggestedPayment } from '../lib/settlements';
import { payLinks } from '../lib/payLinks';
import { invitesApi } from '../lib/invites';
import { useGroupRealtime } from '../hooks/useGroupRealtime';

function balanceLabel(netCents: number): { text: string; tone: string } {
  if (netCents === 0) return { text: 'settled up', tone: 'text-muted' };
  const amount = Money.fromCents(Math.abs(netCents)).format();
  return netCents > 0
    ? { text: `is owed ${amount}`, tone: 'text-pos' }
    : { text: `owes ${amount}`, tone: 'text-neg' };
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Activity =
  | { kind: 'expense'; ts: number; expense: Expense }
  | { kind: 'settlement'; ts: number; settlement: Settlement };

function Shell({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-2xl animate-rise px-4 pb-28 pt-8">{children}</main>
    </div>
  );
}

export function GroupDetailPage(): ReactNode {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [balances, setBalances] = useState<Balance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [suggested, setSuggested] = useState<SuggestedPayment[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [expenseMode, setExpenseMode] = useState<'simple' | 'itemized'>('simple');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [payingMemberId, setPayingMemberId] = useState<string | null>(null);
  const [payVenmo, setPayVenmo] = useState('');
  const [payCashapp, setPayCashapp] = useState('');
  const [payPaypal, setPayPaypal] = useState('');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash');
  const [paymentOpen, setPaymentOpen] = useState(false);

  async function load(): Promise<void> {
    try {
      const [g, b, e, st, s] = await Promise.all([
        groupsApi.get(id),
        groupsApi.balances(id),
        expensesApi.list(id),
        settlementsApi.list(id),
        settlementsApi.suggested(id),
      ]);
      setGroup(g);
      setBalances(b);
      setExpenses(e);
      setSettlements(st);
      setSuggested(s);
    } catch {
      setNotFound(true);
    }
  }

  async function refreshLedger(): Promise<void> {
    const [b, e, st, s] = await Promise.all([
      groupsApi.balances(id),
      expensesApi.list(id),
      settlementsApi.list(id),
      settlementsApi.suggested(id),
    ]);
    setBalances(b);
    setExpenses(e);
    setSettlements(st);
    setSuggested(s);
  }

  async function markPaid(payment: SuggestedPayment): Promise<void> {
    setSettling(true);
    try {
      await settlementsApi.record(id, {
        fromUserId: payment.fromUserId,
        toUserId: payment.toUserId,
        amountCents: payment.amountCents,
        method: settleMethod,
      });
      await refreshLedger();
      toast.success(`Squared up ${payment.fromName} to ${payment.toName}.`);
    } catch {
      toast.error('Could not record that payment.');
    } finally {
      setSettling(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useGroupRealtime(id, () => {
    void refreshLedger();
  });

  async function deleteExpense(expenseId: string): Promise<void> {
    const ok = await confirm({
      title: 'Delete this expense?',
      body: 'It comes off the ledger and everyone’s balances recalculate.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await expensesApi.remove(id, expenseId);
      await refreshLedger();
      toast.success('Expense deleted.');
    } catch {
      toast.error('Could not delete that expense.');
    }
  }

  async function toggleArchive(): Promise<void> {
    if (!group) return;
    try {
      const updated = await groupsApi.setArchived(id, !group.archived);
      setGroup(updated);
      toast.success(updated.archived ? 'Group archived.' : 'Group restored.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not archive.');
    }
  }

  async function undoSettlement(settlementId: string): Promise<void> {
    const ok = await confirm({
      title: 'Undo this payment?',
      body: 'It comes off the ledger and the balances go back to what they were.',
      confirmLabel: 'Undo',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await settlementsApi.remove(id, settlementId);
      await refreshLedger();
      toast.success('Payment undone.');
    } catch {
      toast.error('Could not undo that payment.');
    }
  }

  async function saveRename(): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const updated = await groupsApi.rename(id, trimmed);
    setGroup(updated);
    setRenaming(false);
    toast.success('Group renamed.');
  }

  async function deleteGroup(): Promise<void> {
    const ok = await confirm({
      title: 'Delete this whole group?',
      body: 'Every expense and balance goes with it. This cannot be undone.',
      confirmLabel: 'Delete group',
      tone: 'danger',
    });
    if (!ok) return;
    await groupsApi.remove(id);
    navigate('/');
  }

  async function removeFromGroup(targetUserId: string, isSelf: boolean): Promise<void> {
    const ok = await confirm({
      title: isSelf ? 'Leave this group?' : 'Remove this person?',
      body: isSelf
        ? 'You can be added back later if you change your mind.'
        : 'They lose access to this group. You can add them back later.',
      confirmLabel: isSelf ? 'Leave' : 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await groupsApi.removeMember(id, targetUserId);
      if (isSelf) navigate('/');
      else {
        await load();
        toast.success('Removed them from the group.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove them.');
    }
  }

  async function createInviteLink(): Promise<void> {
    setMemberError(null);
    try {
      const invite = await invitesApi.create(id);
      const link = `${window.location.origin}/invite/${invite.token}`;
      setInviteLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success('Invite link copied to your clipboard.');
      } catch {
        toast.success('Invite link ready below.');
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Could not create a link.');
    }
  }

  async function saveMemberName(memberId: string): Promise<void> {
    const name = editingMemberName.trim();
    if (!name) return;
    try {
      await groupsApi.renameMember(id, memberId, name);
      setEditingMemberId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename them.');
    }
  }

  function startEditPayment(m: GroupMember): void {
    setPayingMemberId(m.userId);
    setPayVenmo(m.venmoHandle ?? '');
    setPayCashapp(m.cashappCashtag ?? '');
    setPayPaypal(m.paypalHandle ?? '');
  }

  async function savePaymentHandles(memberId: string): Promise<void> {
    try {
      await groupsApi.setPaymentHandles(id, memberId, {
        venmoHandle: payVenmo,
        cashappCashtag: payCashapp,
        paypalHandle: payPaypal,
      });
      setPayingMemberId(null);
      await load();
      toast.success('Payment handles saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save payment handles.');
    }
  }

  async function onAddMember(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!memberName.trim()) return;
    setMemberError(null);
    try {
      await groupsApi.addPlaceholder(id, memberName.trim());
      setMemberName('');
      await load();
      toast.success('Added them to the group.');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Could not add them.');
    }
  }

  const activity = useMemo<Activity[]>(() => {
    const items: Activity[] = [
      ...expenses.map((e) => ({ kind: 'expense' as const, ts: new Date(e.date).getTime(), expense: e })),
      ...settlements.map((s) => ({
        kind: 'settlement' as const,
        ts: new Date(s.createdAt).getTime(),
        settlement: s,
      })),
    ];
    return items.sort((a, b) => b.ts - a.ts);
  }, [expenses, settlements]);

  if (notFound) {
    return (
      <Shell>
        <p className="text-lg font-medium">That group went missing. Or was never yours.</p>
        <Link to="/" className="mt-2 inline-block text-sm font-medium text-accent">
          Back to your groups
        </Link>
      </Shell>
    );
  }

  if (!group) {
    return (
      <Shell>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-48" />
        <Skeleton className="mt-5 h-32 w-full rounded-3xl" />
        <Skeleton className="mt-8 h-4 w-20" />
        <div className="mt-3">
          <SkeletonList rows={3} />
        </div>
      </Shell>
    );
  }

  const nameOf = (userId: string): string =>
    group.members.find((m) => m.userId === userId)?.displayName ?? 'Someone';
  const balanceByUser = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
  const isOwner = group.members.find((m) => m.userId === user?.id)?.role === 'OWNER';
  const myNet = balanceByUser[user?.id ?? ''] ?? 0;
  const settled = myNet === 0;
  const owed = myNet > 0;

  return (
    <Shell>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" size={16} /> Your groups
      </Link>

      {renaming ? (
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Group name"
            className="flex-1 rounded-xl border border-line bg-field px-3 py-2 font-display text-2xl outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void saveRename()}
            className="btn-gradient rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight">
            {group.name}
            {group.archived && (
              <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-muted">
                archived
              </span>
            )}
          </h1>
          {isOwner && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setNewName(group.name);
                  setRenaming(true);
                }}
                aria-label="Rename group"
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-ink"
              >
                <Icon name="pencil" size={17} />
              </button>
              <button
                type="button"
                onClick={() => void toggleArchive()}
                aria-label={group.archived ? 'Restore group' : 'Archive group'}
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-ink"
              >
                <Icon name={group.archived ? 'undo' : 'archive'} size={17} />
              </button>
              <button
                type="button"
                onClick={() => void deleteGroup()}
                aria-label="Delete group"
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-neg"
              >
                <Icon name="trash" size={17} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="glass mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-sm font-medium text-muted">
          {settled ? 'Your standing here' : owed ? "You're owed" : 'You owe'}
        </p>
        <p
          className={`mt-1 font-display text-5xl font-extrabold tracking-tight sm:text-6xl ${
            settled ? 'text-ink' : owed ? 'text-gradient' : 'text-neg'
          }`}
        >
          {settled ? 'All settled' : <MoneyText cents={Math.abs(myNet)} />}
        </p>
        <button
          type="button"
          onClick={() => setPaymentOpen(true)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition hover:underline"
        >
          <Icon name="wallet" size={15} /> Record a payment
        </button>
      </div>

      {suggested.length > 0 && (
        <section className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
              <Icon name="wallet" size={16} /> Settle up
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              paid via
              <select
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value as PaymentMethod)}
                aria-label="Payment method"
                className="rounded-lg border border-line bg-field px-2 py-1 text-xs outline-none focus:border-accent"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="mt-3 space-y-2">
            {suggested.map((payment) => (
              <li
                key={`${payment.fromUserId}-${payment.toUserId}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Avatar name={payment.fromName} size="sm" />
                  <span>
                    <span className="font-medium">{payment.fromName}</span>
                    <span className="text-muted"> pays </span>
                    <span className="font-medium">{payment.toName}</span>{' '}
                    <span className="tnum font-medium">
                      {Money.fromCents(payment.amountCents).format()}
                    </span>
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {payLinks(
                    group.members.find((m) => m.userId === payment.toUserId) ?? {
                      venmoHandle: null,
                      cashappCashtag: null,
                      paypalHandle: null,
                    },
                    payment.amountCents,
                    `owewell: ${group.name}`,
                  ).map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Pay ${payment.toName} via ${link.label}`}
                      className="rounded-full border border-line-strong bg-surface2 px-3 py-1.5 text-xs font-medium transition hover:border-accent active:scale-[0.98]"
                    >
                      {link.label}
                    </a>
                  ))}
                  <button
                    type="button"
                    disabled={settling}
                    onClick={() => void markPaid(payment)}
                    className="rounded-full border border-line-strong bg-surface2 px-3.5 py-1.5 text-sm font-medium transition hover:border-accent active:scale-[0.98] disabled:opacity-60"
                  >
                    Settle
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        {activity.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line p-8 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-surface2 text-muted">
              <Icon name="receipt" size={20} />
            </div>
            <p className="mt-3 text-sm text-muted">
              Nothing yet. Add an expense and let the math sort itself out.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {activity.map((item) =>
              item.kind === 'expense' ? (
                <li
                  key={`e-${item.expense.id}`}
                  className="group surface flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={nameOf(item.expense.payerId)} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.expense.description}</p>
                      <p className="text-sm text-muted">
                        {nameOf(item.expense.payerId)} paid · {timeAgo(item.expense.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tnum font-semibold">
                      {Money.fromCents(item.expense.amountCents).format()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingExpense(item.expense)}
                      aria-label={`Edit ${item.expense.description}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-faint opacity-0 transition hover:bg-surface2 hover:text-ink group-hover:opacity-100"
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteExpense(item.expense.id)}
                      aria-label={`Delete ${item.expense.description}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-faint opacity-0 transition hover:bg-surface2 hover:text-neg group-hover:opacity-100"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={`s-${item.settlement.id}`}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-pos/30 bg-pos/10 text-pos">
                      <Icon name="check" size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium">{nameOf(item.settlement.fromUserId)}</span>
                        <span className="text-muted"> paid </span>
                        <span className="font-medium">{nameOf(item.settlement.toUserId)}</span>
                      </p>
                      <p className="text-sm text-muted">
                        {timeAgo(item.settlement.createdAt)}
                        {item.settlement.method && ` · via ${PAYMENT_METHOD_LABELS[item.settlement.method]}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tnum font-medium text-pos">
                      {Money.fromCents(item.settlement.amountCents).format()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void undoSettlement(item.settlement.id)}
                      aria-label="Undo payment"
                      className="grid h-8 w-8 place-items-center rounded-full text-faint opacity-0 transition hover:bg-surface2 hover:text-neg group-hover:opacity-100"
                    >
                      <Icon name="undo" size={15} />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <button
          type="button"
          onClick={() => setMembersOpen((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">
            Members · {group.members.length}
          </span>
          <span className="flex items-center gap-1 text-sm text-muted">
            <span className="flex -space-x-2">
              {group.members.slice(0, 4).map((m) => (
                <span key={m.userId} className="ring-2 ring-canvas rounded-full">
                  <Avatar name={m.displayName} size="sm" />
                </span>
              ))}
            </span>
            <Icon
              name="chevron-right"
              size={16}
              className={`transition ${membersOpen ? 'rotate-90' : ''}`}
            />
          </span>
        </button>

        {membersOpen && (
          <div className="mt-3 animate-fade">
            <ul className="space-y-2">
              {group.members.map((member) => {
                const label = balanceLabel(balanceByUser[member.userId] ?? 0);
                const isSelf = member.userId === user?.id;
                const canLeave = isSelf && member.role !== 'OWNER';
                const canRemove = isOwner && !isSelf && member.role !== 'OWNER';
                return (
                  <li
                    key={member.userId}
                    className="surface flex items-center justify-between rounded-xl px-4 py-3"
                  >
                    {editingMemberId === member.userId ? (
                      <span className="flex w-full items-center gap-2">
                        <input
                          value={editingMemberName}
                          onChange={(e) => setEditingMemberName(e.target.value)}
                          autoFocus
                          aria-label="Member name"
                          className="flex-1 rounded-lg border border-line bg-field px-2.5 py-1.5 outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => void saveMemberName(member.userId)}
                          className="text-sm font-medium text-accent"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMemberId(null)}
                          className="text-sm text-muted"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : payingMemberId === member.userId ? (
                      <span className="flex w-full flex-col gap-2">
                        <span className="text-xs font-medium text-muted">
                          {member.displayName}&rsquo;s payment handles
                        </span>
                        <input
                          value={payVenmo}
                          onChange={(e) => setPayVenmo(e.target.value)}
                          placeholder="Venmo username"
                          aria-label="Venmo username"
                          autoFocus
                          className="rounded-lg border border-line bg-field px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                        />
                        <input
                          value={payCashapp}
                          onChange={(e) => setPayCashapp(e.target.value)}
                          placeholder="Cash App $cashtag"
                          aria-label="Cash App cashtag"
                          className="rounded-lg border border-line bg-field px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                        />
                        <input
                          value={payPaypal}
                          onChange={(e) => setPayPaypal(e.target.value)}
                          placeholder="PayPal.me username"
                          aria-label="PayPal.me username"
                          className="rounded-lg border border-line bg-field px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                        />
                        <span className="flex gap-3 pt-0.5">
                          <button
                            type="button"
                            onClick={() => void savePaymentHandles(member.userId)}
                            className="text-sm font-medium text-accent"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayingMemberId(null)}
                            className="text-sm text-muted"
                          >
                            Cancel
                          </button>
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center gap-3 font-medium">
                          <Avatar name={member.displayName} />
                          <span className="flex items-center gap-1.5">
                            {member.displayName}
                            {member.role === 'OWNER' && (
                              <span className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-muted">
                                owner
                              </span>
                            )}
                            {member.isPlaceholder && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemberId(member.userId);
                                  setEditingMemberName(member.displayName);
                                }}
                                aria-label={`Rename ${member.displayName}`}
                                className="grid h-6 w-6 place-items-center rounded-full text-faint transition hover:bg-surface2 hover:text-ink"
                              >
                                <Icon name="pencil" size={13} />
                              </button>
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          {(isSelf || member.isPlaceholder) && (
                            <button
                              type="button"
                              onClick={() => startEditPayment(member)}
                              aria-label={`Payment handles for ${member.displayName}`}
                              title="Payment handles"
                              className="grid h-7 w-7 place-items-center rounded-full text-faint transition hover:bg-surface2 hover:text-ink"
                            >
                              <Icon name="wallet" size={14} />
                            </button>
                          )}
                          <span className={`tnum text-sm font-medium ${label.tone}`}>{label.text}</span>
                          {canLeave && (
                            <button
                              type="button"
                              onClick={() => void removeFromGroup(member.userId, true)}
                              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface2"
                            >
                              Leave
                            </button>
                          )}
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => void removeFromGroup(member.userId, false)}
                              aria-label={`Remove ${member.displayName}`}
                              className="grid h-8 w-8 place-items-center rounded-full text-faint transition hover:bg-surface2 hover:text-neg"
                            >
                              <Icon name="x" size={16} />
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            <form onSubmit={(e) => void onAddMember(e)} className="mt-3 flex gap-2">
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Add someone by name"
                className="flex-1 rounded-xl border border-line bg-field px-3.5 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface2 px-4 py-2.5 text-sm font-medium transition hover:border-accent active:scale-[0.98]"
              >
                <Icon name="user-plus" size={16} /> Add
              </button>
            </form>
            {memberError && <p className="mt-2 text-sm font-medium text-neg">{memberError}</p>}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void createInviteLink()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition hover:underline"
              >
                <Icon name="link" size={15} /> Or invite someone on owewell with a link
              </button>
              {inviteLink && (
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.target.select()}
                  aria-label="Invite link"
                  className="mt-2 w-full rounded-xl border border-line bg-field px-3 py-2.5 text-sm text-muted outline-none"
                />
              )}
            </div>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="btn-gradient fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3.5 font-semibold shadow-xl shadow-black/30 transition active:scale-[0.97]"
      >
        <Icon name="plus" size={20} /> Add expense
      </button>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add to the tab">
        <div className="mb-4 inline-flex w-full rounded-full border border-line bg-field p-1">
          <button
            type="button"
            onClick={() => setExpenseMode('simple')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              expenseMode === 'simple' ? 'btn-gradient' : 'text-muted hover:text-ink'
            }`}
          >
            Split a total
          </button>
          <button
            type="button"
            onClick={() => setExpenseMode('itemized')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              expenseMode === 'itemized' ? 'btn-gradient' : 'text-muted hover:text-ink'
            }`}
          >
            Itemize a receipt
          </button>
        </div>
        {expenseMode === 'simple' ? (
          <AddExpenseForm
            key={`simple-${group.members.length}`}
            groupId={group.id}
            members={group.members}
            onCreated={() => {
              setSheetOpen(false);
              toast.success('Added to the tab.');
              void refreshLedger();
            }}
          />
        ) : (
          <AddItemizedExpenseForm
            key={`itemized-${group.members.length}`}
            groupId={group.id}
            members={group.members}
            onCreated={() => {
              setSheetOpen(false);
              toast.success('Receipt added.');
              void refreshLedger();
            }}
          />
        )}
      </Sheet>

      <Sheet open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record a payment">
        <RecordPaymentForm
          groupId={group.id}
          members={group.members}
          defaultFromId={user?.id}
          onRecorded={() => {
            setPaymentOpen(false);
            toast.success('Payment recorded.');
            void refreshLedger();
          }}
        />
      </Sheet>

      <Sheet
        open={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        title={editingExpense?.splitMethod === 'ITEMIZED' ? 'Edit receipt' : 'Edit expense'}
      >
        {editingExpense &&
          (editingExpense.splitMethod === 'ITEMIZED' ? (
            <AddItemizedExpenseForm
              key={`edit-${editingExpense.id}`}
              groupId={group.id}
              members={group.members}
              editing={editingExpense}
              onCreated={() => {
                setEditingExpense(null);
                toast.success('Receipt updated.');
                void refreshLedger();
              }}
            />
          ) : (
            <AddExpenseForm
              key={`edit-${editingExpense.id}`}
              groupId={group.id}
              members={group.members}
              editing={editingExpense}
              onCreated={() => {
                setEditingExpense(null);
                toast.success('Expense updated.');
                void refreshLedger();
              }}
            />
          ))}
      </Sheet>
    </Shell>
  );
}

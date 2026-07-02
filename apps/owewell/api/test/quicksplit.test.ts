import { beforeEach, describe, expect, test } from 'vitest';
import { getGroup } from '../src/groups.js';
import { getBalances, listExpenses } from '../src/expenses.js';
import { QuickSplitError, createQuickSplit } from '../src/quicksplit.js';
import { testDb, seedPerson } from './helpers.js';

let db: ReturnType<typeof testDb>;
let alice: string;

beforeEach(async () => {
  db = testDb();
  alice = await seedPerson(db, 'Alice');
});

describe('quick-split', () => {
  test('creates an owned group, placeholders, and the first expense', async () => {
    const { groupId } = await createQuickSplit(db, alice, {
      description: 'Tacos',
      amountCents: 3000,
      splitMethod: 'EQUAL',
      participants: [
        { name: 'You', isPayer: true, isYou: true },
        { name: 'Sam' },
        { name: 'Kai' },
      ],
    });

    const group = await getGroup(db, alice, groupId);
    expect(group.name).toBe('Tacos');
    expect(group.members).toHaveLength(3);
    expect(group.members.find((m) => m.userId === alice)?.role).toBe('OWNER');

    const expenses = await listExpenses(db, alice, groupId);
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amountCents).toBe(3000);

    const balances = await getBalances(db, alice, groupId);
    expect(balances.find((b) => b.userId === alice)?.netCents).toBe(2000);
    expect(balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  test('requires exactly one payer', async () => {
    await expect(
      createQuickSplit(db, alice, {
        description: 'X',
        amountCents: 1000,
        splitMethod: 'EQUAL',
        participants: [{ name: 'You', isYou: true }, { name: 'Sam' }],
      }),
    ).rejects.toMatchObject({ code: 'NO_PAYER' });
  });

  test('rejects more than one "you"', async () => {
    await expect(
      createQuickSplit(db, alice, {
        description: 'X',
        amountCents: 1000,
        splitMethod: 'EQUAL',
        participants: [
          { name: 'You', isPayer: true, isYou: true },
          { name: 'Also you', isYou: true },
        ],
      }),
    ).rejects.toBeInstanceOf(QuickSplitError);
  });

  test('rejects a split whose math is invalid', async () => {
    await expect(
      createQuickSplit(db, alice, {
        description: 'X',
        amountCents: 1000,
        splitMethod: 'PERCENT',
        participants: [
          { name: 'You', value: 3000, isPayer: true, isYou: true },
          { name: 'Sam', value: 3000 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SPLIT' });
  });
});

import { beforeEach, describe, expect, test } from 'vitest';
import { addPlaceholderMember, createGroup } from '../src/groups.js';
import {
  ExpenseError,
  createExpense,
  createItemizedExpense,
  deleteExpense,
  getBalances,
  listExpenses,
} from '../src/expenses.js';
import { testDb, seedPerson } from './helpers.js';

let db: ReturnType<typeof testDb>;
let alice: string;
let groupId: string;
let bob: string;
let carl: string;

beforeEach(async () => {
  db = testDb();
  alice = await seedPerson(db, 'Alice');
  const group = await createGroup(db, alice, 'Trip');
  groupId = group.id;
  bob = (await addPlaceholderMember(db, alice, groupId, 'Bob')).userId;
  carl = (await addPlaceholderMember(db, alice, groupId, 'Carl')).userId;
});

function owed(splits: { userId: string; owedCents: number }[]): Record<string, number> {
  return Object.fromEntries(splits.map((s) => [s.userId, s.owedCents]));
}
async function net(): Promise<Record<string, number>> {
  const balances = await getBalances(db, alice, groupId);
  return Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
}

describe('expenses — split methods', () => {
  test('EQUAL splits evenly', async () => {
    const e = await createExpense(db, alice, groupId, {
      description: 'Dinner',
      amountCents: 3000,
      payerId: alice,
      splitMethod: 'EQUAL',
      participants: [{ userId: alice }, { userId: bob }, { userId: carl }],
    });
    expect(owed(e.splits)).toEqual({ [alice]: 1000, [bob]: 1000, [carl]: 1000 });
  });

  test('EXACT uses the given cents', async () => {
    const e = await createExpense(db, alice, groupId, {
      description: 'Cab',
      amountCents: 1000,
      payerId: bob,
      splitMethod: 'EXACT',
      participants: [
        { userId: alice, value: 700 },
        { userId: carl, value: 300 },
      ],
    });
    expect(owed(e.splits)).toEqual({ [alice]: 700, [carl]: 300 });
  });

  test('PERCENT uses basis points', async () => {
    const e = await createExpense(db, alice, groupId, {
      description: 'Hotel',
      amountCents: 2000,
      payerId: carl,
      splitMethod: 'PERCENT',
      participants: [
        { userId: alice, value: 5000 },
        { userId: bob, value: 5000 },
      ],
    });
    expect(owed(e.splits)).toEqual({ [alice]: 1000, [bob]: 1000 });
  });

  test('SHARES splits by weight', async () => {
    const e = await createExpense(db, alice, groupId, {
      description: 'Gas',
      amountCents: 1000,
      payerId: alice,
      splitMethod: 'SHARES',
      participants: [
        { userId: alice, value: 1 },
        { userId: bob, value: 3 },
      ],
    });
    expect(owed(e.splits)).toEqual({ [alice]: 250, [bob]: 750 });
  });
});

describe('expenses — validation', () => {
  test('payer must be a member', async () => {
    const outsider = await seedPerson(db, 'Nate');
    await expect(
      createExpense(db, alice, groupId, {
        description: 'X',
        amountCents: 100,
        payerId: outsider,
        splitMethod: 'EQUAL',
        participants: [{ userId: alice }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAYER' });
  });

  test('every participant must be a member', async () => {
    const outsider = await seedPerson(db, 'Nate');
    await expect(
      createExpense(db, alice, groupId, {
        description: 'X',
        amountCents: 100,
        payerId: alice,
        splitMethod: 'EQUAL',
        participants: [{ userId: alice }, { userId: outsider }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PARTICIPANT' });
  });

  test('EXACT that does not sum is INVALID_SPLIT', async () => {
    await expect(
      createExpense(db, alice, groupId, {
        description: 'X',
        amountCents: 1000,
        payerId: alice,
        splitMethod: 'EXACT',
        participants: [
          { userId: alice, value: 400 },
          { userId: bob, value: 400 },
        ],
      }),
    ).rejects.toBeInstanceOf(ExpenseError);
  });
});

describe('expenses — itemized, balances, delete', () => {
  test('itemized splits items + tax/tip and balances sum to zero', async () => {
    const e = await createItemizedExpense(db, alice, groupId, {
      description: 'Restaurant',
      payerId: bob,
      taxCents: 300,
      tipCents: 200,
      items: [
        { name: 'Pizza', amountCents: 1800, participantIds: [alice, bob] },
        { name: 'Salad', amountCents: 1200, participantIds: [carl] },
      ],
    });
    expect(e.splitMethod).toBe('ITEMIZED');
    expect(e.amountCents).toBe(1800 + 1200 + 300 + 200);
    const total = e.splits.reduce((sum, s) => sum + s.owedCents, 0);
    expect(total).toBe(e.amountCents);
    expect(Object.values(await net()).reduce((a, b) => a + b, 0)).toBe(0);
  });

  test('deleteExpense removes it from the ledger and rebalances', async () => {
    const e = await createExpense(db, alice, groupId, {
      description: 'Dinner',
      amountCents: 3000,
      payerId: alice,
      splitMethod: 'EQUAL',
      participants: [{ userId: alice }, { userId: bob }, { userId: carl }],
    });
    let balances = await net();
    expect(balances[alice]).toBe(2000);
    expect(balances[bob]).toBe(-1000);

    await deleteExpense(db, alice, groupId, e.id);
    expect(await listExpenses(db, alice, groupId)).toHaveLength(0);
    balances = await net();
    expect(Object.values(balances).every((n) => n === 0)).toBe(true);
  });

  test('deleting a missing expense is NOT_FOUND', async () => {
    await expect(deleteExpense(db, alice, groupId, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

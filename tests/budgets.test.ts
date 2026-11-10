// @vitest-environment node
// Required: TanStack Start's import protection mocks server modules in jsdom (client) environment.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";
import {
  changeBudgetLimit,
  createBudget,
  listBudgets,
  removeBudget,
  removeBudgetsForCategories,
} from "../src/server/budgets.server.ts";

const userId = "budgets-test-user";
const otherUserId = "budgets-test-other";
// Budget month under test: November 2026 (UTC).
const NOW = new Date("2026-11-15T12:00:00Z");

let seq = 0;
async function addCategory(
  name: string,
  parentId: string | null = null,
  owner = userId,
) {
  const id = `${owner}-cat-${++seq}`;
  await db.insert(schema.categories).values({
    id,
    user_id: owner,
    name,
    parent_id: parentId,
    color: "#112233",
  });
  return id;
}

async function addAccount(currency: string, owner = userId) {
  const id = `${owner}-acc-${++seq}`;
  await db
    .insert(schema.accounts)
    .values({ id, user_id: owner, name: `Acc ${seq}`, currency });
  return id;
}

async function addTx(opts: {
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
  date: string;
  owner?: string;
}) {
  await db.insert(schema.transactions).values({
    id: `${opts.owner ?? userId}-tx-${++seq}`,
    user_id: opts.owner ?? userId,
    account_id: opts.accountId,
    category_id: opts.categoryId,
    amount_minor: opts.amountMinor,
    date: opts.date,
  });
}

describe("budgets module", () => {
  beforeEach(async () => {
    for (const id of [userId, otherUserId]) {
      await db
        .insert(schema.users)
        .values({ id, username: id, password_hash: "x" });
    }
  });

  afterEach(async () => {
    for (const id of [userId, otherUserId]) {
      await db.delete(schema.budgets).where(eq(schema.budgets.user_id, id));
      await db
        .delete(schema.transactions)
        .where(eq(schema.transactions.user_id, id));
      await db.delete(schema.accounts).where(eq(schema.accounts.user_id, id));
      await db
        .delete(schema.categories)
        .where(eq(schema.categories.user_id, id));
      await db.delete(schema.users).where(eq(schema.users.id, id));
    }
  });

  it("creates a budget and lists it with spending and remaining", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({
      accountId: acc,
      categoryId: food,
      amountMinor: -2550,
      date: "2026-11-03",
    });

    const created = await createBudget(
      userId,
      { categoryId: food, currency: "PLN", limit: "100.00" },
      db,
    );
    expect("id" in created).toBe(true);

    const result = await listBudgets(userId, NOW, db);
    expect(result.month).toBe("2026-11");
    expect(result.budgets).toHaveLength(1);
    expect(result.budgets[0]).toMatchObject({
      categoryName: "Food",
      categoryColor: "#112233",
      currency: "PLN",
      limitMinor: 10000,
      spentMinor: 2550,
      remainingMinor: 7450,
      overBudget: false,
    });
  });

  const spentFor = async (categoryId: string, currency = "PLN", now = NOW) => {
    const r = await listBudgets(userId, now, db);
    return r.budgets.find(
      (b) => b.categoryId === categoryId && b.currency === currency,
    )!;
  };
  const budgetOn = (categoryId: string, limit = "100", currency = "PLN") =>
    createBudget(userId, { categoryId, currency, limit }, db);

  it("counts the category and its subcategories at any depth", async () => {
    const food = await addCategory("Food");
    const dining = await addCategory("Dining", food);
    const cafe = await addCategory("Cafe", dining);
    const acc = await addAccount("PLN");
    for (const [c, amt] of [
      [food, -100],
      [dining, -200],
      [cafe, -400],
    ] as const) {
      await addTx({
        accountId: acc,
        categoryId: c,
        amountMinor: amt,
        date: "2026-11-02",
      });
    }
    await budgetOn(food);
    await budgetOn(cafe);
    expect((await spentFor(food)).spentMinor).toBe(700);
    expect((await spentFor(cafe)).spentMinor).toBe(400);
  });

  it("ignores income and refunds instead of netting them", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -1000, date: "2026-11-02" });
    await addTx({ accountId: acc, categoryId: food, amountMinor: 700, date: "2026-11-03" });
    await budgetOn(food);
    expect((await spentFor(food)).spentMinor).toBe(1000);
  });

  it("ignores accounts in other currencies", async () => {
    const food = await addCategory("Food");
    const pln = await addAccount("PLN");
    const usd = await addAccount("USD");
    await addTx({ accountId: pln, categoryId: food, amountMinor: -1000, date: "2026-11-02" });
    await addTx({ accountId: usd, categoryId: food, amountMinor: -5000, date: "2026-11-02" });
    await budgetOn(food, "100", "PLN");
    await budgetOn(food, "100", "USD");
    expect((await spentFor(food, "PLN")).spentMinor).toBe(1000);
    expect((await spentFor(food, "USD")).spentMinor).toBe(5000);
  });

  it("counts only the budget month, inclusive of both boundary days", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    for (const [date, amt] of [
      ["2026-10-31", -1],
      ["2026-11-01", -10],
      ["2026-11-30", -100],
      ["2026-12-01", -1000],
    ] as const) {
      await addTx({ accountId: acc, categoryId: food, amountMinor: amt, date });
    }
    await budgetOn(food);
    expect((await spentFor(food)).spentMinor).toBe(110);
    // Same data seen from December: only the 1st counts.
    const dec = await spentFor(food, "PLN", new Date("2026-12-31T23:59:59Z"));
    expect(dec.spentMinor).toBe(1000);
  });

  it("isolates users and ignores uncategorised transactions", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    const otherCat = await addCategory("Food", null, otherUserId);
    const otherAcc = await addAccount("PLN", otherUserId);
    await addTx({ accountId: acc, categoryId: null, amountMinor: -999, date: "2026-11-02" });
    await addTx({ accountId: otherAcc, categoryId: otherCat, amountMinor: -888, date: "2026-11-02", owner: otherUserId });
    await addTx({ accountId: acc, categoryId: food, amountMinor: -50, date: "2026-11-02" });
    await budgetOn(food);
    expect((await spentFor(food)).spentMinor).toBe(50);
    expect((await listBudgets(otherUserId, NOW, db)).budgets).toEqual([]);
  });

  it("is not over budget exactly at the limit, and over when above it", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -10000, date: "2026-11-02" });
    await budgetOn(food, "100");
    expect(await spentFor(food)).toMatchObject({
      remainingMinor: 0,
      overBudget: false,
    });
    await addTx({ accountId: acc, categoryId: food, amountMinor: -1, date: "2026-11-02" });
    expect(await spentFor(food)).toMatchObject({
      remainingMinor: -1,
      overBudget: true,
    });
  });

  it("rejects invalid limits", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    for (const limit of ["", "0", "0.00", "-5", "abc"]) {
      expect(await budgetOn(food, limit)).toMatchObject({
        code: "invalid_limit",
      });
    }
  });

  it("rejects duplicates per (category, currency) but allows other currencies", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    await addAccount("USD");
    expect(await budgetOn(food, "10", "PLN")).toHaveProperty("id");
    expect(await budgetOn(food, "20", "PLN")).toMatchObject({
      code: "budget_exists",
    });
    expect(await budgetOn(food, "20", "USD")).toHaveProperty("id");
  });

  it("treats another user's category exactly like a missing one", async () => {
    await addAccount("PLN");
    const foreign = await addCategory("Secret", null, otherUserId);
    const foreignResult = await budgetOn(foreign);
    const missingResult = await budgetOn("does-not-exist");
    expect(foreignResult).toEqual(missingResult);
    expect(foreignResult).toMatchObject({ code: "category_not_found" });
  });

  it("rejects a currency the user has no account in", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    expect(await budgetOn(food, "10", "EUR")).toMatchObject({
      code: "currency_unavailable",
    });
  });

  it("offers the distinct account currencies, defaulting to the busiest account's", async () => {
    expect(await listBudgets(userId, NOW, db)).toMatchObject({
      currencies: [],
      defaultCurrency: "PLN",
    });
    const pln = await addAccount("PLN");
    const usd = await addAccount("USD");
    await addAccount("USD");
    const food = await addCategory("Food");
    // No transactions: PLN fallback.
    expect(await listBudgets(userId, NOW, db)).toMatchObject({
      currencies: ["PLN", "USD"],
      defaultCurrency: "PLN",
    });
    await addTx({ accountId: usd, categoryId: food, amountMinor: -1, date: "2026-11-02" });
    await addTx({ accountId: usd, categoryId: food, amountMinor: -1, date: "2026-11-02" });
    await addTx({ accountId: pln, categoryId: food, amountMinor: -1, date: "2026-11-02" });
    expect((await listBudgets(userId, NOW, db)).defaultCurrency).toBe("USD");
    // Tie falls back to PLN.
    await addTx({ accountId: pln, categoryId: food, amountMinor: -1, date: "2026-11-02" });
    expect((await listBudgets(userId, NOW, db)).defaultCurrency).toBe("PLN");
  });
});

describe("budgets module: change, remove, category changes", () => {
  beforeEach(async () => {
    for (const id of [userId, otherUserId]) {
      await db
        .insert(schema.users)
        .values({ id, username: id, password_hash: "x" });
    }
  });

  afterEach(async () => {
    for (const id of [userId, otherUserId]) {
      await db.delete(schema.budgets).where(eq(schema.budgets.user_id, id));
      await db
        .delete(schema.transactions)
        .where(eq(schema.transactions.user_id, id));
      await db.delete(schema.accounts).where(eq(schema.accounts.user_id, id));
      await db
        .delete(schema.categories)
        .where(eq(schema.categories.user_id, id));
      await db.delete(schema.users).where(eq(schema.users.id, id));
    }
  });

  const create = async (
    categoryId: string,
    limit = "100",
    owner = userId,
  ): Promise<string> => {
    const r = await createBudget(
      owner,
      { categoryId, currency: "PLN", limit },
      db,
    );
    if (!("id" in r)) throw new Error(`create failed: ${r.code}`);
    return r.id;
  };
  const list = async (owner = userId) =>
    (await listBudgets(owner, NOW, db)).budgets;

  it("changes only the limit, keeping category, currency and spending", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -2500, date: "2026-11-02" });
    const id = await create(food, "100");

    expect(await changeBudgetLimit(userId, id, "250,50", db)).toEqual({ id });

    const [b] = await list();
    expect(b).toMatchObject({
      id,
      categoryId: food,
      currency: "PLN",
      limitMinor: 25050,
      spentMinor: 2500,
      remainingMinor: 22550,
    });
  });

  it("rejects an empty, zero, negative or non-numeric new limit", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    const id = await create(food, "100");
    for (const bad of ["", "0", "-5", "abc"]) {
      expect(await changeBudgetLimit(userId, id, bad, db)).toMatchObject({
        code: "invalid_limit",
      });
    }
    expect((await list())[0]!.limitMinor).toBe(10000);
  });

  it("treats a foreign or missing budget as budget_not_found when changing", async () => {
    const otherCat = await addCategory("Food", null, otherUserId);
    await addAccount("PLN", otherUserId);
    const foreign = await create(otherCat, "100", otherUserId);

    expect(await changeBudgetLimit(userId, foreign, "5", db)).toMatchObject({
      code: "budget_not_found",
    });
    expect(await changeBudgetLimit(userId, "nope", "5", db)).toMatchObject({
      code: "budget_not_found",
    });
    expect((await list(otherUserId))[0]!.limitMinor).toBe(10000);
  });

  it("removes a budget but leaves transactions and categories untouched", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -100, date: "2026-11-02" });
    const id = await create(food);

    expect(await removeBudget(userId, id, db)).toEqual({ id });

    expect(await list()).toEqual([]);
    expect(
      await db.select().from(schema.transactions).where(eq(schema.transactions.user_id, userId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(schema.categories).where(eq(schema.categories.user_id, userId)),
    ).toHaveLength(1);
  });

  it("treats a foreign or missing budget as budget_not_found when removing", async () => {
    const otherCat = await addCategory("Food", null, otherUserId);
    await addAccount("PLN", otherUserId);
    const foreign = await create(otherCat, "100", otherUserId);

    expect(await removeBudget(userId, foreign, db)).toMatchObject({
      code: "budget_not_found",
    });
    expect(await removeBudget(userId, "nope", db)).toMatchObject({
      code: "budget_not_found",
    });
    expect(await list(otherUserId)).toHaveLength(1);
  });

  it("removes budgets for a set of categories, only for the owner", async () => {
    const food = await addCategory("Food");
    const dining = await addCategory("Dining", food);
    const fun = await addCategory("Fun");
    const otherCat = await addCategory("Food", null, otherUserId);
    await addAccount("PLN");
    await addAccount("PLN", otherUserId);
    await create(food);
    await create(dining);
    await create(fun);
    await create(otherCat, "100", otherUserId);

    await removeBudgetsForCategories(userId, [food, dining, otherCat], db);

    expect((await list()).map((b) => b.categoryId)).toEqual([fun]);
    expect(await list(otherUserId)).toHaveLength(1);
  });

  it("re-parenting a category re-scopes a parent budget's spending", async () => {
    const food = await addCategory("Food");
    const fun = await addCategory("Fun");
    const cinema = await addCategory("Cinema", fun);
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -100, date: "2026-11-02" });
    await addTx({ accountId: acc, categoryId: cinema, amountMinor: -400, date: "2026-11-02" });
    await create(food);
    const spent = async () =>
      (await list()).find((b) => b.categoryId === food)!.spentMinor;
    expect(await spent()).toBe(100);

    // Move Cinema under Food: the parent budget gains its spending.
    await db
      .update(schema.categories)
      .set({ parent_id: food })
      .where(eq(schema.categories.id, cinema));
    expect(await spent()).toBe(500);

    // Move it back out: the parent budget loses it again.
    await db
      .update(schema.categories)
      .set({ parent_id: fun })
      .where(eq(schema.categories.id, cinema));
    expect(await spent()).toBe(100);
  });
});

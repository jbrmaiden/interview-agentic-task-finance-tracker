// @vitest-environment node
// Required: TanStack Start's import protection mocks server modules in jsdom (client) environment.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";
import { createBudget, listBudgets } from "../src/server/budgets.server.ts";

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

describe("budget allowance", () => {
  const limitUser = "budgets-limit-user";

  const setPlan = (plan: "free" | "pro") =>
    db.insert(schema.subscriptions).values({
      user_id: limitUser,
      plan,
      status: "active",
    });

  beforeEach(async () => {
    await db
      .insert(schema.users)
      .values({ id: limitUser, username: limitUser, password_hash: "x" });
  });

  afterEach(async () => {
    await db
      .delete(schema.subscriptions)
      .where(eq(schema.subscriptions.user_id, limitUser));
    await db.delete(schema.budgets).where(eq(schema.budgets.user_id, limitUser));
    await db
      .delete(schema.accounts)
      .where(eq(schema.accounts.user_id, limitUser));
    await db
      .delete(schema.categories)
      .where(eq(schema.categories.user_id, limitUser));
    await db.delete(schema.users).where(eq(schema.users.id, limitUser));
  });

  async function addMany(n: number) {
    await addAccount("PLN", limitUser);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(await addCategory(`Cat ${i}`, null, limitUser));
    }
    return ids;
  }

  it("blocks the budget past the free allowance and keeps existing ones", async () => {
    const cats = await addMany(4);
    for (const c of cats.slice(0, 3)) {
      const r = await createBudget(
        limitUser,
        { categoryId: c, currency: "PLN", limit: "10" },
        db,
      );
      expect("id" in r).toBe(true);
    }
    const blocked = await createBudget(
      limitUser,
      { categoryId: cats[3], currency: "PLN", limit: "10" },
      db,
    );
    expect(blocked).toMatchObject({ code: "budget_limit_reached", limit: 3 });
    expect((await listBudgets(limitUser, NOW, db)).budgets).toHaveLength(3);
  });

  it("lets a pro user create beyond the free allowance", async () => {
    await setPlan("pro");
    const cats = await addMany(4);
    for (const c of cats) {
      const r = await createBudget(
        limitUser,
        { categoryId: c, currency: "PLN", limit: "10" },
        db,
      );
      expect("id" in r).toBe(true);
    }
    expect((await listBudgets(limitUser, NOW, db)).budgets).toHaveLength(4);
  });
});

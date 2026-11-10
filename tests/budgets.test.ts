// @vitest-environment node
// Required: TanStack Start's import protection mocks server modules in jsdom (client) environment.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.ts";
import {
  runBudgetAlertCheck,
  changeBudgetLimit,
  createBudget,
  listBudgets,
  removeBudget,
  removeBudgetsForCategories,
  runBudgetAlertCheckSafely,
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
      await db
        .delete(schema.budget_alerts)
        .where(eq(schema.budget_alerts.user_id, id));
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

  it("defaults to a currency the user actually has", async () => {
    await addAccount("USD");
    expect((await listBudgets(userId, NOW, db)).defaultCurrency).toBe("USD");
  });

  it("defaults to the first sorted currency on a tie without PLN", async () => {
    await addAccount("USD");
    await addAccount("EUR");
    expect((await listBudgets(userId, NOW, db)).defaultCurrency).toBe("EUR");
  });

  it("rejects a limit above the integer column maximum on create", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    expect(await budgetOn(food, "21474836.48")).toMatchObject({
      code: "invalid_limit",
    });
    expect(await budgetOn(food, "21474836.47")).toHaveProperty("id");
  });

  it("computes parent and child budgets on the same tree independently", async () => {
    const food = await addCategory("Food");
    const restaurants = await addCategory("Restaurants", food);
    const groceries = await addCategory("Groceries", food);
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: restaurants, amountMinor: -100, date: "2026-11-02" });
    await addTx({ accountId: acc, categoryId: groceries, amountMinor: -50, date: "2026-11-03" });
    await budgetOn(food);
    await budgetOn(restaurants);
    expect((await spentFor(food)).spentMinor).toBe(150);
    expect((await spentFor(restaurants)).spentMinor).toBe(100);
  });

  it("reports spending as a safe integer", async () => {
    const food = await addCategory("Food");
    const acc = await addAccount("PLN");
    await addTx({ accountId: acc, categoryId: food, amountMinor: -123, date: "2026-11-02" });
    await budgetOn(food);
    const { spentMinor } = await spentFor(food);
    expect(Number.isSafeInteger(spentMinor)).toBe(true);
    expect(spentMinor).toBe(123);
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

  it("caps the new limit at the integer column maximum", async () => {
    const food = await addCategory("Food");
    await addAccount("PLN");
    const id = await create(food, "100");
    expect(await changeBudgetLimit(userId, id, "21474836.48", db)).toMatchObject({
      code: "invalid_limit",
    });
    expect(await changeBudgetLimit(userId, id, "21474836.47", db)).toEqual({ id });
    expect((await list())[0]!.limitMinor).toBe(2147483647);
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

describe("budget alerts", () => {
  const alertUser = "budget-alerts-user";
  const email = "budget-alerts-user@example.com";
  const DEC = new Date("2026-12-05T12:00:00Z");
  let sent: Array<{ to: string; subject: string; text: string }>;
  const send = async (msg: { to: string; subject: string; text: string }) => {
    sent.push(msg);
  };
  const check = (now = NOW, sender = send) =>
    runBudgetAlertCheck({ userId: alertUser, now, db, send: sender });

  async function setup(limit: string, spentMinor: number, name = "Alert Food") {
    const cat = await addCategory(name, null, alertUser);
    const acc = await addAccount("PLN", alertUser);
    if (spentMinor > 0) {
      await addTx({
        accountId: acc,
        categoryId: cat,
        amountMinor: -spentMinor,
        date: "2026-11-03",
        owner: alertUser,
      });
    }
    const created = await createBudget(
      alertUser,
      { categoryId: cat, currency: "PLN", limit },
      db,
    );
    if (!("id" in created)) throw new Error("budget not created");
    return { cat, acc, budgetId: created.id };
  }

  beforeEach(async () => {
    sent = [];
    await db.insert(schema.users).values({
      id: alertUser,
      username: alertUser,
      email,
      email_verified_at: new Date(),
      password_hash: "x",
    });
  });

  afterEach(async () => {
    await db
      .delete(schema.budget_alerts)
      .where(eq(schema.budget_alerts.user_id, alertUser));
    await db.delete(schema.budgets).where(eq(schema.budgets.user_id, alertUser));
    await db
      .delete(schema.transactions)
      .where(eq(schema.transactions.user_id, alertUser));
    await db.delete(schema.accounts).where(eq(schema.accounts.user_id, alertUser));
    await db
      .delete(schema.categories)
      .where(eq(schema.categories.user_id, alertUser));
    await db.delete(schema.users).where(eq(schema.users.id, alertUser));
  });

  it("sends one email naming the category, limit, spending and overshoot", async () => {
    await setup("100.00", 15050);
    await check();
    await check();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    const body = `${sent[0]!.subject}\n${sent[0]!.text}`;
    expect(body).toContain("Alert Food");
    expect(body).toContain("100.00 PLN");
    expect(body).toContain("150.50 PLN");
    expect(body).toContain("50.50 PLN");
    expect(body).toMatch(/\/budgets/);
  });

  it("does not alert while spending is within the limit", async () => {
    await setup("100.00", 10000);
    await check();
    expect(sent).toHaveLength(0);
  });

  it("does not resend after the limit is raised, even if still over", async () => {
    const { budgetId } = await setup("100.00", 15000);
    await check();
    await changeBudgetLimit(alertUser, budgetId, "120.00", db);
    await check();
    expect(sent).toHaveLength(1);
  });

  it("alerts again in a new budget month", async () => {
    const { acc, cat } = await setup("100.00", 15000);
    await check();
    await addTx({
      accountId: acc,
      categoryId: cat,
      amountMinor: -20000,
      date: "2026-12-02",
      owner: alertUser,
    });
    await check(DEC);
    expect(sent).toHaveLength(2);
  });

  it("alerts when a budget is created with a limit below current spending", async () => {
    await setup("10.00", 5000);
    await check();
    expect(sent).toHaveLength(1);
  });

  it("alerts when a limit is lowered below current spending", async () => {
    const { budgetId } = await setup("100.00", 5000);
    await check();
    expect(sent).toHaveLength(0);
    await changeBudgetLimit(alertUser, budgetId, "20.00", db);
    await check();
    expect(sent).toHaveLength(1);
  });

  it("skips an unverified user without using up the alert, then sends after verification", async () => {
    await setup("100.00", 15000);
    await db
      .update(schema.users)
      .set({ email_verified_at: null })
      .where(eq(schema.users.id, alertUser));
    await check();
    expect(sent).toHaveLength(0);
    await db
      .update(schema.users)
      .set({ email_verified_at: new Date() })
      .where(eq(schema.users.id, alertUser));
    await check();
    expect(sent).toHaveLength(1);
  });

  it("skips a user without an email", async () => {
    await setup("100.00", 15000);
    await db
      .update(schema.users)
      .set({ email: null })
      .where(eq(schema.users.id, alertUser));
    await check();
    expect(sent).toHaveLength(0);
  });

  it("retries on a later check after a failed send", async () => {
    await setup("100.00", 15000);
    let failedAttempts = 0;
    await check(NOW, async () => {
      failedAttempts++;
      throw new Error("smtp down");
    });
    expect(failedAttempts).toBe(1);
    expect(sent).toHaveLength(0);
    await check();
    expect(sent).toHaveLength(1);
  });

  it("keeps alerting other budgets when releasing a failed send's claim fails", async () => {
    await setup("10.00", 5000, "Alert A");
    await setup("10.00", 5000, "Alert B");
    const releaseFails = new Proxy(db, {
      get(target, prop) {
        if (prop === "delete") {
          return (table: Parameters<typeof db.delete>[0]) => {
            if (table === schema.budget_alerts) throw new Error("db down");
            return target.delete(table);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    let attempts = 0;
    const firstSendFails = async (msg: { to: string; subject: string; text: string }) => {
      if (++attempts === 1) throw new Error("smtp down");
      sent.push(msg);
    };

    const result = await runBudgetAlertCheck({
      userId: alertUser,
      now: NOW,
      db: releaseFails,
      send: firstSendFails,
    });

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Alert B");
  });

  it("alerts parent and child budgets independently", async () => {
    const parent = await addCategory("Alert Parent", null, alertUser);
    const child = await addCategory("Alert Child", parent, alertUser);
    const acc = await addAccount("PLN", alertUser);
    await addTx({
      accountId: acc,
      categoryId: child,
      amountMinor: -3000,
      date: "2026-11-03",
      owner: alertUser,
    });
    await createBudget(
      alertUser,
      { categoryId: child, currency: "PLN", limit: "20.00" },
      db,
    );
    await createBudget(
      alertUser,
      { categoryId: parent, currency: "PLN", limit: "100.00" },
      db,
    );
    await check();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Alert Child");

    await addTx({
      accountId: acc,
      categoryId: parent,
      amountMinor: -9000,
      date: "2026-11-04",
      owner: alertUser,
    });
    await check();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.text).toContain("Alert Parent");
  });

  it("never alerts for spending added in earlier months", async () => {
    const { cat, acc } = await setup("100.00", 9000, "Alert Old");
    await check();
    expect(sent).toHaveLength(0);

    // A backdated transaction would push a combined total over the limit,
    // but only the budget month counts.
    await addTx({
      accountId: acc,
      categoryId: cat,
      amountMinor: -50000,
      date: "2026-10-20",
      owner: alertUser,
    });
    await check();
    expect(sent).toHaveLength(0);
  });

  it("alerts again for a budget recreated after removeBudget in the same month", async () => {
    const a = await setup("10.00", 5000, "Alert A");
    await check();
    expect(sent).toHaveLength(1);

    expect(await removeBudget(alertUser, a.budgetId, db)).toEqual({
      id: a.budgetId,
    });
    await createBudget(
      alertUser,
      { categoryId: a.cat, currency: "PLN", limit: "10.00" },
      db,
    );
    await check();
    expect(sent).toHaveLength(2);
  });

  it("alerts again for a budget recreated after removeBudgetsForCategories", async () => {
    const b = await setup("10.00", 5000, "Alert B");
    await check();
    expect(sent).toHaveLength(1);

    await removeBudgetsForCategories(alertUser, [b.cat], db);
    await createBudget(
      alertUser,
      { categoryId: b.cat, currency: "PLN", limit: "10.00" },
      db,
    );
    await check();
    expect(sent).toHaveLength(2);
  });
});

describe("runBudgetAlertCheckSafely logging", () => {
  it("never logs the error message, which may carry SQL and parameters", async () => {
    const logged: unknown[] = [];
    const logger = await import("../src/server/logger.ts");
    const spy = vi.spyOn(logger, "getLogger").mockReturnValue({
      error: (...args: unknown[]) => logged.push(args),
      warn: (...args: unknown[]) => logged.push(args),
    } as unknown as ReturnType<typeof logger.getLogger>);
    const failingDb = {
      select: () => {
        throw new Error(
          "Failed query: select email from users params: super-secret@example.com",
        );
      },
    } as unknown as typeof db;

    try {
      await runBudgetAlertCheckSafely("log-leak-user", failingDb);
    } finally {
      spy.mockRestore();
    }

    expect(logged).toHaveLength(1);
    const text = JSON.stringify(logged);
    expect(text).toContain("log-leak-user");
    expect(text).not.toContain("Failed query");
    expect(text).not.toContain("super-secret");
  });
});

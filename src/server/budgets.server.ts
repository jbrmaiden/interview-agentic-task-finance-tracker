import { and, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb, schema } from "#/db";
import { parseAmountToMinor } from "#/lib/money";
import { checkBudgetLimit } from "#/server/billing.server";

//
// The single owner of every budget rule (see GLOSSARY.md and ADR 0001).
// Spending is always computed live from transactions and the current category
// tree; nothing about it is stored.

type Db = typeof defaultDb;

export interface BudgetProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryParentId: string | null;
  currency: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  overBudget: boolean;
}

export interface BudgetsOverview {
  /** The budget month, "YYYY-MM" (UTC). */
  month: string;
  budgets: BudgetProgress[];
  /** Distinct currencies of the user's accounts. */
  currencies: string[];
  /** Currency of the account with the most transactions; PLN on a tie/none. */
  defaultCurrency: string;
}

/** "YYYY-MM-01" of the budget month containing `now` (UTC). */
function monthStartDate(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** "YYYY-MM-01" of the month after the one containing `now` (UTC). */
function nextMonthStartDate(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

async function loadCurrencies(
  userId: string,
  db: Db,
): Promise<{ currencies: string[]; defaultCurrency: string }> {
  const rows = await db
    .select({
      currency: schema.accounts.currency,
      txCount: sql<number>`COUNT(${schema.transactions.id})`.mapWith(Number),
    })
    .from(schema.accounts)
    .leftJoin(
      schema.transactions,
      eq(schema.transactions.account_id, schema.accounts.id),
    )
    .where(eq(schema.accounts.user_id, userId))
    .groupBy(schema.accounts.id, schema.accounts.currency);

  const currencies = [
    ...new Set(rows.map((r) => r.currency ?? "PLN")),
  ].sort();

  // Currency of the account with the most transactions. On a tie or with no
  // transactions: PLN if the user has it, else their first sorted currency.
  const fallback = currencies.includes("PLN") ? "PLN" : (currencies[0] ?? "PLN");
  const top = Math.max(0, ...rows.map((r) => r.txCount));
  const topCurrencies = new Set(
    rows.filter((r) => r.txCount === top).map((r) => r.currency ?? "PLN"),
  );
  const defaultCurrency =
    top > 0 && topCurrencies.size === 1 ? [...topCurrencies][0]! : fallback;
  return { currencies, defaultCurrency };
}

export async function listBudgets(
  userId: string,
  now: Date = new Date(),
  db: Db = defaultDb,
): Promise<BudgetsOverview> {
  const from = monthStartDate(now);
  const to = nextMonthStartDate(now);

  const result = await db.execute(sql`
    WITH RECURSIVE tree(budget_id, category_id) AS (
      SELECT b.id, b.category_id FROM ${schema.budgets} b
      WHERE b.user_id = ${userId}
      UNION ALL
      SELECT t.budget_id, c.id
      FROM tree t
      JOIN ${schema.categories} c
        ON c.parent_id = t.category_id AND c.user_id = ${userId}
    )
    SELECT
      b.id,
      b.category_id,
      b.currency,
      b.limit_minor,
      cat.name AS category_name,
      cat.color AS category_color,
      cat.parent_id AS category_parent_id,
      COALESCE((
        SELECT SUM(ABS(tx.amount_minor))
        FROM tree t
        JOIN ${schema.transactions} tx ON tx.category_id = t.category_id
        JOIN ${schema.accounts} a ON a.id = tx.account_id
        WHERE t.budget_id = b.id
          AND tx.user_id = ${userId}
          AND tx.amount_minor < 0
          AND tx.date >= ${from}::date AND tx.date < ${to}::date
          AND a.currency = b.currency
      ), 0)::bigint AS spent_minor
    FROM ${schema.budgets} b
    JOIN ${schema.categories} cat ON cat.id = b.category_id
    WHERE b.user_id = ${userId}
    ORDER BY cat.name ASC, b.currency ASC
  `);

  const budgets: BudgetProgress[] = (
    result.rows as Array<Record<string, unknown>>
  ).map((r) => {
    const limitMinor = Number(r.limit_minor);
    const spentMinor = Number(r.spent_minor);
    return {
      id: r.id as string,
      categoryId: r.category_id as string,
      categoryName: r.category_name as string,
      categoryColor: (r.category_color as string | null) ?? null,
      categoryParentId: (r.category_parent_id as string | null) ?? null,
      currency: r.currency as string,
      limitMinor,
      spentMinor,
      remainingMinor: limitMinor - spentMinor,
      overBudget: spentMinor > limitMinor,
    };
  });

  return {
    month: from.slice(0, 7),
    budgets,
    ...(await loadCurrencies(userId, db)),
  };
}

/** Postgres `integer` maximum, the type of `budgets.limit_minor`. */
const MAX_LIMIT_MINOR = 2147483647;

/** Parse a typed limit; null when not a positive amount that fits the column. */
function parseLimit(limit: string): number | null {
  const minor = parseAmountToMinor(limit);
  if (minor === null || minor <= 0 || minor > MAX_LIMIT_MINOR) return null;
  return minor;
}

export type CreateBudgetInput = {
  categoryId: string;
  currency: string;
  /** Decimal amount as typed by the user, e.g. "250.00". */
  limit: string;
};

export type BudgetErrorCode =
  | "invalid_limit"
  | "category_not_found"
  | "currency_unavailable"
  | "budget_exists"
  | "budget_limit_reached";

export type CreateBudgetResult =
  | { id: string }
  | { error: string; code: BudgetErrorCode; limit?: number };

export async function createBudget(
  userId: string,
  input: CreateBudgetInput,
  db: Db = defaultDb,
): Promise<CreateBudgetResult> {
  const limitMinor = parseLimit(input.limit);
  if (limitMinor === null) {
    return { error: "Limit must be a positive amount", code: "invalid_limit" };
  }

  // Ownership in the same query: foreign category == missing category.
  const cat = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, input.categoryId),
        eq(schema.categories.user_id, userId),
      ),
    )
    .limit(1);
  if (cat.length === 0) {
    return { error: "Category not found", code: "category_not_found" };
  }

  const { currencies } = await loadCurrencies(userId, db);
  if (!currencies.includes(input.currency)) {
    return { error: "Currency not available", code: "currency_unavailable" };
  }

  const gate = await checkBudgetLimit(userId, db);
  if (!gate.allowed) {
    return { error: gate.error, code: gate.code, limit: gate.limit };
  }

  const id = crypto.randomUUID();
  const inserted = await db
    .insert(schema.budgets)
    .values({
      id,
      user_id: userId,
      category_id: input.categoryId,
      currency: input.currency,
      limit_minor: limitMinor,
    })
    .onConflictDoNothing()
    .returning({ id: schema.budgets.id });
  if (inserted.length === 0) {
    return {
      error: "A budget for this category and currency already exists",
      code: "budget_exists",
    };
  }
  return { id };
}


export type ChangeBudgetLimitResult =
  | { id: string }
  | { error: string; code: "invalid_limit" | "budget_not_found" };

/** Change only the limit; category and currency are fixed after creation. */
export async function changeBudgetLimit(
  userId: string,
  budgetId: string,
  limit: string,
  db: Db = defaultDb,
): Promise<ChangeBudgetLimitResult> {
  const limitMinor = parseLimit(limit);
  if (limitMinor === null) {
    return { error: "Limit must be a positive amount", code: "invalid_limit" };
  }
  // Ownership in the same query: foreign budget == missing budget.
  const updated = await db
    .update(schema.budgets)
    .set({ limit_minor: limitMinor, updated_at: new Date() })
    .where(
      and(eq(schema.budgets.id, budgetId), eq(schema.budgets.user_id, userId)),
    )
    .returning({ id: schema.budgets.id });
  if (updated.length === 0) {
    return { error: "Budget not found", code: "budget_not_found" };
  }
  return { id: budgetId };
}

export type RemoveBudgetResult =
  | { id: string }
  | { error: string; code: "budget_not_found" };

/** Remove a budget. Transactions and categories are never touched. */
export async function removeBudget(
  userId: string,
  budgetId: string,
  db: Db = defaultDb,
): Promise<RemoveBudgetResult> {
  const deleted = await db
    .delete(schema.budgets)
    .where(
      and(eq(schema.budgets.id, budgetId), eq(schema.budgets.user_id, userId)),
    )
    .returning({ id: schema.budgets.id });
  if (deleted.length === 0) {
    return { error: "Budget not found", code: "budget_not_found" };
  }
  return { id: budgetId };
}

/** Remove every budget on the given categories (used by category deletion). */
export async function removeBudgetsForCategories(
  userId: string,
  categoryIds: string[],
  db: Db = defaultDb,
): Promise<void> {
  if (categoryIds.length === 0) return;
  await db
    .delete(schema.budgets)
    .where(
      and(
        eq(schema.budgets.user_id, userId),
        inArray(schema.budgets.category_id, categoryIds),
      ),
    );
}

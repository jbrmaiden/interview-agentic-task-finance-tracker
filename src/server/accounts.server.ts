import { and, eq } from "drizzle-orm";
import { db as defaultDb, schema } from "#/db";
import {
  checkBudgetsAfterWrite,
  type BudgetAlertDeps,
} from "#/server/budgets.server";

export interface UpdateAccountInput {
  userId: string;
  id: string;
  name: string;
  bank?: string | null;
  currency: string;
}

/**
 * Update one of the user's accounts. Spending counts toward budgets by the
 * account's current currency, so when the currency changes (a missing one
 * counts as PLN) the budget alert check runs. Another user's account is left
 * untouched and triggers no check.
 */
export async function updateAccountForUser(
  { userId, id, name, bank, currency }: UpdateAccountInput,
  deps: BudgetAlertDeps = {},
): Promise<{ success: true }> {
  const db = deps.db ?? defaultDb;
  const owned = and(
    eq(schema.accounts.id, id),
    eq(schema.accounts.user_id, userId),
  );
  const [before] = await db
    .select({ currency: schema.accounts.currency })
    .from(schema.accounts)
    .where(owned)
    .limit(1);
  await db
    .update(schema.accounts)
    .set({ name, bank: bank || null, currency })
    .where(owned);

  await checkBudgetsAfterWrite(
    userId,
    before !== undefined && (before.currency ?? "PLN") !== currency,
    deps,
  );
  return { success: true };
}

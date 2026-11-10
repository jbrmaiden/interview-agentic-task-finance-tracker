import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "#/server/session";
import {
  changeBudgetLimit,
  createBudget,
  listBudgets,
  removeBudget,
  runBudgetAlertCheckSafely,
} from "#/server/budgets.server";

const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  limit: z.string().max(32),
});

export const getBudgets = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    return listBudgets(userId);
  },
);

export const createBudgetFn = createServerFn({ method: "POST" })
  .inputValidator(createBudgetSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const result = await createBudget(userId, data);
    if ("id" in result) await runBudgetAlertCheckSafely(userId);
    return result;
  });

const changeLimitSchema = z.object({
  id: z.string().min(1),
  limit: z.string().max(32),
});

export const changeBudgetLimitFn = createServerFn({ method: "POST" })
  .inputValidator(changeLimitSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const result = await changeBudgetLimit(userId, data.id, data.limit);
    if ("id" in result) await runBudgetAlertCheckSafely(userId);
    return result;
  });

export const removeBudgetFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return removeBudget(userId, data.id);
  });

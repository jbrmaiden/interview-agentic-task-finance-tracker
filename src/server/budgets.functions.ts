import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId } from "#/server/session";
import {
  changeBudgetLimit,
  createBudget,
  listBudgets,
  removeBudget,
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
    return createBudget(userId, data);
  });

const changeLimitSchema = z.object({
  id: z.string().min(1),
  limit: z.string().max(32),
});

export const changeBudgetLimitFn = createServerFn({ method: "POST" })
  .inputValidator(changeLimitSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return changeBudgetLimit(userId, data.id, data.limit);
  });

export const removeBudgetFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return removeBudget(userId, data.id);
  });

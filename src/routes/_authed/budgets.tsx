import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { m } from "#/paraglide/messages";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectItem } from "#/components/ui/select";
import { CategoryBadge } from "#/components/ui/category-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { EditButton, DeleteButton } from "#/components/ui/action-buttons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import {
  getBudgets,
  createBudgetFn,
  changeBudgetLimitFn,
  removeBudgetFn,
} from "#/server/budgets.functions";
import { getCategories } from "#/server/categories.functions";
import { formatMinor, formatMoney, parseAmountToMinor } from "#/lib/money";

const BUDGETS_QUERY_KEY = ["budgets"] as const;
const CATEGORIES_QUERY_KEY = ["categories"] as const;

type CategoryRow = Awaited<ReturnType<typeof getCategories>>[number];
type BudgetRow = Awaited<ReturnType<typeof getBudgets>>["budgets"][number];

export const Route = createFileRoute("/_authed/budgets")({
  component: BudgetsPage,
});

/** Depth-first flattening so subcategories sit visibly under their parent. */
function flattenCategoryTree(
  categories: CategoryRow[],
): { id: string; name: string; depth: number }[] {
  const children = new Map<string | null, CategoryRow[]>();
  const ids = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const list = (children.get(parent) ?? []).sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name),
    );
    for (const c of list) {
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function errorMessage(
  code: string | undefined,
  fallback: string | null,
  limit?: number,
) {
  switch (code) {
    case "budget_limit_reached":
      return m.budget_limit_reached({ limit: limit ?? 0 });
    case "category_not_found":
      return m.budget_category_not_found();
    case "currency_unavailable":
      return m.budget_currency_unavailable();
    case "budget_exists":
      return m.budget_exists();
    case "invalid_limit":
      return m.budget_limit_invalid();
    case "budget_not_found":
      return m.budget_not_found();
    default:
      return fallback;
  }
}

// --- Add form ---

function BudgetForm({
  isOpen,
  categories,
  currencies,
  defaultCurrency,
  error,
  upgradeLink,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  categories: CategoryRow[];
  currencies: string[];
  defaultCurrency: string;
  error: string | null;
  upgradeLink?: React.ReactNode;
  onClose: () => void;
  onSubmit: (data: {
    categoryId: string;
    currency: string;
    limit: string;
  }) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [limit, setLimit] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const options = useMemo(() => flattenCategoryTree(categories), [categories]);

  useEffect(() => {
    if (isOpen) {
      setCategoryId("");
      setCurrency(defaultCurrency);
      setLimit("");
      setValidationError(null);
      setSubmitting(false);
    }
  }, [isOpen, defaultCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      setValidationError(m.budget_category_required());
      return;
    }
    const minor = parseAmountToMinor(limit);
    if (minor === null || minor <= 0) {
      setValidationError(m.budget_limit_invalid());
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit({ categoryId, currency, limit });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.add_budget()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="budget-category" className="mb-1">
              {m.budget_category_label()}
            </Label>
            <Select
              id="budget-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <SelectItem value="">{m.budget_category_placeholder()}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {`${"— ".repeat(o.depth)}${o.name}`}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="budget-currency" className="mb-1">
              {m.budget_currency_label()}
            </Label>
            <Select
              id="budget-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="budget-limit" className="mb-1">
              {m.budget_limit_label()}
            </Label>
            <Input
              id="budget-limit"
              type="text"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {(validationError || error) && (
            <div className="text-destructive text-sm" role="alert">
              {validationError ?? error}
              {upgradeLink}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              {m.cancel()}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? m.creating() : m.create_budget_btn()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Row ---

function BudgetItem({
  budget,
  depth,
  onEdit,
  onRemove,
}: {
  budget: BudgetRow;
  depth: number;
  onEdit: (b: BudgetRow) => void;
  onRemove: (b: BudgetRow) => void;
}) {
  const percent =
    budget.limitMinor > 0
      ? Math.min(100, Math.round((budget.spentMinor / budget.limitMinor) * 100))
      : 0;
  return (
    <div
      className="px-3 py-3 space-y-2"
      data-testid="budget-row"
      data-over-budget={budget.overBudget}
      style={{ paddingLeft: `${depth * 24 + 12}px` }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-32">
          <CategoryBadge
            name={budget.categoryName}
            color={budget.categoryColor}
          />
        </span>
        <span className="w-14 text-sm font-mono text-muted-foreground">
          {budget.currency}
        </span>
        <span className="w-32 text-sm text-right tabular-nums">
          <span className="sr-only">{m.budget_limit_column()}: </span>
          {formatMoney(budget.limitMinor, budget.currency)}
        </span>
        <span className="w-32 text-sm text-right tabular-nums">
          <span className="sr-only">{m.budget_spent_column()}: </span>
          {formatMoney(budget.spentMinor, budget.currency)}
        </span>
        <span
          className={`w-40 text-sm text-right tabular-nums ${
            budget.overBudget ? "text-destructive font-semibold" : ""
          }`}
        >
          {budget.overBudget
            ? m.budget_over_by({
                amount: formatMoney(-budget.remainingMinor, budget.currency),
              })
            : m.budget_left({
                amount: formatMoney(budget.remainingMinor, budget.currency),
              })}
        </span>
        {budget.overBudget && (
          <span className="text-xs font-semibold uppercase rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
            {m.budget_over_label()}
          </span>
        )}
        <span className="flex gap-1.5">
          <EditButton
            onClick={() => onEdit(budget)}
            data-testid="edit-budget"
          />
          <DeleteButton
            onClick={() => onRemove(budget)}
            data-testid="remove-budget"
          />
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={m.budget_progress_label({ category: budget.categoryName })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
      >
        <div
          className={`h-full rounded-full ${
            budget.overBudget ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// --- Edit form: only the limit is editable ---

function EditBudgetForm({
  budget,
  error,
  onClose,
  onSubmit,
}: {
  budget: BudgetRow | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (limit: string) => Promise<void>;
}) {
  const [limit, setLimit] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (budget) {
      setLimit(formatMinor(budget.limitMinor));
      setValidationError(null);
      setSubmitting(false);
    }
  }, [budget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = parseAmountToMinor(limit);
    if (minor === null || minor <= 0) {
      setValidationError(m.budget_limit_invalid());
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit(limit);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={budget !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.edit_budget()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="edit-budget-category" className="mb-1">
              {m.budget_category_label()}
            </Label>
            <Input
              id="edit-budget-category"
              value={budget?.categoryName ?? ""}
              readOnly
              disabled
            />
          </div>
          <div>
            <Label htmlFor="edit-budget-currency" className="mb-1">
              {m.budget_currency_label()}
            </Label>
            <Input
              id="edit-budget-currency"
              value={budget?.currency ?? ""}
              readOnly
              disabled
            />
          </div>
          <div>
            <Label htmlFor="edit-budget-limit" className="mb-1">
              {m.budget_limit_label()}
            </Label>
            <Input
              id="edit-budget-limit"
              type="text"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {(validationError || error) && (
            <div className="text-destructive text-sm" role="alert">
              {validationError ?? error}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              {m.cancel()}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? m.saving() : m.save_budget_btn()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Remove confirmation ---

function RemoveBudgetDialog({
  budget,
  error,
  onCancel,
  onConfirm,
}: {
  budget: BudgetRow | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={budget !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{m.remove_budget_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.remove_budget_confirm({
              category: budget?.categoryName ?? "",
              currency: budget?.currency ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div
            className="text-destructive text-sm p-3 rounded-md bg-destructive/10"
            role="alert"
          >
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{m.cancel()}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {m.remove_budget_btn()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// --- Page ---

function BudgetsPage() {
  const queryClient = useQueryClient();
  const getBudgetsFn = useServerFn(getBudgets);
  const getCategoriesFn = useServerFn(getCategories);
  const createBudgetServerFn = useServerFn(createBudgetFn);
  const changeLimitServerFn = useServerFn(changeBudgetLimitFn);
  const removeBudgetServerFn = useServerFn(removeBudgetFn);

  const { data, isLoading } = useQuery({
    queryKey: BUDGETS_QUERY_KEY,
    queryFn: () => getBudgetsFn(),
    // Spending changes whenever transactions change elsewhere.
    refetchOnMount: "always",
  });
  const { data: categories = [] } = useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => getCategoriesFn(),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      categoryId: string;
      currency: string;
      limit: string;
    }) => createBudgetServerFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_QUERY_KEY });
    },
  });

  const changeLimitMutation = useMutation({
    mutationFn: (input: { id: string; limit: string }) =>
      changeLimitServerFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_QUERY_KEY });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeBudgetServerFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_QUERY_KEY });
    },
  });

  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BudgetRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const budgets = data?.budgets ?? [];
  const currencies = data?.currencies ?? [];
  const hasAccounts = currencies.length > 0;

  // Nest a budget under its parent's budget when both share a currency.
  const ordered = useMemo(() => {
    const order = new Map(
      flattenCategoryTree(categories).map((c, i) => [c.id, i] as const),
    );
    return [...budgets].sort(
      (a, b) =>
        (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
        a.currency.localeCompare(b.currency),
    );
  }, [budgets, categories]);
  const depthById = useMemo(
    () =>
      new Map(
        flattenCategoryTree(categories).map((c) => [c.id, c.depth] as const),
      ),
    [categories],
  );

  const handleSubmit = async (input: {
    categoryId: string;
    currency: string;
    limit: string;
  }) => {
    setFormError(null);
    setLimitReached(false);
    const result = await createMutation.mutateAsync(input);
    if (result && "error" in result) {
      setFormError(errorMessage(result.code, result.error, result.limit));
      setLimitReached(result.code === "budget_limit_reached");
      return;
    }
    setIsFormOpen(false);
  };

  const handleEdit = async (limit: string) => {
    if (!editing) return;
    setEditError(null);
    const result = await changeLimitMutation.mutateAsync({
      id: editing.id,
      limit,
    });
    if (result && "error" in result) {
      setEditError(errorMessage(result.code, result.error));
      return;
    }
    setEditing(null);
  };

  const handleRemove = async () => {
    if (!removing) return;
    setRemoveError(null);
    const result = await removeMutation.mutateAsync(removing.id);
    if (result && "error" in result) {
      setRemoveError(errorMessage(result.code, result.error));
      return;
    }
    setRemoving(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/50 bg-header-bg/80 backdrop-blur-sm">
        <div className="page-wrap py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold display-title">
              {m.budgets_title()}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {m.budgets_subtitle()}
            </p>
            {data && (
              <p
                className="text-sm font-medium mt-1"
                data-testid="budget-month"
              >
                {m.budgets_month({ month: data.month })}
              </p>
            )}
          </div>
          {hasAccounts && (
            <Button
              onClick={() => {
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              {m.add_budget()}
            </Button>
          )}
        </div>
      </header>

      <main className="page-wrap py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                {m.loading_budgets()}
              </span>
            </div>
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h3 className="text-base font-medium mb-1">
              {m.budgets_need_account()}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {m.budgets_need_account_desc()}
            </p>
            <Link to="/accounts" className="text-sm underline">
              {m.budgets_go_to_accounts()}
            </Link>
          </div>
        ) : budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h3 className="text-base font-medium mb-1">{m.no_budgets_yet()}</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              {m.add_first_budget()}
            </p>
          </div>
        ) : (
          <div className="island-shell rounded-xl overflow-hidden divide-y divide-line/30">
            {ordered.map((b) => (
              <BudgetItem
                key={b.id}
                budget={b}
                depth={depthById.get(b.categoryId) ?? 0}
                onEdit={(row) => {
                  setEditError(null);
                  setEditing(row);
                }}
                onRemove={(row) => {
                  setRemoveError(null);
                  setRemoving(row);
                }}
              />
            ))}
          </div>
        )}
      </main>

      <BudgetForm
        isOpen={isFormOpen}
        categories={categories}
        currencies={currencies}
        defaultCurrency={data?.defaultCurrency ?? "PLN"}
        error={formError}
        upgradeLink={
          limitReached ? (
            <Link to="/billing" className="ml-1 underline font-medium">
              {m.budget_upgrade_link()}
            </Link>
          ) : null
        }
        onClose={() => {
          setIsFormOpen(false);
          setFormError(null);
        }}
        onSubmit={handleSubmit}
      />
      <EditBudgetForm
        budget={editing}
        error={editError}
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
        onSubmit={handleEdit}
      />
      <RemoveBudgetDialog
        budget={removing}
        error={removeError}
        onCancel={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
        onConfirm={handleRemove}
      />
    </div>
  );
}

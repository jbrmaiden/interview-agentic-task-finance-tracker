# 02: Change a budget's limit, remove it, and follow category changes

**What to build:** A user can edit a budget, changing only its limit (category and currency are fixed after creation), and remove a budget after confirming in a dialog. Removing a budget leaves transactions and categories untouched. Budgets also stay consistent with the category tree: deleting a category — directly, or because its parent was deleted — removes every budget on it, and moving a category under a different parent changes what budgets cover with no extra action.

Spec: `.scratch/budgets/spec.md` (user stories 34–40).

**Blocked by:** 01 (Budgets page — add a budget and see its progress)

**Status:** resolved

- [ ] Budgets module and server functions gain "change limit" and "remove budget", both ownership-checked in the same query; a foreign or missing budget returns `budget_not_found`.
- [ ] The edit dialog shows the budget's category and currency read-only and validates the new limit like creation does.
- [ ] Remove goes through a confirmation dialog.
- [ ] Category deletion removes budgets on the deleted category and all its deleted descendants before the categories are deleted (the schema has no cascades); existing category-deletion behaviour is otherwise unchanged.
- [ ] Re-parenting a category re-scopes budgets: a parent budget gains a moved-in child's spending and loses a moved-out child's.
- [ ] Unit tests at the budgets module seam: change limit, remove, budgets removed for deleted categories, re-parenting changes spending.
- [ ] E2E tests: edit limit, remove with confirmation, deleting a budgeted category removes its budget from the Budgets page.
- [ ] Existing categories E2E and unit tests still pass; `pnpm run check` passes.

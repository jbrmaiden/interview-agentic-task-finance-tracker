# 01: Budgets page — add a budget and see its progress

**What to build:** The tracer bullet for budgets. A signed-in user finds "Budgets" in the main navigation (after Categories), opens the page, and adds a budget by choosing a category, a currency, and a monthly limit. The page then lists their budgets for the current budget month, each showing its category (name and colour), currency, limit, spending this budget month, what's left, a progress indicator, and an unmistakable over-budget state (label, distinct colour, and "over by" amount instead of a negative "left"). Spending follows every rule in the spec: the category and all its subcategories at any depth, expense transactions only (income and refunds ignored, never netted), only accounts in the budget's currency, only transactions dated in the current UTC calendar month, uncategorised transactions never counted. Over budget means spending strictly greater than the limit.

Spec: `.scratch/budgets/spec.md` (user stories 1–33, 62–63). Vocabulary: `GLOSSARY.md`. Decision: `docs/adr/0001-budgets-are-per-currency.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] New migration adds the budgets table: owner, category, currency, limit in integer minor units, created/updated timestamps; unique on (user, category, currency); indexed by user. Existing tables unchanged.
- [ ] Budgets server module exposes "list budgets with progress" for an injectable `now` (plus available currencies and the default currency) and "create budget"; server functions wrap them with zod validation and session user resolution.
- [ ] Create validates: limit is a positive amount parsed with the existing money parser; category exists and is owned by the user (a foreign category returns the same error as a missing one); currency is one of the user's account currencies; no existing budget for that (category, currency). Errors return machine codes (`category_not_found`, `currency_unavailable`, `budget_exists`) that the UI localises.
- [ ] Currency picker lists only the distinct currencies of the user's accounts and defaults to the currency of the account with the most transactions (PLN on a tie or with no transactions).
- [ ] Category picker shows the tree with subcategories visibly nested.
- [ ] Empty state when there are no budgets; "add an account first" state when the user has no accounts; loading indicator while fetching. The page shows which month it covers.
- [ ] Exactly-at-limit shows "0 left" and is not over budget.
- [ ] Parent and child budgets on the same tree coexist and are computed independently.
- [ ] All new UI text is in the Paraglide catalogue; the route imports only server functions.
- [ ] Unit tests at the budgets module seam cover: descendants at depth ≥2, income/refund exclusion, other-currency exclusion, other-month exclusion (both sides of a boundary with an explicit `now`), other-user isolation, uncategorised exclusion, exactly-at-limit, over budget, overlap, uniqueness, foreign-category rejection, available and default currency.
- [ ] E2E tests: nav entry, empty state, add a budget, spent/left after creating transactions in the UI, parent budget counting a subcategory transaction, income not reducing spending, over-budget display, validation errors (empty/zero limit, duplicate budget).
- [ ] `pnpm run check` passes.

# 03: Free-plan budget allowance and upsell

**What to build:** Free-plan users can hold up to 3 budgets; Pro users unlimited. A free user trying to add a fourth budget sees a clear, localised message that the free plan is limited to 3 budgets, with a link to the billing page to upgrade. Users who downgraded with more than 3 budgets keep all of them working — only creating new ones is blocked. The billing page's usage list shows budget usage against the plan's allowance. The allowance is operator-configurable, like the account allowance.

Spec: `.scratch/budgets/spec.md` (user stories 54–59).

**Blocked by:** 01 (Budgets page — add a budget and see its progress)

**Status:** resolved

- [ ] New env setting `BILLING_FREE_MAX_BUDGETS`, default 3, validated as a positive integer like `BILLING_FREE_MAX_ACCOUNTS`; documented in the example env file.
- [ ] Entitlements gain `maxBudgets` (a number on Free, `null` = unlimited on Pro); plan checks stay in the billing module, none in UI code.
- [ ] A budget-allowance gate mirrors the account-allowance gate: create returns `budget_limit_reached` with the `limit` when at or above the allowance; existing budgets are never deleted or locked.
- [ ] The Budgets page shows the localised limit message with a link to the billing page when creation is blocked.
- [ ] Billing status and billing page show "N of M budgets" on Free and "N budgets (unlimited)" on Pro.
- [ ] Unit tests: entitlement mapping includes `maxBudgets`; env default and validation; gate blocks the 4th on Free, allows on Pro, keeps existing budgets after a downgrade.
- [ ] E2E tests (via the test plan override): Free blocked on the 4th with upgrade link; Pro creates more than 3; billing page budget usage.
- [ ] Existing billing tests still pass; `pnpm run check` passes.

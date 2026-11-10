# 06: Budgets in data export and account deletion

**What to build:** Budgets are user data with the same compliance treatment as everything else. A user's data export includes their budgets and budget alert history, and permanent account deletion removes them. Budgets are part of the shared ownership registry so ownership checks treat them like every other user-owned entity.

Spec: `.scratch/budgets/spec.md` (user stories 60–61, 65; "Compliance module" and "Ownership registry" implementation decisions).

**Blocked by:** 04 (Budget alert email on manual transaction changes)

**Status:** resolved

- [x] The export document includes budgets and budget alerts; the zip gains a budgets CSV (category name, currency, limit as a decimal, created date).
- [x] Account hard delete removes budget alerts, then budgets, before categories, inside the existing transaction.
- [x] Budgets join the owned-entity table set.
- [x] The compliance unit tests' full-user seed gains a budget and a budget alert; export assertions check they appear (JSON and CSV) and hard-delete assertions check they're gone.
- [x] Existing compliance unit and E2E tests still pass; `pnpm run check` passes.

# 05: Budget alerts from every other transaction write, plus the hourly backstop

**What to build:** Budget alerts fire no matter how spending reaches a category, not just from manual edits. The alert check also runs after a CSV import, a receipt scan that creates or updates a transaction, applying a categorisation rule, AI auto-categorisation, and transaction reassignment during category deletion. The existing hourly in-process maintenance loop runs the check for every user with at least one budget, so a missed or failed alert is caught later.

Spec: `.scratch/budgets/spec.md` ("Triggers" and "Maintenance loop" implementation decisions).

**Blocked by:** 04 (Budget alert email on manual transaction changes)

**Status:** ready-for-agent

- [ ] Each listed write path calls the user's alert check once after its write succeeds — once per request for bulk paths (import, re-categorise), never per row; errors are caught and never fail the action.
- [ ] Budgets module exposes "run alert check for all users with budgets", used by the maintenance loop; it's isolated from the compliance sweep so a failure in one doesn't skip the other. TEST_MODE behaviour of the loop is unchanged (not armed).
- [ ] Unit test: the all-users check alerts over-budget budgets across several users and skips users without budgets.
- [ ] Per-path wiring verified in review (agreed: not separately tested).
- [ ] All existing import, receipt, categorisation, and category E2E tests still pass; `pnpm run check` passes.

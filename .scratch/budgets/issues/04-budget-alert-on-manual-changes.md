# 04: Budget alert email on manual transaction changes

**What to build:** When a budget is found over budget, the user gets one budget alert email for that budget in that budget month. The email names the category and shows the limit, the spending, and how much over, formatted in the budget's currency, with a link to the Budgets page. In this ticket the check runs after a manual transaction create or edit, and after a budget is created or its limit changes (so setting a limit below what's already spent also alerts). Alerts are strict: at most one per budget per month, regardless of limit changes; a new month allows a new alert. Only users with a verified email receive alerts, and skipping an unverified user doesn't use up the month's alert. A failed send is retried by a later check.

Spec: `.scratch/budgets/spec.md` (user stories 41–53, 64; "Budget alerts" implementation decisions).

**Blocked by:** 02 (Change a budget's limit, remove it, and follow category changes)

**Status:** ready-for-agent

- [ ] New migration adds the budget alerts ledger: budget, owner, budget month (`YYYY-MM`), sent timestamp; unique on (budget, budget month). Removing a budget (ticket 02, and budgets removed by category deletion) also removes its alert records.
- [ ] Budgets module exposes "run alert check for a user" with injectable `now`: for each over-budget budget not yet alerted this month, claim the ledger row (insert, no-op on conflict), send, and release the claim if the send fails.
- [ ] Unverified or missing email: skipped without claiming.
- [ ] Email subject and body come from the Paraglide catalogue; amounts use the existing money formatter; the link is built from the configured app base URL.
- [ ] The check runs after the triggering write succeeds; its errors are caught and logged (ids and counts only) and never fail the user's action.
- [ ] Wired into: manual transaction create, manual transaction edit, budget create, budget limit change. Not into transaction deletion.
- [ ] Unit tests (observing captured emails, not the ledger): sends once; no resend after raising the limit; resends in a new month; sends when a limit is set below spending; unverified skipped then sent after verification; retry after a failed send; parent and child alert independently; earlier-month spending never alerts.
- [ ] E2E test: a transaction created in the UI pushes a budget over → one alert in the test email capture with the expected category and amounts; a second over-budget transaction → still one email.
- [ ] `pnpm run check` passes.

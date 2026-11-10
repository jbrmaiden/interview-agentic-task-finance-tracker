# 01: Show the free-plan budget allowance before it's reached

**What to build:** A free-plan user can see how many budgets they have left before they try to add one. When the budget allowance is used up (3 of 3), "Add Budget" is disabled and the upgrade hint linking to the billing page is already visible. They don't have to submit first and get rejected. The list of budgets reports the budget allowance and usage, as the budgets spec's module contract asks ("plus the plan allowance and usage"). After a budget is created or removed, the billing page's "N of M budgets" usage line shows the new count without a manual reload.

Source: full two-axis review of the budgets feature (`275a04a..80f412a`); spec story 55 and the "Budgets server module" and "Billing page" implementation decisions in `.scratch/budgets/spec.md`.

Decision (agreed in conversation): the plan's quota is called **Budget allowance**, a distinct term from **Limit**. Add it to `GLOSSARY.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Listing a user's budgets returns the budget allowance (a number, or unlimited for paid plans) and the current usage, alongside the existing month, budgets and currencies.
- [ ] Free plan at the allowance: "Add Budget" is disabled and the upgrade hint shows without a submit. Below the allowance, and on paid plans, the button is enabled. The server-side block on creation stays as the source of truth.
- [ ] Creating or removing a budget refreshes the cached billing usage as well as the budgets list.
- [ ] `GLOSSARY.md` gains **Budget allowance** (how many budgets a plan permits; _Avoid_: cap, quota, limit), and existing wording in the spec and tests is consistent with it.
- [ ] Unit test at the budgets server module seam: the overview reports allowance and usage for free and paid users.
- [ ] E2E: a free user with 3 budgets sees "Add Budget" disabled and the upgrade hint. Removing one re-enables it.
- [ ] Existing budgets and billing unit and E2E tests still pass.

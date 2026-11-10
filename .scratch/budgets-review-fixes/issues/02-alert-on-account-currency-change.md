# 02: Budget alert when an account's currency changes

**What to build:** Spending counts toward a budget only from accounts whose current currency matches the budget's currency. So when a user changes an account's currency, that account's spending this budget month moves to the budgets in its new currency, and one of those may go over budget. The user's alert check now runs right after the account change succeeds, so the budget alert arrives promptly (story 47) rather than at the next hourly backstop. Also, legacy accounts with no currency recorded are already shown as PLN when the user picks a budget currency, and their spending now counts toward PLN budgets too, so the two agree.

Source: full two-axis review of the budgets feature (`275a04a..80f412a`); spec "Triggers" and "Failure isolation" implementation decisions in `.scratch/budgets/spec.md`; ADR 0001 (budgets are per currency).

Decision (agreed in conversation): changing an account's currency **is** a budget-alert trigger.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Updating an account runs the user's alert check once after the write succeeds, and only when the currency actually changed. Errors are caught and never fail the account update, the same as every other trigger.
- [x] The spec's "Triggers" list names account currency changes.
- [x] Spending from an account with no currency recorded counts toward the user's PLN budgets.
- [x] Unit test at the budgets server module seam: spending from an account with no currency counts toward a PLN budget and can make it over budget.
- [x] Unit test (red first): moving an over-budget amount of spending into a budget's currency, then running the check, sends exactly one budget alert. Wiring of the account path is verified in review, as agreed for ticket 05.
- [x] Existing accounts, budgets and budget-alert unit and E2E tests still pass.

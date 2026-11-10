# Finance Tracker

A personal finance tracker: users record transactions across their accounts, organise them into categories, and plan spending against monthly budgets.

## Budgets

**Budget**:
A monthly spending limit a user sets on one category, in one currency. It covers that category and all of its subcategories.
_Avoid_: Limit (that's one attribute of a budget), envelope, goal

**Limit**:
The amount a budget allows to be spent in one month.
_Avoid_: Cap, allowance, target

**Spending**:
The total of expense transactions (money going out) in a budget's category tree, in the budget's currency. Income and refunds never reduce it.
_Avoid_: Net spend, outflow, expenses (when meaning the budget figure)

**Budget month**:
The calendar month (UTC) a budget's spending is measured over. Every budget starts again from zero on the 1st; only the current month is tracked.
_Avoid_: Period, cycle, billing period

**Over budget**:
A budget whose spending this budget month is strictly greater than its limit. Spending exactly equal to the limit is not over.
_Avoid_: Exceeded, overspent, breached

**Budget alert**:
The email a user receives when a budget is found over budget, however it got there (new spending, or a limit set below what was already spent). A budget sends at most one per budget month, and only to a verified email address.
_Avoid_: Notification, warning, over-budget email

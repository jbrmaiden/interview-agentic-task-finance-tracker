# Budgets are scoped to one currency

Accounts can hold different currencies, and the app has no exchange rates. A budget therefore has its own currency, fixed at creation, and only counts spending from accounts in that currency; a user may hold one budget per (category, currency) pair. We rejected summing amounts across currencies (silently wrong for multi-currency users) and converting with FX rates (new external dependency and rate-staleness questions for a first version).

## Consequences

- "Groceries PLN" and "Groceries USD" are two budgets and count as two toward the free plan's Budget allowance.
- Changing a budget's currency means removing it and adding a new one.

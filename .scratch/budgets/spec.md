# Spec: Monthly category budgets

Status: ready-for-agent

Source: `TASK.md` (user story "Monthly category budgets"). Vocabulary: `GLOSSARY.md` (Budget, Limit, Spending, Budget month, Over budget, Budget alert). Decisions: `docs/adr/0001-budgets-are-per-currency.md`.

## Problem Statement

Users can see what they spent, per category and over time, but have no way to plan against it. There is nothing that says "I want to spend at most 1,000 PLN on Groceries this month", nothing that shows how much of that is left, and nothing that tells them when they have gone over. They can track spending but not control it.

For the business, budgets are also a planned Pro upsell: a feature free users value enough to hit a limit on.

## Solution

A new **Budgets** page in the main navigation. On it a user adds a budget for a category, in a currency, with a monthly limit. Each budget shows its limit, the spending so far this budget month, what's left, and an unmistakable over-budget state. A budget on a parent category covers all of its subcategories. Only spending counts: income and refunds never reduce it. Every budget starts again from zero on the 1st of each month.

When a budget is found over budget, the user receives one budget alert email for that budget that month, with the category, limit, spending, and overshoot, and a link back to the Budgets page.

Free-plan users can hold up to 3 budgets; Pro users unlimited. Hitting the free limit shows an upgrade hint. Budgets are user data: they appear in the data export and are destroyed by account deletion like everything else.

## User Stories

### Navigation and page

1. As a user, I want a "Budgets" entry in the main navigation, so that I can find budgets alongside Dashboard, Accounts, and Categories.
2. As a user, I want the Budgets page to list all my budgets for the current budget month, so that I can see my plan at a glance.
3. As a user, I want the page to say which month it is showing, so that I know the figures are for this month only.
4. As a new user with no budgets, I want an empty state explaining what budgets are and how to add one, so that I'm not looking at a blank page.
5. As a user with no accounts, I want the page to tell me to add an account first, so that I understand why I can't create a budget yet.
6. As a user, I want a loading indicator while budgets load, so that I don't mistake loading for "no budgets".

### Creating a budget

7. As a user, I want to add a budget by picking a category, a currency, and a monthly limit, so that I can plan my spending in that category.
8. As a user, I want the category picker to show my category tree with subcategories visibly nested, so that I can tell a parent from a child with the same name.
9. As a user, I want to be able to budget a parent category, so that one budget covers all its subcategories.
10. As a user, I want to be able to budget a subcategory on its own, so that I can control one narrow kind of spending.
11. As a user, I want to be able to budget both a parent and one of its children at the same time, so that I can control the whole and a part independently.
12. As a user, I want the currency picker to offer only currencies my accounts actually hold, so that I can't create a budget that can never have any spending.
13. As a user, I want the currency picker to default to the currency of my most-used account, so that the common case needs no extra click.
14. As a multi-currency user, I want a separate budget for the same category in each currency (e.g. Groceries PLN and Groceries USD), so that each budget's numbers are honest without exchange-rate conversion.
15. As a user, I want to be told when I try to add a second budget for the same category and currency, so that I edit the existing one instead of creating a confusing duplicate.
16. As a user, I want to enter the limit as a normal decimal amount (e.g. "1000" or "1000,50"), so that I can type it the way I think about money.
17. As a user, I want a clear validation message when the limit is empty, zero, negative, or not a number, so that I can correct it.
18. As a user, I want a budget created mid-month to count the whole month's spending, so that "spent this month" means what it says.

### Viewing progress

19. As a user, I want each budget to show its limit, so that I remember what I planned.
20. As a user, I want each budget to show the amount spent this budget month, so that I know where I stand.
21. As a user, I want each budget to show what's left, so that I know how much more I can spend.
22. As a user, I want a visual progress indicator per budget, so that I can scan many budgets quickly.
23. As a user, I want an over-budget budget to be shown unmistakably (distinct colour, an "Over budget" label, and the overshoot amount instead of a negative "left"), so that I can't miss it.
24. As a user, I want a budget whose spending exactly equals its limit to show "0 left" and not be flagged as over, so that hitting the limit exactly isn't treated as failure.
25. As a user, I want each budget to show its category's name and colour, so that it's recognisable at a glance.
26. As a user, I want each budget to show its currency, so that I know which accounts' spending it counts.
27. As a user, I want spending in every subcategory (at any depth) to count toward a parent category's budget, so that a parent budget really covers the whole tree.
28. As a user, I want only spending (money going out) to count, so that a salary or refund booked into a category doesn't make it look like I spent less.
29. As a user, I want only spending in the budget's currency to count, so that 100 USD and 100 PLN are never added together.
30. As a user, I want uncategorised transactions not to count toward any budget, so that budgets reflect only what I've categorised.
31. As a user, I want spending to update as soon as I add, edit, import, scan, or re-categorise transactions, so that the page is never stale.
32. As a user, I want transactions dated in earlier months not to affect this month's figures, so that each budget month stands alone.
33. As a user, I want every budget to start again from zero on the 1st of each month, so that each month is a fresh plan.

### Changing and removing

34. As a user, I want to change a budget's limit, so that I can adjust my plan as the month goes.
35. As a user, I want a budget's category and currency to be fixed after creation, so that editing is simple and the budget's identity is stable; I remove and re-add to change them.
36. As a user, I want to remove a budget after confirming, so that I don't delete one by accident.
37. As a user, I want removing a budget to leave my transactions and categories untouched, so that budgets are a planning layer and nothing more.

### Category changes

38. As a user, I want a budget to disappear when I delete its category (directly, or because I deleted the parent), so that I'm never left with a budget pointing at nothing.
39. As a user, I want a budget to follow its category when I move that category under a different parent, so that it always reflects the current tree.
40. As a user, I want a category rename or colour change to show on its budgets immediately, so that budgets always match my categories.

### Budget alerts

41. As a user, I want an email when a budget is over budget, so that I learn about it even when I'm not looking at the app.
42. As a user, I want at most one budget alert per budget per budget month, so that I'm informed, not spammed.
43. As a user, I want raising the limit after an alert not to cause a second alert that month, so that the one-per-month promise holds whatever I do.
44. As a user, I want a new budget month to allow a new alert, so that going over again next month is reported.
45. As a user, I want the alert to name the category and show the limit, the spending, and how much I'm over, with a link to the Budgets page, so that I can act on it immediately.
46. As a user, I want an alert when I set a limit below what I've already spent this month, so that I learn I'm over however I got there.
47. As a user, I want the alert to arrive promptly after the transaction change that pushed me over, so that it's timely.
48. As a user whose budget went over but whose alert email failed to send, I want a later check to retry it, so that a transient email outage doesn't lose the alert.
49. As a user with a parent and a child budget that both go over, I want an alert for each, so that each budget behaves independently.
50. As a user with an unverified email, I want no alert to be sent, so that my financial details never go to an address I haven't confirmed.
51. As a user who verifies my email mid-month while a budget is over, I want to still receive that month's alert, so that verifying late doesn't cost me the alert.
52. As a user, I want deleting a transaction never to trigger an alert, so that cleaning up data doesn't produce noise.
53. As a user, I want spending booked to an earlier month never to trigger an alert, so that only the current month alerts.

### Plans

54. As a free-plan user, I want to create up to 3 budgets, so that I can try the feature.
55. As a free-plan user at 3 budgets, I want a clear message that the free plan is limited to 3 budgets, with a link to upgrade, so that I know how to get more.
56. As a Pro user, I want unlimited budgets, so that I can plan every category.
57. As a user who downgraded from Pro with more than 3 budgets, I want all my existing budgets to keep working and alerting, so that downgrading never destroys or locks my data; only adding new ones is blocked.
58. As a user, I want the billing page's usage list to show how many budgets I'm using against my plan's allowance, so that I understand my plan.
59. As an operator, I want the free-plan budget allowance to be configurable, so that it can be tuned without a code change, the same way the account allowance is.

### Data rights and security

60. As a user, I want my budgets and budget alert history included in my data export, so that the export is complete.
61. As a user, I want my budgets and alert history permanently removed when my account is deleted, so that deletion is complete.
62. As a user, I want nobody else to be able to read, change, or remove my budgets, so that my financial plan is private.
63. As a user, I want an attempt to budget someone else's category to fail exactly as if the category didn't exist, so that other users' data can't be probed.
64. As an operator, I want logs about budgets and alerts to carry ids and counts only, never amounts or category names, so that logs stay free of financial content.

### Non-regression

65. As an existing user, I want every current feature (transactions, import, receipts, categorisation, categories, billing, compliance) to keep working exactly as before, so that budgets add value without breaking anything.

## Implementation Decisions

### Domain rules (settled in the grilling session)

- **Budget identity:** one budget per (user, category, currency). Category and currency are set at creation and never change; only the limit is editable.
- **Limit:** positive integer minor units, like all money in the app. Parsed from the user's decimal input with the existing money parser; no float arithmetic.
- **Budget month:** the current UTC calendar month, matching the existing scan-quota month. Transactions are matched by their calendar date falling in that month. Only the current month is computed or shown; there is no history.
- **Spending:** sum of the absolute values of negative-amount transactions whose category is the budget's category or any descendant (arbitrary depth), whose account's currency equals the budget's currency, and whose date is in the current budget month. Positive amounts (income, refunds) are ignored entirely, never netted. Uncategorised transactions never count. Receipt-item categories are ignored; only the transaction's own category matters.
- **Remaining:** limit minus spending, which can be negative; the UI shows a negative remaining as an "over by" amount.
- **Over budget:** spending strictly greater than limit.
- **Overlap:** parent and child budgets coexist and are computed independently.
- **Category tree changes:** spending is always computed live from the current category tree, so moving a category re-scopes budgets with no stored state to fix. Deleting a category (and its descendants) deletes every budget on any of those categories, together with their alert records, inside the existing category-deletion flow.
- **Currency choices:** the distinct currencies of the user's accounts. The default is the currency of the account with the most transactions, falling back to PLN on a tie or when there are no transactions. With no accounts, budget creation is unavailable.

### Budget alerts

- An alert check for a user evaluates every one of their budgets for the current budget month and sends an alert for each budget that is over budget and has not yet been alerted this budget month.
- **At most once, retried on failure:** a ledger records one row per (budget, budget month). The check claims the row first with an insert that does nothing on conflict, so two concurrent checks can never both send. If the email send then fails, the claim is removed so a later check retries. This mirrors the Stripe-event idempotency ledger already in the codebase.
- **Recipient:** only users with a verified email. A user without one is skipped without claiming, so a later check after verification still alerts.
- **Strictness:** changing the limit never resets the month's alert.
- **Triggers:** the check runs after every transaction change except deletion: manual create and edit, CSV import, a receipt scan that creates or updates a transaction, rule application and AI auto-categorisation, and transaction reassignment during category deletion. It also runs after a budget is created or its limit changes. The existing in-process hourly maintenance loop also runs the check for every user with at least one budget, as a backstop.
- **Failure isolation:** the check runs after the triggering write has succeeded; its errors are caught and logged, and never fail or roll back the user's action.
- **Content:** subject and body come from the i18n message catalogue (as the existing account emails do), naming the category, limit, spending, and overshoot, formatted with the existing money formatter and the budget's currency, plus a link built from the configured app base URL.
- **Logging:** ids and counts only.

### Modules

- **Budgets server module (new, deep):** the single owner of every budget rule. Public interface, roughly:
  - list a user's budgets with progress (category name/colour/parent, currency, limit, spending, remaining, over-budget flag) for the budget month of a given `now`, plus the plan allowance and usage, the available currencies, and the default currency;
  - create a budget (validates category ownership, currency availability, uniqueness, and the plan allowance);
  - change a budget's limit;
  - remove a budget (and its alert records);
  - remove all budgets for a set of category ids (used by category deletion);
  - run the alert check for one user at a given `now`;
  - run the alert check for every user with budgets (used by the maintenance loop).
  Time is injectable (`now`) for deterministic month boundaries, following the AI usage module's style. The database handle is injectable the way the billing module does it.
- **Budgets server functions (new, thin):** client-callable wrappers for list, create, change-limit, and remove, using zod input validation and session-based user resolution. Errors come back as `{ error, code }` with machine codes so the UI can localise them: `budget_limit_reached` (with `limit`), `budget_exists`, `category_not_found`, `currency_unavailable`, `budget_not_found`. After a create or limit change, they run the alert check.
- **Billing module (modified):** entitlements gain `maxBudgets` (a number for free, `null` meaning unlimited for Pro), read from a new `BILLING_FREE_MAX_BUDGETS` env setting defaulting to 3 and validated as a positive integer like the account allowance. A budget-allowance gate mirrors the account-allowance gate: it blocks only creation, never existing budgets. The billing status adds budget usage.
- **Environment config (modified):** the new allowance setting, documented in the example env file.
- **Transaction write paths (modified):** each path listed under Triggers calls the user's alert check once after its write. For bulk writes (import, re-categorise) it runs once per request, not per row.
- **Category deletion (modified):** removes budgets on every deleted category before the categories themselves are deleted (there are no cascades in this schema).
- **Compliance module (modified):** the export gains budgets and budget alerts in the JSON document and a budgets CSV (category name, currency, limit, created date). Account hard delete removes budget alerts, then budgets, before categories.
- **Ownership registry (modified):** budgets join the owned-entity table set.
- **Maintenance loop (modified):** the hourly loop also runs the all-users alert check, isolated from the compliance sweep so a failure in one doesn't skip the other.
- **Budgets page (new route under the authenticated layout):** follows the Accounts/Categories page pattern: TanStack Query with module-level query keys, mutations that invalidate, dialogs for add and edit, an alert dialog for remove, and all text through Paraglide messages. Includes an upgrade hint linking to the billing page when the allowance is reached.
- **Sidebar (modified):** a "Budgets" item placed after Categories.
- **Billing page (modified):** a "N of M budgets" / "N budgets (unlimited)" usage line.
- **Transaction-affecting query invalidation:** budget figures must refresh after transaction changes; the Budgets page re-fetches on mount (stale data is acceptable only until navigation).

### Schema changes (one new migration)

- **budgets:** id; user id (owner); category id; currency (3-letter code); limit in integer minor units; created and updated timestamps. Unique on (user, category, currency). Indexed by user.
- **budget alerts:** budget id; user id (owner, for export and deletion); budget month as a `YYYY-MM` string; sent timestamp. Unique on (budget, budget month).
- No changes to existing tables.

## Testing Decisions

### What makes a good test here

Tests assert observable behaviour through a public interface: what the budgets module returns, what emails get captured, what the export contains, what the user sees in the browser. They never assert on internal tables (the alert ledger is observed via captured emails, not by querying it), private helpers, or SQL shape. Expected values are hand-computed literals from the scenario, never recomputed the way the code computes them.

### Seams (agreed)

1. **Budgets server module public interface** (primary), unit-tested against the in-memory PGlite database with an explicit `now`. Covers:
   - spending includes descendants at any depth; excludes income and refunds; excludes other currencies, other months, other users, and uncategorised transactions;
   - remaining and over budget, including the exactly-at-limit case;
   - parent and child overlap computed independently;
   - re-parenting a category changes what a budget covers;
   - removing budgets for deleted categories;
   - uniqueness per (category, currency); ownership (a foreign category behaves like a missing one);
   - free allowance of 3, unlimited on Pro, existing budgets kept after a downgrade;
   - available currencies and the default-currency rule;
   - alert check: sends once per budget per month; doesn't resend after the limit is raised; sends again in a new month; sends when a limit is set below spending; skips unverified users without consuming the alert and sends after verification; retries after a failed send; parent and child alert independently.
2. **Playwright E2E through the UI**, required by project conventions. Covers:
   - the nav entry;
   - the empty state;
   - add, edit limit, and remove with confirmation;
   - validation errors (empty or zero limit, duplicate budget);
   - the spent, left, and over-budget display after creating transactions in the UI;
   - parent budget counting a subcategory transaction;
   - income not reducing spending;
   - the free limit message with the upgrade link, and Pro creating beyond 3 (via the test plan override);
   - billing page budget usage;
   - one end-to-end alert: a UI-created transaction pushes a budget over, the alert is read from the test email capture, and a second over-budget transaction produces no second email. Tests use unique category names per test, since tests run in parallel.
3. **Existing seams extended:**
   - the compliance unit tests' full-user seed gains a budget and a budget alert; export assertions check they appear (JSON and CSV), and hard-delete assertions check they're gone;
   - the billing unit tests' entitlement mapping includes `maxBudgets`;
   - the env unit tests cover the new allowance setting's default and validation.

Not separately tested: that each non-UI transaction write path (import, receipt scan, re-categorise, category reassignment) calls the alert check. Each is a single call to the seam-1 check, verified in review.

### Prior art

- Billing unit tests: entitlements, allowance gating, injected `now`, injected database handle.
- Compliance unit tests: full-user seed, export zip parsing, hard-delete assertions.
- Billing and categories E2E specs: the signed-in fixture, test plan override, accessible selectors, unique entities per test.
- Account lifecycle and auth E2E specs: reading captured emails via the test email route.

## Out of Scope

- Budget history and past-month views, a month picker, rollover of unspent amounts.
- Weekly, yearly, or custom-period budgets.
- Budgets across all categories or groups of categories; budgets per account.
- Currency conversion or multi-currency budgets (see ADR 0001).
- Receipt-item-level category attribution.
- "Approaching limit" warnings (e.g. at 80%), in-app notifications, or push notifications.
- Per-user timezone for the budget month.
- Budget summaries on the dashboard.
- Exposing budgets through the MCP endpoint.
- Opt-out settings for budget alerts.
- Locales other than English (only the English catalogue exists today; all new text still goes through the catalogue).

## Further Notes

- Near a month boundary, users far from UTC may briefly see the previous or next month's figures; accepted, matching the scan quota.
- If the email provider is down, an alert waits for the next check (the next transaction change or the hourly loop).
- Free users above 3 budgets after a downgrade keep full functionality on existing budgets; this mirrors the existing account-allowance policy.
- The interview requires demoing locally: in development the console email provider prints alerts to the terminal, which is the demo path for alerts.

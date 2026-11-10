# 03: Budgets page clean-up and spec drift

**What to build:** Smaller follow-ups from the full review, which make the budgets page sturdier and bring the docs in line with the code:
- When adding, editing or removing a budget fails for a network reason, rather than through a validation result, the user sees a translated error message instead of nothing.
- Each budget row is an accessible group named after its category. The budgets E2E tests find rows and their edit and remove actions by role and name, not by test id, the same way the account rows were done in ticket 05.
- The test proving that removing a budget leaves transactions and categories untouched checks through the public interface, not by querying tables directly.
- The misleading comment about how budget rows are nested is corrected, and the unused category-parent field on budget progress is removed.
- The spec's and ticket 01's default-currency text matches the deliberate behaviour: the currency of the account with the most transactions; on a tie or with no transactions, PLN if the user has it, otherwise their first currency.

Source: full two-axis review of the budgets feature (`275a04a..80f412a`); CLAUDE.md E2E selector and error-handling conventions; `.claude/skills/tdd/SKILL.md` (no side-channel tests).

**Blocked by:** 01 (Show the free-plan budget allowance before it's reached). Both change the budgets page and its E2E spec, so this ticket goes after 01 to avoid conflicts; it doesn't depend on 01's logic.

**Status:** resolved

- [x] A transport failure on add, edit or remove shows a translated error message, and the dialog stays usable. Covered by an E2E test that makes the request fail.
- [x] Budget rows are accessible groups named after their category. The budgets E2E spec has no test-id locators for rows or their edit and remove actions.
- [x] The "leaves transactions and categories untouched" test asserts through the public interface only.
- [x] The nesting comment describes the actual ordering, and the unused category-parent field is gone.
- [x] The default-currency wording in the budgets spec and ticket 01 matches the code.
- [x] Existing budgets unit and E2E tests still pass.

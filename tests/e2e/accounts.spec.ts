import { test, expect } from "./fixtures";

// Dated today (UTC) so the transaction is visible regardless of filters.
const TODAY = new Date().toISOString().slice(0, 10);

test.describe("Accounts", () => {
  test("the accounts list and delete dialog show the account's transaction count", async ({
    page,
    signedInUser: _user,
  }) => {
    await page.goto("/transactions");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Add Transaction" })
      .click();
    const modal = page.getByRole("dialog", { name: "New Transaction" });
    await modal.getByLabel("Date").fill(`${TODAY}T12:00`);
    await modal.getByLabel("Description").fill("Counted buy");
    await modal
      .getByRole("spinbutton", { name: "Amount", exact: true })
      .fill("12.00");
    await modal.getByLabel("Account").selectOption("Main (PLN)");
    await modal.getByRole("button", { name: "Create Transaction" }).click();
    await expect(modal).toBeHidden();

    await page.goto("/accounts");
    const row = page.getByRole("group", { name: "Main", exact: true });
    await expect(row.getByText("PLN", { exact: true })).toBeVisible();
    await expect(row.getByText("1", { exact: true })).toBeVisible();

    await page.getByTestId("delete-account").click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByText("This account has 1 transaction(s)", { exact: false }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "./fixtures";

// Transactions are dated today (UTC) so they fall in the current budget month.
const TODAY = new Date().toISOString().slice(0, 10);

async function createCategory(page: Page, name: string, parent?: string) {
  await page.goto("/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Name").fill(name);
  if (parent) await page.getByLabel("Parent Category").selectOption(parent);
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function createTransaction(
  page: Page,
  opts: { description: string; amount: string; category: string; income?: boolean },
) {
  await page.goto("/transactions");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Add Transaction" })
    .click();
  const modal = page.getByRole("dialog", { name: "New Transaction" });
  await modal.getByLabel("Date").fill(`${TODAY}T00:00`);
  await modal.getByLabel("Description").fill(opts.description);
  await modal
    .getByRole("spinbutton", { name: "Amount", exact: true })
    .fill(opts.amount);
  await modal.getByLabel("Account").selectOption("Main (PLN)");
  await modal.getByLabel("Category").selectOption(opts.category);
  if (opts.income) await modal.getByLabel("Income").check();
  await modal.getByRole("button", { name: "Create Transaction" }).click();
  await expect(modal).toBeHidden();
}

async function addBudget(page: Page, category: string, limit: string) {
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add Budget" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Budget" });
  await dialog.getByLabel("Category").selectOption(category);
  await dialog.getByLabel("Monthly limit").fill(limit);
  await dialog.getByRole("button", { name: "Create Budget" }).click();
  return dialog;
}

const row = (page: Page, category: string) =>
  page.getByTestId("budget-row").filter({ hasText: category });

test.describe("Budgets", () => {
  test("is reachable from the sidebar and shows the budget month and an empty state", async ({
    page,
    signedInUser: _u,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Budgets" }).click();
    await expect(page).toHaveURL("/budgets");
    await expect(
      page.getByRole("heading", { name: "Budgets", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No budgets yet")).toBeVisible();
    await expect(page.getByTestId("budget-month")).toContainText(
      TODAY.slice(0, 7),
    );
  });

  test("adds a budget and shows spent and left after spending", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Weekly Food");
    await createTransaction(page, {
      description: "Weekly shop",
      amount: "25.50",
      category: "Weekly Food",
    });
    const dialog = await addBudget(page, "Weekly Food", "100");
    await expect(dialog).toBeHidden();

    const r = row(page, "Weekly Food");
    await expect(r).toContainText("100.00 PLN");
    await expect(r).toContainText("25.50 PLN");
    await expect(r).toContainText("74.50 PLN left");
    await expect(
      r.getByRole("progressbar", { name: "Weekly Food budget progress" }),
    ).toHaveAttribute("aria-valuenow", "26");
  });

  test("a parent budget counts a subcategory transaction and nests in the picker", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Household Bills");
    await createCategory(page, "Power Costs", "Household Bills");
    await createTransaction(page, {
      description: "Electricity",
      amount: "40",
      category: "— Power Costs",
    });

    await page.goto("/budgets");
    await page.getByRole("button", { name: "Add Budget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Budget" });
    await expect(
      dialog.getByRole("option", { name: "— Power Costs" }),
    ).toBeAttached();
    await dialog.getByLabel("Category").selectOption("Household Bills");
    await dialog.getByLabel("Monthly limit").fill("100");
    await dialog.getByRole("button", { name: "Create Budget" }).click();

    await expect(row(page, "Household Bills")).toContainText("40.00 PLN");
    await expect(row(page, "Household Bills")).toContainText("60.00 PLN left");
  });

  test("income does not reduce spending", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Fun");
    await createTransaction(page, {
      description: "Cinema",
      amount: "30",
      category: "Fun",
    });
    await createTransaction(page, {
      description: "Refund",
      amount: "20",
      category: "Fun",
      income: true,
    });
    await addBudget(page, "Fun", "100");
    await expect(row(page, "Fun")).toContainText("30.00 PLN");
    await expect(row(page, "Fun")).toContainText("70.00 PLN left");
  });

  test("shows an unmistakable over-budget state", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Gadgets");
    await createTransaction(page, {
      description: "Headphones",
      amount: "120",
      category: "Gadgets",
    });
    await addBudget(page, "Gadgets", "100");
    const r = row(page, "Gadgets");
    await expect(r).toContainText("Over budget");
    await expect(r).toContainText("Over by 20.00 PLN");
    await expect(r).not.toContainText("left");
    await expect(r).toHaveAttribute("data-over-budget", "true");
  });

  test("exactly at the limit shows 0 left and is not over budget", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Snacks");
    await createTransaction(page, {
      description: "Snack",
      amount: "10",
      category: "Snacks",
    });
    await addBudget(page, "Snacks", "10");
    const r = row(page, "Snacks");
    await expect(r).toContainText("0.00 PLN left");
    await expect(r).not.toContainText("Over budget");
  });

  test("validates the form: no category, empty or zero limit, duplicate budget", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Travel");
    await page.goto("/budgets");
    await page.getByRole("button", { name: "Add Budget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Budget" });
    const submit = dialog.getByRole("button", { name: "Create Budget" });

    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText("Choose a category");

    await dialog.getByLabel("Category").selectOption("Travel");
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Enter a limit greater than zero",
    );

    await dialog.getByLabel("Monthly limit").fill("0");
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Enter a limit greater than zero",
    );

    await dialog.getByLabel("Monthly limit").fill("50");
    await submit.click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Add Budget" }).click();
    await dialog.getByLabel("Category").selectOption("Travel");
    await dialog.getByLabel("Monthly limit").fill("70");
    await submit.click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "A budget for this category and currency already exists.",
    );
  });

  test("currency picker defaults to the account currency", async ({
    page,
    signedInUser: _u,
  }) => {
    await page.goto("/budgets");
    await page.getByRole("button", { name: "Add Budget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Budget" });
    await expect(dialog.getByLabel("Currency")).toHaveValue("PLN");
    await expect(dialog.getByLabel("Currency").locator("option")).toHaveCount(1);
  });

  test("edits only the limit; category and currency are read-only", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Pets");
    await createTransaction(page, {
      description: "Kibble",
      amount: "30",
      category: "Pets",
    });
    await addBudget(page, "Pets", "100");
    await expect(row(page, "Pets")).toContainText("70.00 PLN left");

    await row(page, "Pets").getByTestId("edit-budget").click();
    const dialog = page.getByRole("dialog", { name: "Edit Budget" });
    await expect(dialog.getByLabel("Category")).toHaveValue("Pets");
    await expect(dialog.getByLabel("Category")).toBeDisabled();
    await expect(dialog.getByLabel("Currency")).toHaveValue("PLN");
    await expect(dialog.getByLabel("Currency")).toBeDisabled();
    await expect(dialog.getByLabel("Monthly limit")).toHaveValue("100.00");

    await dialog.getByLabel("Monthly limit").fill("0");
    await dialog.getByRole("button", { name: "Save Budget" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Enter a limit greater than zero",
    );

    await dialog.getByLabel("Monthly limit").fill("20,50");
    await dialog.getByRole("button", { name: "Save Budget" }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, "Pets")).toContainText("20.50 PLN");
    await expect(row(page, "Pets")).toContainText("Over by 9.50 PLN");
  });

  test("removes a budget only after confirming, leaving the category", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Hobbies");
    await addBudget(page, "Hobbies", "50");
    await expect(row(page, "Hobbies")).toBeVisible();

    await row(page, "Hobbies").getByTestId("remove-budget").click();
    const confirm = page.getByRole("alertdialog", { name: "Remove budget?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(row(page, "Hobbies")).toBeVisible();

    await row(page, "Hobbies").getByTestId("remove-budget").click();
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(row(page, "Hobbies")).toBeHidden();
    await expect(page.getByText("No budgets yet")).toBeVisible();

    await page.goto("/categories");
    await expect(
      page.getByText("Hobbies", { exact: true }).first(),
    ).toBeVisible();
  });

  test("deleting a budgeted category (and its subcategory) removes its budgets", async ({
    page,
    signedInUser: _u,
  }) => {
    await createCategory(page, "Garden");
    await createCategory(page, "Seeds", "Garden");
    await createCategory(page, "Keepers");
    await addBudget(page, "Garden", "100");
    await addBudget(page, "— Seeds", "20");
    await addBudget(page, "Keepers", "30");
    await expect(page.getByTestId("budget-row")).toHaveCount(3);

    await page.goto("/categories");
    const parentRow = page.getByRole("row").filter({ hasText: "Garden" });
    await parentRow.getByTestId("delete-category").click();
    await page
      .getByRole("alertdialog", { name: "Delete Category" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.locator("main").getByText("Garden")).toBeHidden();

    await page.goto("/budgets");
    await expect(row(page, "Keepers")).toBeVisible();
    await expect(page.getByTestId("budget-row")).toHaveCount(1);
  });
});

test.describe("Budgets free-plan allowance", () => {
  async function setup(page: Page, suffix: string, n: number) {
    const names = Array.from({ length: n }, (_, i) => `Cap${i}-${suffix}`);
    for (const name of names) await createCategory(page, name);
    return names;
  }

  test("free users are blocked on the 4th budget with an upgrade link", async ({
    page,
    signedInUser,
  }) => {
    const names = await setup(page, signedInUser.username, 4);
    for (const name of names.slice(0, 3)) {
      const dialog = await addBudget(page, name, "100");
      await expect(dialog).toBeHidden();
      await expect(row(page, name)).toBeVisible();
    }

    const dialog = await addBudget(page, names[3], "100");
    await expect(
      dialog.getByText(/free plan is limited to 3 budgets/i),
    ).toBeVisible();
    await dialog.getByRole("link", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL("/billing");
    await expect(page.getByTestId("billing-budgets-usage")).toHaveText(
      "3 of 3 budgets",
    );
  });

  test("pro users can create more than 3 budgets", async ({
    page,
    signedInUser,
  }) => {
    await page.request.post("/test-set-plan?plan=pro");
    const names = await setup(page, signedInUser.username, 4);
    for (const name of names) {
      const dialog = await addBudget(page, name, "100");
      await expect(dialog).toBeHidden();
      await expect(row(page, name)).toBeVisible();
    }
    await page.goto("/billing");
    await expect(page.getByTestId("billing-budgets-usage")).toHaveText(
      "4 budgets (unlimited)",
    );
  });

  test("downgraded users keep every budget but cannot add more", async ({
    page,
    signedInUser,
  }) => {
    await page.request.post("/test-set-plan?plan=pro");
    const names = await setup(page, signedInUser.username, 5);
    for (const name of names.slice(0, 4)) {
      const dialog = await addBudget(page, name, "100");
      await expect(dialog).toBeHidden();
    }
    await page.request.post("/test-set-plan?plan=free&status=canceled");
    await page.goto("/budgets");
    for (const name of names.slice(0, 4)) {
      await expect(row(page, name)).toBeVisible();
    }
    const dialog = await addBudget(page, names[4], "100");
    await expect(
      dialog.getByText(/free plan is limited to 3 budgets/i),
    ).toBeVisible();
    await page.goto("/billing");
    await expect(page.getByTestId("billing-budgets-usage")).toHaveText(
      "4 of 3 budgets",
    );
  });
});

test.describe("Budgets without accounts", () => {
  async function deleteMainAccount(page: Page) {
    await page.goto("/accounts");
    await page.getByTestId("delete-account").first().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByTestId("delete-account")).toHaveCount(0);
  }

  const msg = JSON.parse(
    readFileSync(join(process.cwd(), "messages/en.json"), "utf8"),
  ) as Record<string, string>;

  test("with no accounts, budgets asks to add an account first and cannot add a budget", async ({
    page,
    signedInUser: _u,
  }) => {
    await deleteMainAccount(page);
    await page.goto("/budgets");

    await expect(
      page.getByRole("heading", { name: msg.budgets_need_account }),
    ).toBeVisible();
    await expect(page.getByText(msg.budgets_need_account_desc)).toBeVisible();
    await expect(
      page.getByRole("link", { name: msg.budgets_go_to_accounts }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Budget" })).toHaveCount(
      0,
    );
  });

  test("adding an account makes budgets available in that currency", async ({
    page,
    signedInUser: _u,
  }) => {
    await deleteMainAccount(page);
    await page.goto("/budgets");
    await page
      .getByRole("link", { name: msg.budgets_go_to_accounts })
      .click();
    await expect(page).toHaveURL("/accounts");

    await page.getByRole("button", { name: "Add Account" }).click();
    await page.getByLabel("Account Name").fill("Dollar Wallet");
    await page.getByLabel("Currency").fill("USD");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Dollar Wallet")).toBeVisible();

    await page.goto("/budgets");
    await expect(
      page.getByRole("heading", { name: msg.budgets_need_account }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Add Budget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Budget" });
    await expect(dialog.getByLabel("Currency")).toHaveValue("USD");
    await expect(dialog.getByLabel("Currency").locator("option")).toHaveCount(1);
  });
});

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

import { test, expect, type Page } from "./fixtures";

// Transactions are dated today (UTC) so they fall in the current budget month.
const TODAY = new Date().toISOString().slice(0, 10);

async function createCategory(page: Page, name: string) {
  await page.goto("/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function addBudget(page: Page, category: string, limit: string) {
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add Budget" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Budget" });
  await dialog.getByLabel("Category").selectOption(category);
  await dialog.getByLabel("Monthly limit").fill(limit);
  await dialog.getByRole("button", { name: "Create Budget" }).click();
  await expect(dialog).toBeHidden();
}

async function createTransaction(
  page: Page,
  opts: { description: string; amount: string; category: string },
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
  await modal.getByRole("button", { name: "Create Transaction" }).click();
  await expect(modal).toBeHidden();
}

async function alertEmails(page: Page, username: string, category: string) {
  const res = await page.request.get(
    `/test-emails?to=${encodeURIComponent(`${username}@example.com`)}`,
  );
  const { emails } = (await res.json()) as {
    emails: Array<{ subject: string; text: string }>;
  };
  return emails.filter((e) => e.subject.includes(category));
}

test.describe("Budget alert emails", () => {
  test("a transaction that pushes a budget over sends exactly one alert", async ({
    page,
    signedInUser,
  }) => {
    const category = `Alert Cat ${signedInUser.username}`;
    await createCategory(page, category);
    await addBudget(page, category, "100");

    await createTransaction(page, {
      description: "Small buy",
      amount: "60.00",
      category,
    });
    expect(await alertEmails(page, signedInUser.username, category)).toHaveLength(0);

    await createTransaction(page, {
      description: "Big buy",
      amount: "60.00",
      category,
    });
    await expect
      .poll(
        async () =>
          (await alertEmails(page, signedInUser.username, category)).length,
      )
      .toBe(1);
    const [alert] = await alertEmails(page, signedInUser.username, category);
    expect(alert!.text).toContain(category);
    expect(alert!.text).toContain("100.00 PLN");
    expect(alert!.text).toContain("120.00 PLN");
    expect(alert!.text).toContain("20.00 PLN");
    expect(alert!.text).toContain("/budgets");

    await createTransaction(page, {
      description: "Another buy",
      amount: "10.00",
      category,
    });
    expect(await alertEmails(page, signedInUser.username, category)).toHaveLength(1);
  });
});

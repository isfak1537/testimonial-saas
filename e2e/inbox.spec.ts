import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createSpaceViaUi, signUp, uniqueSlug } from "./helpers";

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

/** A visitor (no session) submits through the public form. */
async function submit(browser: Browser, slug: string, name: string, content: string) {
  const visitor = await browser.newContext();
  const form = await visitor.newPage();
  await form.goto(`/c/${slug}`);
  await form.getByLabel("Your name").fill(name);
  await form.getByRole("radio", { name: "5 out of 5" }).check();
  await form.getByLabel("Your testimonial").fill(content);
  await form.getByLabel(/^I agree that/).check();
  await form.getByRole("button", { name: "Send testimonial" }).click();
  await expect(form.getByTestId("collect-thanks")).toBeVisible();
  await visitor.close();
}

test.describe("Inbox", () => {
  test("approve, publish, withdraw consent and delete; user text stays text", async ({
    page,
    browser,
  }) => {
    await signUp(page);
    const slug = uniqueSlug();
    await createSpaceViaUi(page, "Acme", slug);
    await submit(browser, slug, "Grace", "<b>Brilliant</b> service");
    await submit(browser, slug, "Alan", "Solid work");

    await page.getByRole("link", { name: "Inbox" }).click();
    const list = page.getByRole("list", { name: "Testimonials" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    // Markup is shown literally, never interpreted.
    await expect(list.getByText("<b>Brilliant</b> service")).toBeVisible();
    await expectNoBlockingViolations(page);

    await list.getByRole("button", { name: /Grace/ }).click();
    const detail = page.getByRole("region", { name: "Grace" });
    await expect(detail.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Approve" }).click();
    await expect(detail.getByText("approved", { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "Publish" }).click();
    await expect(detail.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await expectNoBlockingViolations(page);

    await page.getByLabel("Published").selectOption("true");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await page.getByLabel("Published").selectOption("");
    await page.getByLabel("Status").selectOption("PENDING");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("button", { name: /Alan/ })).toBeVisible();
    await page.getByLabel("Status").selectOption("");

    await list.getByRole("button", { name: /Grace/ }).click();
    await detail.getByRole("button", { name: "Withdraw consent" }).click();
    const dialog = page.getByRole("dialog", { name: "Withdraw consent?" });
    await expectNoBlockingViolations(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await detail.getByRole("button", { name: "Withdraw consent" }).click();
    await dialog.getByRole("button", { name: "Withdraw consent" }).click();
    await expect(detail.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Unpublish" })).toHaveCount(0);

    await detail.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete this testimonial?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("button", { name: /Grace/ })).toHaveCount(0);
  });

  test("empty Inbox has no accessibility violations", async ({ page }) => {
    await signUp(page);
    await createSpaceViaUi(page, "Quiet", uniqueSlug());
    await page.getByRole("link", { name: "Inbox" }).click();
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await expectNoBlockingViolations(page);
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

test.describe("Public collection form", () => {
  test("owner copies the link; a visitor submits and sees the thank-you state", async ({
    page,
    browser,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signUp(page);
    const slug = uniqueSlug();
    await createSpaceViaUi(page, "Acme", slug);

    await page.getByRole("link", { name: "Collection" }).click();
    const link = `${new URL(page.url()).origin}/c/${slug}`;
    await expect(page.getByLabel("Collection link")).toHaveValue(link);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied." })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await expectNoBlockingViolations(page);

    // A visitor has no session: use a fresh context.
    const visitor = await browser.newContext();
    const form = await visitor.newPage();
    await form.goto(`/c/${slug}`);
    await expect(form.getByRole("heading", { level: 1 })).toHaveText("Tell us about Acme");
    await expect(form.getByText("I agree that Acme may publish")).toBeVisible();
    await expectNoBlockingViolations(form);

    // Honeypot: neutral name, no autofill, unreachable by keyboard and hidden from assistive tech.
    const honeypot = form.locator('input[name="leaveBlank"]');
    await expect(honeypot).toHaveAttribute("autocomplete", "off");
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
    await expect(form.locator('.hp-field[aria-hidden="true"]')).toHaveCount(1);

    await form.getByLabel("Your name").fill("Grace");
    await form.getByRole("radio", { name: "5 out of 5" }).check();
    await form.getByLabel("Your testimonial").fill("<b>Brilliant</b> service, thank you!");
    await form.getByLabel("I agree that Acme").check();
    await form.getByRole("button", { name: "Send testimonial" }).click();

    await expect(form.getByTestId("collect-thanks")).toBeVisible();
    await expect(form.getByRole("heading", { name: "Thank you!" })).toBeVisible();
    await expectNoBlockingViolations(form);
    await visitor.close();
  });

  test("invalid input shows field errors and focuses the first one", async ({ page, browser }) => {
    await signUp(page);
    const slug = uniqueSlug();
    await createSpaceViaUi(page, "Acme", slug);

    const visitor = await browser.newContext();
    const form = await visitor.newPage();
    await form.goto(`/c/${slug}`);
    await form.getByRole("button", { name: "Send testimonial" }).click();
    await expect(form.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("Your name")).toBeFocused();
    await expect(form.getByLabel("Your testimonial")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("I agree that Acme")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByTestId("collect-thanks")).toHaveCount(0);
    await expectNoBlockingViolations(form);
    await visitor.close();
  });

  test("unknown and archived slugs show a not-available page", async ({ page, browser }) => {
    await signUp(page);
    const slug = uniqueSlug();
    await createSpaceViaUi(page, "Soon archived", slug);
    await page.getByRole("button", { name: "Archive Space" }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect(page).toHaveURL(/\/app$/);

    const visitor = await browser.newContext();
    const form = await visitor.newPage();
    for (const target of [slug, "no-such-space"]) {
      await form.goto(`/c/${target}`);
      await expect(form.getByRole("heading", { name: "This form is not available" })).toBeVisible();
      await expectNoBlockingViolations(form);
    }
    await visitor.close();
  });
});

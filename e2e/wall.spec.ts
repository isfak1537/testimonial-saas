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

test.describe("Public Wall", () => {
  test("golden path: submit, approve, publish, appear, unpublish, disappear", async ({
    page,
    browser,
  }) => {
    await signUp(page);
    const slug = uniqueSlug();
    await createSpaceViaUi(page, "Acme", slug);
    await submit(browser, slug, "Grace", "<img src=x onerror=alert(1)> Brilliant service");

    await page.getByRole("link", { name: "Inbox" }).click();
    const list = page.getByRole("list", { name: "Testimonials" });
    await list.getByRole("button", { name: /Grace/ }).click();
    const detail = page.getByRole("region", { name: "Grace" });
    await detail.getByRole("button", { name: "Approve" }).click();
    await expect(detail.getByText("approved", { exact: true })).toBeVisible();

    // Approved but not yet published: not on the Wall.
    const visitor = await browser.newContext();
    const wall = await visitor.newPage();
    const dialogs: string[] = [];
    wall.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await wall.goto(`/w/${slug}`);
    await expect(wall.getByTestId("wall-empty")).toBeVisible();

    await detail.getByRole("button", { name: "Publish" }).click();
    await expect(detail.getByRole("button", { name: "Unpublish" })).toBeVisible();

    // Wall tab links to the public page.
    await page.getByRole("link", { name: "Wall" }).click();
    const open = page.getByRole("link", { name: "Open public page" });
    await expect(open).toHaveAttribute("href", `/w/${slug}`);
    await expectNoBlockingViolations(page);

    await wall.reload();
    const card = wall.getByRole("list", { name: "Testimonials" }).getByRole("listitem");
    await expect(card).toHaveCount(1);
    // The payload is visible text, not an element.
    await expect(card.getByText("<img src=x onerror=alert(1)> Brilliant service")).toBeVisible();
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByText("Grace")).toBeVisible();
    await expect(card.getByRole("img", { name: "5 out of 5" })).toBeVisible();
    await expect(wall.getByRole("heading", { name: "Acme" })).toBeVisible();
    await expectNoBlockingViolations(wall);
    expect(dialogs).toEqual([]);

    // The raw public JSON has no private fields.
    const json = await wall.request.get(`/api/v1/public/spaces/${slug}/wall`);
    expect(json.headers()["access-control-allow-origin"]).toBe("*");
    expect(Object.keys((await json.json()).testimonials[0]).sort()).toEqual([
      "authorName",
      "authorTitle",
      "content",
      "id",
      "publishedAt",
      "rating",
    ]);

    // Unpublish: gone on refresh.
    await page.getByRole("link", { name: "Inbox" }).click();
    await page
      .getByRole("list", { name: "Testimonials" })
      .getByRole("button", { name: /Grace/ })
      .click();
    await page
      .getByRole("region", { name: "Grace" })
      .getByRole("button", { name: "Unpublish" })
      .click();
    await expect(
      page.getByRole("region", { name: "Grace" }).getByRole("button", { name: "Publish" }),
    ).toBeVisible();
    await wall.reload();
    await expect(wall.getByTestId("wall-empty")).toBeVisible();
    await expect(wall.getByText("Brilliant service")).toHaveCount(0);
    await visitor.close();
  });

  test("an unknown slug shows the not-available page", async ({ page }) => {
    await page.goto("/w/no-such-wall");
    await expect(page.getByRole("heading", { name: "This Wall is not available" })).toBeVisible();
    await expectNoBlockingViolations(page);
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signUp, uniqueEmail } from "./helpers";

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

test.describe("sign-up and log-in", () => {
  test("sign up lands on the empty Spaces list", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("heading", { name: "Spaces", level: 1 })).toBeVisible();
    await expect(page.getByTestId("spaces-empty")).toBeVisible();
  });

  test("keyboard-only sign-up works and focus is visible", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Display name").focus();
    await page.keyboard.type("Keyboard User");
    await page.keyboard.press("Tab");
    await page.keyboard.type(uniqueEmail("kb"));
    await page.keyboard.press("Tab");
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Create account" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("forms set autocomplete hints", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "new-password");
    await page.goto("/login");
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  test("field errors show next to the right inputs and focus moves to the first", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel("Display name").fill("Ada");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Display name")).not.toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();
    const emailError = await email.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${emailError}"]`)).toContainText(/email/i);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("duplicate email shows under the email input", async ({ page, browser }) => {
    const email = await signUp(page);
    const other = await browser.newPage();
    await other.goto("/signup");
    await other.getByLabel("Display name").fill("Again");
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Password").fill(PASSWORD);
    await other.getByRole("button", { name: "Create account" }).click();
    await expect(other.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(other).toHaveURL(/\/signup$/);
    await other.close();
  });

  test("bad credentials show a banner and focus it", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("nobody"));
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toBeFocused();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("log out, then log in again", async ({ page }) => {
    const email = await signUp(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("visiting /login while signed in goes to /app, never a ?next= target", async ({ page }) => {
    await signUp(page);
    await page.goto("/login?next=https://evil.example");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("an ended session sends the user to /login with a message", async ({ page, context }) => {
    await signUp(page);
    await page.getByRole("link", { name: "Create your first Space" }).click();
    await context.clearCookies();
    await page.getByLabel("Name", { exact: true }).fill("Gone");
    await page.getByLabel("Slug").fill("gone-space");
    await page.getByLabel("Headline").fill("Headline");
    await page.getByRole("button", { name: "Create Space" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("status")).toContainText("session has expired");
  });

  test("/app/** redirects to /login when logged out", async ({ page }) => {
    for (const path of ["/app", "/app/spaces/new", "/app/spaces/abc/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  for (const path of ["/login", "/signup"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoBlockingViolations(page);
    });
  }
});

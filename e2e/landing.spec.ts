import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 360, height: 740 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const SECTIONS = [
  "landing-hero",
  "landing-features",
  "landing-how-it-works",
  "landing-preview",
  "landing-footer",
] as const;

/** Records every script URL and every request that leaves the app's origin. */
function trackRequests(page: Page, appOrigin: string) {
  const scripts: string[] = [];
  const thirdParty: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:")) return;
    if (new URL(url).origin !== appOrigin) thirdParty.push(url);
    if (request.resourceType() === "script") scripts.push(url);
  });
  return { scripts, thirdParty };
}

for (const viewport of VIEWPORTS) {
  test.describe(`landing page at ${viewport.width}x${viewport.height} (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders all sections without layout or content problems", async ({ page, baseURL }) => {
      const requests = trackRequests(page, new URL(baseURL!).origin);
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);

      for (const testId of SECTIONS) {
        await expect(page.getByTestId(testId)).toBeAttached();
      }
      await expect(page.getByTestId("dev-banner")).toContainText("Development preview");

      // Hero heading and primary call to action are visible without scrolling.
      const hero = page.getByTestId("landing-hero");
      await expect(hero.getByRole("heading", { level: 1 })).toBeInViewport();
      await expect(hero.getByRole("link", { name: "Get started" })).toBeInViewport();

      // No horizontal scrolling.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // Calls to action point at the auth routes.
      await expect(hero.getByRole("link", { name: "Get started" })).toHaveAttribute(
        "href",
        "/signup",
      );
      await expect(hero.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");

      // Content rules: no testimonials or quotes, no pricing or checkout.
      await expect(page.locator("blockquote, q, [itemtype*='Review']")).toHaveCount(0);
      await expect(page.locator("a[href*='pricing'], a[href*='checkout']")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/pricing|checkout/i);

      // Only the landing surface is loaded; dashboard, form and Wall code stay out.
      expect(requests.scripts.some((url) => /LandingPage-/.test(url))).toBe(true);
      expect(
        requests.scripts.filter((url) => /(AppSurface|CollectSurface|WallSurface)-/.test(url)),
      ).toEqual([]);

      // No third-party requests (fonts, analytics, CDNs).
      expect(requests.thirdParty).toEqual([]);
    });

    test("has no serious or critical accessibility violations", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("landing-hero")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  });
}

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("opens, moves focus into the menu and closes with Escape using only the keyboard", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Main" });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Features" })).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link", { name: "Features" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await expect(nav.getByRole("link", { name: "Features" })).toBeHidden();
  });
});

test.describe("desktop navigation", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows links inline without a menu button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Get started" })).toBeVisible();
  });
});

test.describe("surface routing", () => {
  const SURFACES = [
    { path: "/login", testId: "surface-login", status: 200 },
    { path: "/signup", testId: "surface-signup", status: 200 },
    { path: "/app", testId: "surface-login", status: 200 }, // logged out: redirected to /login
    { path: "/c/x", testId: "surface-collect", status: 200 },
    { path: "/w/x", testId: "surface-wall", status: 200 },
    { path: "/does-not-exist", testId: "surface-not-found", status: 404 },
  ] as const;

  for (const surface of SURFACES) {
    test(`${surface.path} renders its own surface`, async ({ page }) => {
      const response = await page.goto(surface.path);
      expect(response?.status()).toBe(surface.status);
      await expect(page.getByTestId(surface.testId)).toBeVisible();
      await expect(page.getByTestId("landing-hero")).toHaveCount(0);
    });
  }

  test("hero call to action navigates to sign-up", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-hero").getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId("surface-signup")).toBeVisible();
  });
});

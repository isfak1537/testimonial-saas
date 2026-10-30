import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiPost, createSpaceViaUi, signUp, uniqueSlug } from "./helpers";

test.describe("Spaces", () => {
  test("sign up → empty list → create a Space → it is listed", async ({ page }) => {
    await signUp(page);
    await expect(page.getByTestId("spaces-empty")).toBeVisible();
    await page.getByRole("link", { name: "Create your first Space" }).click();

    const slug = uniqueSlug();
    await page.getByLabel("Name", { exact: true }).fill("My Product");
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Headline").fill("Share your experience");
    await page.getByRole("button", { name: "Add prompt" }).click();
    await page.getByLabel("Prompt 1").fill("What did you like most?");
    await page.getByRole("button", { name: "Create Space" }).click();

    await expect(page).toHaveURL(/\/app\/spaces\/[^/]+\/settings$/);
    await expect(page.getByRole("heading", { name: "My Product", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Back to Spaces" }).click();
    await expect(page.getByRole("link", { name: "My Product" })).toBeVisible();
    await expect(page.getByText(`/${slug}`)).toBeVisible();
  });

  test("slug and name errors show next to their inputs", async ({ page }) => {
    await signUp(page);
    const taken = uniqueSlug();
    await createSpaceViaUi(page, "First", taken);

    await page.goto("/app/spaces/new");
    await page.getByLabel("Name", { exact: true }).fill("Second");
    await page.getByLabel("Slug").fill("admin");
    await page.getByLabel("Headline").fill("Headline");
    await page.getByRole("button", { name: "Create Space" }).click();
    await expect(page.getByLabel("Slug")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Slug")).toBeFocused();
    await expect(page.getByLabel("Name", { exact: true })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await page.getByLabel("Slug").fill(taken);
    await page.getByRole("button", { name: "Create Space" }).click();
    await expect(page.getByLabel("Slug")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/spaces\/new$/);
  });

  test("tabs render and Settings is the default", async ({ page }) => {
    await signUp(page);
    await createSpaceViaUi(page, "Tabs", uniqueSlug());
    const nav = page.getByRole("navigation", { name: "Space sections" });
    for (const tab of ["Inbox", "Collection", "Wall", "Embed", "Settings"]) {
      await expect(nav.getByRole("link", { name: tab })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await nav.getByRole("link", { name: "Inbox" }).click();
    await expect(page.getByRole("heading", { name: "Inbox", level: 2 })).toBeVisible();
  });

  test("edit a Space, warn on slug change, then archive it", async ({ page }) => {
    await signUp(page);
    await createSpaceViaUi(page, "Editable", uniqueSlug());

    await page.getByLabel("Name", { exact: true }).fill("Renamed");
    await page.getByLabel("Slug").fill(uniqueSlug("new"));
    await expect(page.getByText("Old links will stop working")).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Renamed", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Archive Space" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Confirm archive" })).toHaveCount(0);

    await page.getByRole("button", { name: "Archive Space" }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("link", { name: "Renamed" })).toHaveCount(0);
  });

  test("an archived Space is read-only", async ({ page }) => {
    await signUp(page);
    const spaceId = await createSpaceViaUi(page, "Soon archived", uniqueSlug());
    await page.getByRole("button", { name: "Archive Space" }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto(`/app/spaces/${spaceId}/settings`);
    await expect(page.getByText("archived and read-only")).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });

  test("Load more appends the next page", async ({ page }) => {
    await signUp(page);
    const me = await (await page.request.get("/api/v1/auth/me")).json();
    const workspaceId = me.workspace.id as string;
    for (let i = 0; i < 21; i += 1) {
      const response = await apiPost(page, `/workspaces/${workspaceId}/spaces`, {
        name: `Bulk ${i}`,
        slug: uniqueSlug("bulk"),
        headline: "Headline",
      });
      expect(response.status()).toBe(201);
    }
    await page.goto("/app");
    const items = page.getByRole("list", { name: "Your Spaces" }).getByRole("listitem");
    await expect(items).toHaveCount(20);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(items).toHaveCount(21);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  });

  test("another user cannot open someone else's Space", async ({ page, browser }) => {
    await signUp(page);
    const spaceId = await createSpaceViaUi(page, "Private to A", uniqueSlug());

    const other = await browser.newPage();
    await signUp(other);
    await other.goto(`/app/spaces/${spaceId}/settings`);
    await expect(other.getByRole("heading", { name: "Space not found" })).toBeVisible();
    await expect(other.getByText("Private to A")).toHaveCount(0);
    // Archive is rejected too, with B's own workspace and with A's workspace id.
    const bWorkspace = (await (await other.request.get("/api/v1/auth/me")).json()).workspace.id;
    const aWorkspace = (await (await page.request.get("/api/v1/auth/me")).json()).workspace.id;
    for (const workspaceId of [bWorkspace, aWorkspace]) {
      const response = await apiPost(other, `/workspaces/${workspaceId}/spaces/${spaceId}/archive`);
      expect(response.status()).toBe(404);
    }
    await other.close();

    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Private to A");
  });

  test("dashboard pages have no serious accessibility violations", async ({ page }) => {
    await signUp(page);
    for (const path of ["/app", "/app/spaces/new"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(blocking.map((violation) => `${path} ${violation.id}`)).toEqual([]);
    }
    await createSpaceViaUi(page, "Axe", uniqueSlug());
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);
  });
});

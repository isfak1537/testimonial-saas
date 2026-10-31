import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery";

let counter = 0;
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${counter}@example.com`;
}

export async function signUp(page: Page, email = uniqueEmail(), displayName = "Ada Tester") {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return email;
}

export async function createSpaceViaUi(page: Page, name: string, slug: string) {
  await page.goto("/app/spaces/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Headline").fill(`Tell us about ${name}`);
  await page.getByRole("button", { name: "Create Space" }).click();
  await expect(page).toHaveURL(/\/app\/spaces\/[^/]+\/settings$/);
  return page.url().split("/spaces/")[1]!.split("/")[0]!;
}

/** Unique, valid, non-reserved slug. */
export function uniqueSlug(prefix = "sp"): string {
  counter += 1;
  // The counter restarts in every Playwright worker, so the worker's pid keeps slugs generated in
  // the same millisecond by parallel workers apart (uniqueEmail does the same).
  return `${prefix}-${Date.now().toString(36)}-${process.pid.toString(36)}-${counter}`;
}

/** Direct API calls share the page's cookies; writes must carry the app's Origin. */
export async function apiPost(page: Page, path: string, data?: unknown) {
  const origin = new URL(page.url()).origin;
  return page.request.post(`/api/v1${path}`, { headers: { Origin: origin }, data });
}

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { apiPost, createSpaceViaUi, signUp, uniqueSlug } from "./helpers";

const XSS = '<img src=x onerror="window.__xss=1"> <script>window.__xss=1</script> Brilliant';
const EMAIL = "secret.author@example.com";
const WIDGET_PATH = "/embed/widget.v1.js";

// A third-party site on another origin (127.0.0.1:<random port>), with CSS and JS that try to
// break whatever they can reach.
const HOSTILE_CSS = `
  * { color: red !important; font-family: "Comic Sans MS", cursive !important; font-size: 30px !important;
      letter-spacing: 9px !important; text-transform: uppercase !important; line-height: 3 !important; }
  div, ul, li, span, p { border: 3px solid red !important; background: yellow !important; }
`;
const HOSTILE_JS = `
  window.TestimonialSaaSWidget = "host-owned";
  window.onerror = function () { window.__hostErrors = (window.__hostErrors || 0) + 1; };
  setTimeout(function () { throw new Error("host script error"); }, 0);
`;

type Page_ = (scriptSrc: string) => string;
const pages = new Map<string, Page_>();
let server: Server;
let hostOrigin: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    const build = pages.get(path);
    if (!build) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const url = new URL(req.url ?? "/", "http://host.invalid");
    const src = url.searchParams.get("src") ?? "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const html = build(src);
    // Streamed in two chunks, so the parser is still in "loading" when an async head script runs.
    const marker = "<!--SPLIT-->";
    const at = html.indexOf(marker);
    if (at === -1) {
      res.end(html);
      return;
    }
    res.write(html.slice(0, at));
    setTimeout(() => res.end(html.slice(at)), 400);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  hostOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface Seeded {
  slug: string;
  workspaceId: string;
  spaceId: string;
}

async function newSpace(page: Page): Promise<Seeded> {
  await signUp(page);
  const slug = uniqueSlug("wd");
  const spaceId = await createSpaceViaUi(page, "Acme", slug);
  const me = await (await page.request.get("/api/v1/auth/me")).json();
  return { slug, workspaceId: me.workspace.id as string, spaceId };
}

async function submitAndPublish(
  page: Page,
  s: Seeded,
  name: string,
  content: string,
  publish = true,
) {
  const sent = await apiPost(page, `/public/spaces/${s.slug}/testimonials`, {
    authorName: name,
    authorTitle: "CTO",
    authorEmail: EMAIL,
    rating: 5,
    content,
    consent: true,
    consentVersion: "2026-10-30.v1",
  });
  expect(sent.status()).toBe(201);
  const base = `/workspaces/${s.workspaceId}/spaces/${s.spaceId}/testimonials`;
  const list = await (await page.request.get(`/api/v1${base}?limit=50`)).json();
  const row = (list.items as { id: string; authorName: string }[]).find(
    (t) => t.authorName === name,
  );
  expect(row).toBeDefined();
  if (publish) {
    expect((await apiPost(page, `${base}/${row!.id}/approve`, {})).status()).toBe(200);
    expect((await apiPost(page, `${base}/${row!.id}/publish`, {})).status()).toBe(200);
  }
}

function cleanPage(scriptSrc: string, attrs = 'data-space="SLUG"') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Customer site</title></head>
<body><main><h1>Our customers</h1><div data-testimonial-widget ${attrs}></div></main>
<script async src="${scriptSrc}"></script></body></html>`;
}

function hostile(attrs: string, scriptSrc: string, extra = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hostile</title>
<style>${HOSTILE_CSS}</style><script>${HOSTILE_JS}</script></head>
<body><p id="host-p">Host paragraph</p><div id="slot"><div data-testimonial-widget ${attrs}></div></div>
${extra}<script async src="${scriptSrc}"></script></body></html>`;
}

const widgetSrc = (baseURL: string | undefined) =>
  `${baseURL ?? "http://localhost:3000"}${WIDGET_PATH}`;

function watch(page: Page) {
  const pageErrors: string[] = [];
  const widgetConsole: string[] = [];
  const dialogs: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.location().url.endsWith(WIDGET_PATH)) widgetConsole.push(m.text());
  });
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  return { pageErrors, widgetConsole, dialogs };
}

async function visitorPage(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext();
  return { page: await context.newPage(), close: () => context.close() };
}

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`),
  ).toEqual([]);
}

test.describe("Embeddable widget on a third-party page", () => {
  test("renders published items only, ignores hostile CSS/JS, keeps XSS inert", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", XSS);
    await submitAndPublish(page, s, "Pending Pat", "Not published yet, stays hidden", false);
    pages.set("/hostile", (src) => hostile(`data-space="${s.slug}"`, src));

    const visitor = await visitorPage(browser);
    const { pageErrors, widgetConsole, dialogs } = watch(visitor.page);
    const wallResponses: { body: string }[] = [];
    visitor.page.on("response", async (r) => {
      if (r.url().includes("/wall")) wallResponses.push({ body: await r.text() });
    });

    await visitor.page.goto(`${hostOrigin}/hostile?src=${encodeURIComponent(widgetSrc(baseURL))}`);
    const widget = visitor.page.locator("[data-testimonial-widget]");
    await expect(widget.getByText("Grace", { exact: true })).toBeVisible();

    // The payload is text, not elements; nothing ran.
    await expect(widget.getByText(XSS)).toBeVisible();
    await expect(widget.locator("img, script")).toHaveCount(0);
    expect(await visitor.page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
    await expect(widget.getByText("Pending Pat")).toHaveCount(0);
    await expect(widget.getByRole("img", { name: "5 out of 5" })).toBeVisible();

    // Host CSS does not reach the content.
    const quote = widget.locator(".quote");
    const style = await quote.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        font: cs.fontFamily,
        size: cs.fontSize,
        spacing: cs.letterSpacing,
        transform: cs.textTransform,
      };
    });
    expect(style.color).toBe("rgb(31, 35, 40)");
    expect(style.font).not.toMatch(/Comic/);
    expect(style.size).toBe("16px");
    expect(style.spacing).toBe("normal");
    expect(style.transform).toBe("none");

    // The widget adds nothing to the host: no globals, no nodes outside the container.
    expect(
      await visitor.page.evaluate(
        () => (window as { TestimonialSaaSWidget?: string }).TestimonialSaaSWidget,
      ),
    ).toBe("host-owned");
    expect(await visitor.page.locator("#slot > *").count()).toBe(1);
    expect(await visitor.page.locator("head style").count()).toBe(1); // only the host's own
    expect(await widget.evaluate((el) => el.children.length)).toBe(0); // content lives in the shadow root
    // Host paragraph is still styled by the host (hostile) rules, i.e. untouched by the widget.
    expect(await visitor.page.locator("#host-p").evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(255, 0, 0)",
    );

    // The hostile host script threw its own error; the widget threw none and logged nothing.
    expect(pageErrors.every((m) => m === "host script error")).toBe(true);
    expect(widgetConsole).toEqual([]);

    // Nothing outside the allowlist reached the browser.
    expect(wallResponses.length).toBe(1);
    for (const key of [
      EMAIL,
      "authorEmail",
      "workspaceId",
      "consent",
      "moderationStatus",
      "deletedAt",
    ]) {
      expect(wallResponses[0]!.body).not.toContain(key);
    }
    await visitor.close();
  });

  test("async script in <head> with the container later in the body still mounts", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", "Late container works fine");
    pages.set(
      "/late",
      (src) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Late</title>
<script async src="${src}"></script></head><body><main><h1>Late</h1><!--SPLIT-->
<div data-testimonial-widget data-space="${s.slug}"></div></main></body></html>`,
    );

    const visitor = await visitorPage(browser);
    const { pageErrors } = watch(visitor.page);
    await visitor.page.goto(`${hostOrigin}/late?src=${encodeURIComponent(widgetSrc(baseURL))}`, {
      waitUntil: "commit",
    });
    await expect(
      visitor.page.locator("[data-testimonial-widget]").getByText("Late container works fine"),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
    await visitor.close();
  });

  test("mounting is idempotent: two script tags and two containers render each exactly once", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", "Rendered exactly once");
    pages.set(
      "/twice",
      (
        src,
      ) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Twice</title></head>
<body><main><h1>Twice</h1>
<div id="a" data-testimonial-widget data-space="${s.slug}"></div>
<div id="b" data-testimonial-widget data-space="${s.slug}" data-theme="dark"></div></main>
<script async src="${src}"></script><script async src="${src}"></script></body></html>`,
    );

    const visitor = await visitorPage(browser);
    const { pageErrors } = watch(visitor.page);
    let wallRequests = 0;
    visitor.page.on("request", (r) => {
      if (r.url().includes("/wall")) wallRequests += 1;
    });
    await visitor.page.goto(`${hostOrigin}/twice?src=${encodeURIComponent(widgetSrc(baseURL))}`);
    for (const id of ["#a", "#b"]) {
      await expect(visitor.page.locator(id).getByText("Rendered exactly once")).toHaveCount(1);
      await expect(visitor.page.locator(id).locator("li")).toHaveCount(1);
    }
    // Let a possible second render happen before counting.
    await visitor.page.waitForTimeout(500);
    for (const id of ["#a", "#b"]) {
      await expect(visitor.page.locator(id).locator("li")).toHaveCount(1);
    }
    expect(wallRequests).toBe(2); // one per container, not one per script
    expect(pageErrors).toEqual([]);

    // Adding the script again later, and a late container, leaves existing ones alone.
    await visitor.page.evaluate((src) => {
      const script = document.createElement("script");
      script.src = src;
      document.body.append(script);
    }, widgetSrc(baseURL));
    await visitor.page.waitForTimeout(500);
    await expect(visitor.page.locator("#a").locator("li")).toHaveCount(1);
    expect(wallRequests).toBe(2);
    await visitor.close();
  });

  test("failures are silent: network error, 500, unknown slug; the host keeps working", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", "Visible when the API works");
    const cases: [string, string, (p: Page) => Promise<unknown>][] = [
      ["network", s.slug, (p) => p.route("**/api/v1/public/**", (route) => route.abort())],
      [
        "500",
        s.slug,
        (p) =>
          p.route("**/api/v1/public/**", (route) => route.fulfill({ status: 500, body: "boom" })),
      ],
      [
        "garbage",
        s.slug,
        (p) =>
          p.route("**/api/v1/public/**", (route) => route.fulfill({ status: 200, body: "<html>" })),
      ],
      ["unknown slug", "no-such-space", async () => {}],
    ];
    for (const [label, slug, setup] of cases) {
      const visitor = await visitorPage(browser);
      const { pageErrors, widgetConsole } = watch(visitor.page);
      await setup(visitor.page);
      pages.set("/fail", (src) => hostile(`data-space="${slug}"`, src));
      await visitor.page.goto(`${hostOrigin}/fail?src=${encodeURIComponent(widgetSrc(baseURL))}`);
      const widget = visitor.page.locator("[data-testimonial-widget]");
      await expect(widget.getByText("Loading…"), label).toHaveCount(0, { timeout: 10_000 });
      // Nothing visible: the shadow root holds an empty container.
      expect(
        await widget.evaluate((el) =>
          (el.shadowRoot?.querySelector(".root")?.textContent ?? "").trim(),
        ),
        label,
      ).toBe("");
      expect(await widget.evaluate((el) => (el as HTMLElement).innerText), label).toBe("");
      expect(
        pageErrors.every((m) => m === "host script error"),
        label,
      ).toBe(true);
      expect(widgetConsole, label).toEqual([]);
      // The host page still works.
      expect(await visitor.page.evaluate(() => 1 + 1), label).toBe(2);
      await expect(visitor.page.locator("#host-p")).toBeVisible();
      await visitor.close();
    }
  });

  test("empty Space, data-limit and the dark theme", async ({ page, browser, baseURL }) => {
    const s = await newSpace(page);
    pages.set("/empty", (src) => cleanPage(src).replace("SLUG", s.slug));
    const visitor = await visitorPage(browser);
    await visitor.page.goto(`${hostOrigin}/empty?src=${encodeURIComponent(widgetSrc(baseURL))}`);
    await expect(
      visitor.page.locator("[data-testimonial-widget]").getByText("No testimonials yet"),
    ).toBeVisible();

    await submitAndPublish(page, s, "Ada", "First published testimonial");
    await submitAndPublish(page, s, "Bob", "Second published testimonial");
    pages.set("/limit", (src) =>
      cleanPage(src, `data-space="${s.slug}" data-limit="1" data-theme="dark"`),
    );
    await visitor.page.goto(`${hostOrigin}/limit?src=${encodeURIComponent(widgetSrc(baseURL))}`);
    const widget = visitor.page.locator("[data-testimonial-widget]");
    await expect(widget.locator("li")).toHaveCount(1);
    expect(
      await widget.locator(".root").evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(13, 17, 23)");
    await visitor.close();
  });

  test("axe: no serious or critical violations in light and dark", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", "Accessible testimonial text");
    for (const theme of ["light", "dark"]) {
      pages.set(`/axe-${theme}`, (src) =>
        cleanPage(src, `data-space="${s.slug}" data-theme="${theme}"`),
      );
      const visitor = await visitorPage(browser);
      await visitor.page.goto(
        `${hostOrigin}/axe-${theme}?src=${encodeURIComponent(widgetSrc(baseURL))}`,
      );
      await expect(
        visitor.page.locator("[data-testimonial-widget]").getByText("Grace"),
      ).toBeVisible();
      await expectNoBlockingViolations(visitor.page);
      await visitor.close();
    }
  });
});

test.describe("Embed assets", () => {
  test("the script and the Wall JSON are embeddable cross-origin", async ({ request, baseURL }) => {
    const script = await request.get(`${baseURL}${WIDGET_PATH}`);
    expect(script.status()).toBe(200);
    expect(script.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(script.headers()["cache-control"]).toBe("public, max-age=300");
    expect(script.headers()["content-type"]).toMatch(/javascript/);
    const wall: APIRequestContext = request;
    const json = await wall.get(`${baseURL}/api/v1/public/spaces/no-such-space/wall`);
    expect(json.status()).toBe(404);
    expect(json.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(json.headers()["access-control-allow-origin"]).toBe("*");
  });
});

test.describe("Dashboard Embed tab", () => {
  test("shows the snippet, copies it and previews the widget under the dashboard CSP", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const s = await newSpace(page);
    await submitAndPublish(page, s, "Grace", "Shown in the dashboard preview");
    await page.goto(`/app/spaces/${s.spaceId}/embed`);

    const origin = new URL(page.url()).origin;
    const snippet = page.getByLabel("Embed snippet");
    await expect(snippet).toHaveValue(
      `<div data-testimonial-widget data-space="${s.slug}" data-theme="light"></div>\n` +
        `<script async src="${origin}${WIDGET_PATH}"></script>`,
    );

    const preview = page.getByTestId("embed-preview");
    await expect(preview.getByText("Shown in the dashboard preview")).toBeVisible();
    // Styles applied despite `default-src 'self'` (constructed stylesheet).
    expect(
      await preview.locator(".root").evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(255, 255, 255)");

    await page.getByLabel("Theme").selectOption("dark");
    await page.getByLabel(/Number of testimonials/).fill("3");
    await expect(snippet).toHaveValue(/data-theme="dark" data-limit="3">/);
    await expect(page.getByTestId("embed-preview").locator(".root").first()).toHaveCSS(
      "background-color",
      "rgb(13, 17, 23)",
    );

    await page.getByRole("button", { name: "Copy snippet" }).click();
    await expect(page.getByText("Snippet copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `data-space="${s.slug}"`,
    );
    await expectNoBlockingViolations(page);
  });

  test("an archived Space has no snippet", async ({ page }) => {
    const s = await newSpace(page);
    expect(
      (await apiPost(page, `/workspaces/${s.workspaceId}/spaces/${s.spaceId}/archive`)).status(),
    ).toBe(200);
    await page.goto(`/app/spaces/${s.spaceId}/embed`);
    await expect(page.getByText(/archived, so it has no public Wall/)).toBeVisible();
    await expect(page.getByLabel("Embed snippet")).toHaveCount(0);
  });
});

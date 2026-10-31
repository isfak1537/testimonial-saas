// Embed loader (FR-WID-01..05). Finds every container, attaches a Shadow DOM root, fetches the
// Wall from the script's own origin and renders it. Nothing here may throw into the host page.
import { fetchWall } from "./api.js";
import { readOptions } from "./options.js";
import { createView } from "./render.js";

const CONTAINER_SELECTOR = "[data-testimonial-widget]";
const SCRIPT_SELECTOR = 'script[src*="/embed/widget.v1.js"]';
const MOUNTED = new WeakSet<Element>();

/** Captured synchronously: `currentScript` is null once the script has finished running. */
function scriptOrigin(): string | null {
  try {
    const script =
      (document.currentScript as HTMLScriptElement | null) ??
      document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    if (!script?.src) return null;
    const url = new URL(script.src);
    // `data:` and `blob:` URLs have the opaque origin "null"; never fetch relative to that.
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const origin = scriptOrigin();

async function mount(container: HTMLElement, apiOrigin: string): Promise<void> {
  // Idempotent (also for a second copy of the script, which has its own WeakSet): the shadow
  // root is the durable mark, so a container is rendered exactly once.
  if (MOUNTED.has(container) || container.shadowRoot) return;
  MOUNTED.add(container);
  const options = readOptions(container);
  if (!options) return;
  const view = createView(container.attachShadow({ mode: "open" }), options.theme);
  view.showLoading();
  try {
    view.showItems(await fetchWall(apiOrigin, options.slug, options.limit));
  } catch {
    view.clear();
  }
}

function mountAll(): void {
  if (!origin) return;
  try {
    document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR).forEach((container) => {
      mount(container, origin).catch(() => {
        // Skip this container; others may still mount.
      });
    });
  } catch {
    // Ignore: the host page keeps working without the widget.
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAll, { once: true });
} else {
  mountAll();
}

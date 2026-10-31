// DOM building (FR-WID-03): every API string goes through `textContent`; markup is never parsed.
import type { WidgetItem } from "./api.js";
import { STYLES } from "./styles.js";
import type { Theme } from "./options.js";

export function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function attachStyles(root: ShadowRoot): void {
  // A constructed stylesheet is not blocked by a host page's `style-src` CSP; the <style>
  // fallback covers browsers without it.
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.appendChild(el("style", undefined, STYLES));
  }
}

export interface View {
  showLoading(): void;
  showItems(items: WidgetItem[]): void;
  /** FR-WID-04: nothing visible on error. */
  clear(): void;
}

export function createView(root: ShadowRoot, theme: Theme): View {
  attachStyles(root);
  const container = el("div", theme === "dark" ? "root dark" : "root");
  root.appendChild(container);

  return {
    showLoading() {
      const status = el("p", "status", "Loading…");
      status.setAttribute("role", "status");
      container.replaceChildren(status);
    },
    showItems(items) {
      if (items.length === 0) {
        container.replaceChildren(el("p", "status", "No testimonials yet"));
        return;
      }
      const list = el("ul", "list");
      for (const item of items) {
        const li = el("li", "item");
        const rating = el("span", "stars", stars(item.rating));
        rating.setAttribute("role", "img");
        rating.setAttribute("aria-label", `${item.rating} out of 5`);
        li.append(rating, el("span", "quote", item.content), el("span", "author", item.authorName));
        if (item.authorTitle) li.appendChild(el("span", "title", item.authorTitle));
        list.appendChild(li);
      }
      container.replaceChildren(list);
    },
    clear() {
      container.replaceChildren();
    },
  };
}

// Embed loader. I00 only mounts an isolated Shadow DOM root on each container;
// fetching and rendering published testimonials arrives in I09.

const CONTAINER_ATTRIBUTE = "data-testimonial-widget";

function mount(container: HTMLElement): void {
  if (container.shadowRoot) return;
  const root = container.attachShadow({ mode: "open" });
  root.appendChild(document.createElement("div")).setAttribute("data-state", "pending");
}

function mountAll(): void {
  // Never let a widget failure break the host page.
  try {
    document.querySelectorAll<HTMLElement>(`[${CONTAINER_ATTRIBUTE}]`).forEach((container) => {
      try {
        mount(container);
      } catch {
        // Skip this container; others may still mount.
      }
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

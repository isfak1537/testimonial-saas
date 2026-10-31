// CSS for the Shadow root. The root element resets every inherited property (`all: initial`),
// so host rules such as `* { color: red !important }` cannot reach the content through
// inheritance from the host element.

export const STYLES = `
.root {
  all: initial;
  display: block;
  box-sizing: border-box;
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2328;
  background: #ffffff;
  --border: #d0d7de;
  --muted: #57606a;
  --star: #9a6700;
}
.root.dark {
  color: #e6edf3;
  background: #0d1117;
  --border: #30363d;
  --muted: #9da7b3;
  --star: #e3b341;
}
.root *, .root *::before, .root *::after { box-sizing: border-box; }
.status { display: block; margin: 0; padding: 1rem; color: var(--muted); }
.list { display: grid; gap: 1rem; margin: 0; padding: 1rem; list-style: none; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
.item { margin: 0; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; }
.stars { display: block; color: var(--star); letter-spacing: 0.1em; }
.quote { display: block; margin: 0.5rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.author { display: block; font-weight: 600; overflow-wrap: anywhere; }
.title { display: block; color: var(--muted); font-size: 0.875rem; overflow-wrap: anywhere; }
`;

// Fails when the built widget bundle exceeds the agreed gzipped budget (U-09).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT_BYTES = 30 * 1024;
const bundlePath = new URL("../dist/widget.v1.js", import.meta.url);

let source;
try {
  source = readFileSync(bundlePath);
} catch {
  console.error(
    `widget size: bundle not found at ${bundlePath.pathname}; run the widget build first.`,
  );
  process.exit(1);
}

const gzipped = gzipSync(source, { level: 9 }).length;
const summary = `${(gzipped / 1024).toFixed(2)} KB gzipped (limit ${LIMIT_BYTES / 1024} KB)`;

if (gzipped > LIMIT_BYTES) {
  console.error(`widget size: FAIL — ${summary}`);
  process.exit(1);
}
console.log(`widget size: OK — ${summary}`);

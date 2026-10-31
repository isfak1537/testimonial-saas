import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import {
  afterCursor,
  afterPublishedCursor,
  decodeCursor,
  encodeCursor,
  toPage,
} from "../../src/http/pagination.js";

const row = (n: number) => ({
  createdAt: new Date(Date.UTC(2026, 9, 30, 12, 0, n)),
  id: `00000000-0000-4000-8000-00000000000${n}`,
});

describe("cursor", () => {
  it("round-trips", () => {
    const pos = row(1);
    expect(decodeCursor(encodeCursor(pos))).toEqual(pos);
  });

  it.each([
    "!!!",
    Buffer.from("nope").toString("base64url"),
    Buffer.from("-271821-04-20T00:00:00.000Z|00000000-0000-4000-8000-000000000001").toString(
      "base64url",
    ),
    Buffer.from("2026-10-30|00000000-0000-4000-8000-000000000001").toString("base64url"),
    Buffer.from("2026-10-30T12:00:00.000Z|not-a-uuid").toString("base64url"),
    Buffer.from("garbage|00000000-0000-4000-8000-000000000001").toString("base64url"),
    Buffer.from("2026-10-30T12:00:00.000Z|00000000-0000-4000-8000-000000000001|x").toString(
      "base64url",
    ),
  ])("rejects %j with 422", (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(AppError);
    try {
      decodeCursor(cursor);
    } catch (error) {
      expect((error as AppError).status).toBe(422);
    }
  });

  it("adds no filter without a cursor", () => {
    expect(afterCursor(undefined)).toEqual({});
  });
});

describe("toPage", () => {
  it("returns no cursor when the rows fit", () => {
    expect(toPage([row(1), row(2)], 2).nextCursor).toBeNull();
  });

  it("trims the extra row and points at the last returned one", () => {
    const page = toPage([row(3), row(2), row(1)], 2);
    expect(page.items).toEqual([row(3), row(2)]);
    expect(decodeCursor(page.nextCursor ?? "")).toEqual(row(2));
  });
});

describe("published cursor", () => {
  it("adds no filter without a cursor", () => {
    expect(afterPublishedCursor(undefined)).toEqual({});
  });

  it("filters on publishedAt and breaks ties by id", () => {
    const pos = row(2);
    expect(afterPublishedCursor(encodeCursor(pos))).toEqual({
      OR: [
        { publishedAt: { lt: pos.createdAt } },
        { publishedAt: pos.createdAt, id: { lt: pos.id } },
      ],
    });
  });

  it("rejects a bad cursor with 422", () => {
    expect(() => afterPublishedCursor("!!!")).toThrow(AppError);
  });

  it("toPage builds the cursor from a custom position", () => {
    const rows = [row(3), row(2), row(1)].map((r) => ({ id: r.id, publishedAt: r.createdAt }));
    const page = toPage(rows, 2, (r) => ({ createdAt: r.publishedAt, id: r.id }));
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor!)).toEqual({
      createdAt: rows[1]!.publishedAt,
      id: rows[1]!.id,
    });
  });
});

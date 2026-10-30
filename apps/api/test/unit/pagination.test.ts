import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { afterCursor, decodeCursor, encodeCursor, toPage } from "../../src/http/pagination.js";

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

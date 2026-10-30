import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, onUnauthorized } from "./client";

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(null);
});

describe("api client", () => {
  it("sends JSON with same-origin credentials", async () => {
    const fetchMock = stubFetch(respond(200, { ok: true }));
    await api.login({ email: "a@example.com", password: "secret" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "secret" }),
    });
  });

  it("sends no body or content type on GET", async () => {
    const fetchMock = stubFetch(respond(200, {}));
    await api.getMe();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it("returns undefined for 204", async () => {
    stubFetch(respond(204));
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("parses the error envelope", async () => {
    stubFetch(
      respond(409, {
        error: {
          code: "SLUG_TAKEN",
          message: "Slug taken",
          requestId: "r1",
          details: [{ path: "slug", message: "Taken" }, { bad: true }],
        },
      }),
    );
    const error = await api
      .createSpace("w1", { name: "n", slug: "slug", headline: "h", message: "", prompts: [] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "SLUG_TAKEN",
      requestId: "r1",
      details: [{ path: "slug", message: "Taken" }],
    });
  });

  it("turns a non-envelope response into a generic error", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(api.getMe()).rejects.toMatchObject({ status: 502, code: "UNKNOWN" });
  });

  it("turns a network failure into a NETWORK error", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    await expect(api.getMe()).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("calls the unauthorized handler on 401 UNAUTHENTICATED", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    stubFetch(respond(401, { error: { code: "UNAUTHENTICATED", message: "x", requestId: "r" } }));
    await expect(api.listSpaces("w1")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call the handler for INVALID_CREDENTIALS", async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    stubFetch(
      respond(401, { error: { code: "INVALID_CREDENTIALS", message: "x", requestId: "r" } }),
    );
    await expect(api.login({ email: "a@example.com", password: "p" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("encodes ids and the cursor in paths", async () => {
    const fetchMock = stubFetch(respond(200, { items: [], nextCursor: null }));
    await api.listSpaces("w/1", "a b");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "/api/v1/workspaces/w%2F1/spaces?cursor=a%20b",
    );
  });
});

import type {
  CreateSpaceBody,
  LoginBody,
  MeResponse,
  PublicFormDto,
  SignupBody,
  SpaceDto,
  SpaceListResponse,
  SubmissionReceipt,
  SubmitTestimonialBody,
  TestimonialDto,
  TestimonialListResponse,
  UpdateSpaceBody,
} from "@testimonial-saas/shared";

export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** Any failed API call: an error envelope from the server, or a network/unexpected failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = "/api/v1";

let unauthorizedHandler: (() => void) | null = null;

/** The AuthProvider registers one handler; it runs on a 401 UNAUTHENTICATED during a session. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function isDetail(value: unknown): value is ApiErrorDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiErrorDetail).path === "string" &&
    typeof (value as ApiErrorDetail).message === "string"
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    envelope = null;
  }
  const error =
    typeof envelope === "object" && envelope !== null
      ? (envelope as { error?: unknown }).error
      : undefined;
  if (typeof error === "object" && error !== null) {
    const { code, message, requestId, details } = error as Record<string, unknown>;
    return new ApiError(
      response.status,
      typeof code === "string" ? code : "UNKNOWN",
      typeof message === "string" ? message : "Something went wrong",
      Array.isArray(details) ? details.filter(isDetail) : [],
      typeof requestId === "string" ? requestId : undefined,
    );
  }
  return new ApiError(response.status, "UNKNOWN", "Something went wrong");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server. Check your connection.");
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401 && error.code === "UNAUTHENTICATED") unauthorizedHandler?.();
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const testimonialsPath = (workspaceId: string, spaceId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/spaces/${encodeURIComponent(spaceId)}/testimonials`;

export const api = {
  getMe: () => request<MeResponse>("/auth/me"),
  signup: (body: SignupBody) => request<MeResponse>("/auth/signup", { method: "POST", body }),
  login: (body: LoginBody) => request<MeResponse>("/auth/login", { method: "POST", body }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  listSpaces: (workspaceId: string, cursor?: string) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return request<SpaceListResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/spaces${query}`,
    );
  },
  createSpace: (workspaceId: string, body: CreateSpaceBody) =>
    request<SpaceDto>(`/workspaces/${encodeURIComponent(workspaceId)}/spaces`, {
      method: "POST",
      body,
    }),
  getSpace: (workspaceId: string, spaceId: string) =>
    request<SpaceDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/spaces/${encodeURIComponent(spaceId)}`,
    ),
  updateSpace: (workspaceId: string, spaceId: string, body: UpdateSpaceBody) =>
    request<SpaceDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/spaces/${encodeURIComponent(spaceId)}`,
      { method: "PATCH", body },
    ),
  archiveSpace: (workspaceId: string, spaceId: string) =>
    request<SpaceDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/spaces/${encodeURIComponent(spaceId)}/archive`,
      { method: "POST" },
    ),

  listTestimonials: (
    workspaceId: string,
    spaceId: string,
    filters: { status?: string; published?: string; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const query = params.size > 0 ? `?${params}` : "";
    return request<TestimonialListResponse>(`${testimonialsPath(workspaceId, spaceId)}${query}`);
  },
  getTestimonial: (workspaceId: string, spaceId: string, id: string) =>
    request<TestimonialDto>(`${testimonialsPath(workspaceId, spaceId)}/${encodeURIComponent(id)}`),
  testimonialAction: (
    workspaceId: string,
    spaceId: string,
    id: string,
    action: "approve" | "reject" | "publish" | "unpublish" | "withdraw-consent",
  ) =>
    request<TestimonialDto>(
      `${testimonialsPath(workspaceId, spaceId)}/${encodeURIComponent(id)}/${action}`,
      { method: "POST" },
    ),
  deleteTestimonial: (workspaceId: string, spaceId: string, id: string) =>
    request<void>(`${testimonialsPath(workspaceId, spaceId)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getPublicForm: (slug: string) =>
    request<PublicFormDto>(`/public/spaces/${encodeURIComponent(slug)}/form`),
  submitTestimonial: (slug: string, body: SubmitTestimonialBody) =>
    request<SubmissionReceipt>(`/public/spaces/${encodeURIComponent(slug)}/testimonials`, {
      method: "POST",
      body,
    }),
};

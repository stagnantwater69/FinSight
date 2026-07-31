import { API_BASE_URL, supabase } from "./supabase";

/**
 * The single HTTP client for the mobile app.
 *
 * It talks to the SAME backend as the web app — same /api/v1 routes, same
 * validation, same ownership rules. No business logic is reimplemented here;
 * every figure the app displays is computed server-side, which is what keeps
 * the two clients from ever disagreeing about a number.
 *
 * Deliberately fetch-based rather than axios: axios adds a dependency for
 * features (interceptors, transforms) that amount to a few lines here.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(API_BASE_URL.replace(/\/$/, "") + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Turns a failure into something an owner can act on.
 *
 * A mobile app fails in ways a browser tab mostly doesn't — no signal, a
 * captive-portal wifi, a backend that isn't reachable from the phone's network
 * even though it is from the laptop. "Network request failed" is true and
 * useless, so those get a message that says what to check.
 */
async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body?.error === "string") message = body.error;
    else if (body?.details) message = "Please check the highlighted fields and try again.";
  } catch {
    // Non-JSON body — keep the status-based message.
  }
  if (res.status === 401) message = "Your session has expired. Please log in again.";
  if (res.status >= 500) message = "FinSight's server had a problem with that. Please try again in a moment.";
  return new ApiError(res.status, message);
}

function networkError(err: unknown): ApiError {
  const detail = err instanceof Error ? err.message : String(err);
  return new ApiError(
    0,
    `Couldn't reach FinSight. Check your internet connection, and if you're on a phone make sure it can ` +
      `reach the server address in your settings (${API_BASE_URL}). [${detail}]`
  );
}

async function request<T>(method: string, path: string, opts: {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  formData?: FormData;
} = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: {
        ...(await authHeader()),
        // FormData must set its own multipart boundary — never set
        // Content-Type by hand for an upload.
        ...(opts.formData ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch (err) {
    throw networkError(err);
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
    request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  // `query` is exposed here because some PATCH endpoints are scoped by one
  // rather than by a path id — /notifications/read-all takes the business
  // profile that way. `request` already supported it.
  patch: <T>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ) => request<T>("PATCH", path, { body, query }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, formData: FormData) => request<T>("POST", path, { formData }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

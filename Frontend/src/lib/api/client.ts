/**
 * Central HTTP client. Components never call `fetch` directly; all requests go
 * through the service layer in `./services`, which uses this client.
 *
 * The proposed API envelope is:
 *   success: { success: true, message?: string, data: T }
 *   error:   { success: false, message: string, error: { code, details } }
 *
 * A bare payload is also accepted so the adapter keeps working if the backend
 * returns an unwrapped body. See `docs/API-INTEGRATION.md` for the contract and
 * the items still pending backend confirmation.
 */
import type { ApiError } from "@/lib/types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "cloudguard.demo.token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class RequestError extends Error implements ApiError {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

interface Envelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: { code?: string; details?: unknown };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function errorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (record && typeof record.message === "string") return record.message;
  return fallback;
}

function errorCode(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (!record) return fallback;
  if (isRecord(record.error) && typeof record.error.code === "string") return record.error.code;
  if (typeof record.code === "string") return record.code;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const token = getStoredToken();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RequestError(0, "NETWORK_ERROR", "The API is not reachable. Check the configured base URL.");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null) as Envelope<T> | T | null;
  if (!response.ok) {
    throw new RequestError(
      response.status,
      errorCode(payload, `HTTP_${response.status}`),
      errorMessage(payload, `Request failed with status ${response.status}`),
    );
  }

  const record = asRecord(payload);
  if (record && "success" in record) {
    const envelope = payload as Envelope<T>;
    if (envelope.success === false) {
      throw new RequestError(
        response.status,
        envelope.error?.code ?? "API_ERROR",
        envelope.message ?? "The request could not be completed.",
      );
    }
    if (envelope.data !== undefined) return envelope.data;
  }
  return payload as T;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof RequestError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof DOMException && error.name === "AbortError") {
    return { status: 0, code: "ABORTED", message: "Request cancelled" };
  }
  return {
    status: 0,
    code: "CLIENT_ERROR",
    message: error instanceof Error ? error.message : "Unexpected client error",
  };
}

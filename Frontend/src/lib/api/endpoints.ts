/**
 * Proposed REST endpoint map. These paths come from the (explicitly proposed)
 * API documentation and the implementation plan. They are NOT a confirmed
 * deployed contract. Keep every path in this file so a backend change is a
 * one-line edit rather than a page-by-page search.
 *
 * All paths are relative to NEXT_PUBLIC_API_BASE_URL (default `/api/v1`).
 */
export const API_BASE_PATH = "/api/v1";

export const ENDPOINTS = {
  health: "/health",
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    session: "/auth/session",
  },
  dashboard: {
    summary: "/dashboard/summary",
    recentEvents: "/dashboard/recent-events",
    recentIncidents: "/dashboard/recent-incidents",
  },
  devices: {
    list: "/devices",
    detail: (id: string) => `/devices/${encodeURIComponent(id)}`,
  },
  cloudResources: {
    list: "/cloud-resources",
    detail: (id: string) => `/cloud-resources/${encodeURIComponent(id)}`,
  },
  events: {
    list: "/security-events",
    detail: (id: string) => `/security-events/${encodeURIComponent(id)}`,
  },
  riskAssessments: {
    list: "/risk-assessments",
    detail: (id: string) => `/risk-assessments/${encodeURIComponent(id)}`,
  },
  incidents: {
    list: "/incidents",
    detail: (id: string) => `/incidents/${encodeURIComponent(id)}`,
  },
  responseActions: {
    list: "/response-actions",
    detail: (id: string) => `/response-actions/${encodeURIComponent(id)}`,
    approve: (id: string) => `/response-actions/${encodeURIComponent(id)}/approve`,
    reject: (id: string) => `/response-actions/${encodeURIComponent(id)}/reject`,
  },
  auditLogs: {
    list: "/audit-logs",
    detail: (id: string) => `/audit-logs/${encodeURIComponent(id)}`,
  },
  users: {
    list: "/users",
  },
  settings: {
    get: "/settings",
    update: "/settings",
  },
} as const;

export function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

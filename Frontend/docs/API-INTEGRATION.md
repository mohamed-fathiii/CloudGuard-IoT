# API Integration Guide — CloudGuard IoT Frontend

**Status: PROPOSED CONTRACTS ONLY.** The project API documentation states: *"This document describes the proposed system design. It does not imply that every endpoint or integration has already been implemented."* Nothing in this folder assumes a deployed backend. Every network call is isolated behind `src/lib/api/services.ts`.

---

## 1. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK_DATA` | `1` | `1` uses labelled fixtures; `0` routes service methods through `apiFetch` |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | Base path/URL for all proposed endpoints |
| `APP_BASE_URL` | `http://localhost:3100` | Public app URL; must be aligned with the backend/Auth.js callback configuration |

The frontend dev/start scripts use **port 3100**. The implementation plan's example `APP_BASE_URL` uses port 3000. Align this before integration.

Only `NEXT_PUBLIC_*` values reach the browser. Do not place `AUTH_SECRET`, `DATABASE_URL`, `SIMULATOR_API_KEY` or any credential in them.

---

## 2. Request and response envelope

Proposed success envelope:

```json
{ "success": true, "message": "Operation completed successfully.", "data": {} }
```

Proposed error envelope:

```json
{
  "success": false,
  "message": "The request could not be completed.",
  "error": { "code": "VALIDATION_ERROR", "details": [] }
}
```

`src/lib/api/client.ts` unwraps `data` when the envelope is present and also accepts a bare payload. Failures become `RequestError { status, code, message }`, normalised by `toError()` into `ApiError` for the UI. `401` should clear the session; `403` renders the access-denied state. **The backend must confirm the exact envelope and error codes** — this is an adapter, not an assumption of truth.

Headers sent: `Content-Type: application/json`, `Accept: application/json`, and `Authorization: Bearer <token>` when a token is stored. Whether Auth.js uses a bearer token or an httpOnly session cookie is an M1 decision; the client can be switched to `credentials: "include"` in one place when confirmed.

---

## 3. Endpoint map

All paths are relative to `NEXT_PUBLIC_API_BASE_URL`. Constants live in `src/lib/api/endpoints.ts`.

| Area | Method + path | Used by | Status / note |
|---|---|---|---|
| Health | `GET /health` | — | Plan Step 1; not in API doc |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` | Login, shell | **Placeholder.** M1 owns Auth.js; exact client contract unconfirmed |
| Dashboard | `GET /dashboard/summary` | Adapter option | Returns only `totalDevices`, `totalCloudResources`, `totalSecurityEvents`, `openIncidents`, `criticalIncidents` (illustrative) |
| Dashboard | `GET /dashboard/recent-events`, `GET /dashboard/recent-incidents` | Overview | Response shape unconfirmed; adapter accepts array or `Page<T>` |
| Devices | `GET /devices`, `POST /devices`, `GET/PATCH/DELETE /devices/{deviceId}` | Devices list/detail, register | Proposed; filters sent as query params |
| Cloud resources | `GET /cloud-resources`, `POST /cloud-resources`, `GET/PATCH/DELETE /cloud-resources/{resourceId}` | Cloud Resources | Proposed; rescan uses `POST /cloud-resources/rescan` (frontend convention, needs confirmation) |
| Security events | `GET /security-events`, `POST /security-events`, `GET /security-events/{eventId}`, `POST /security-events/bulk` | Events list/detail | Proposed; list accepts `search`, severity, score, source, device, range, sort, `page`, `pageSize` |
| Risk assessments | `GET /risk-assessments`, `POST /risk-assessments`, `GET /risk-assessments/{assessmentId}` | Event score explanation | Proposed; frontend currently receives score/factors with the event; confirm whether a separate call is required |
| Incidents | `GET /incidents`, `POST /incidents`, `GET/PATCH /incidents/{incidentId}` | Incidents list/detail | Proposed; notes use `POST /incidents/{incidentId}/notes` (frontend convention, needs confirmation) |
| Response actions | `GET /response-actions`, `POST /response-actions`, `GET /response-actions/{actionId}`, `POST /response-actions/{actionId}/approve`, `POST /response-actions/{actionId}/reject` | Response history, device/incident actions | Proposed; approval flow is currently combined into `POST` in demo mode — needs backend decision |
| Audit logs | `GET /audit-logs`, `GET /audit-logs/{logId}` | Audit Log | Proposed; append-only |
| Users | `GET /users`, `POST /users` | Settings → User Management | Plan Step 2 additions; exact paths unconfirmed |
| Settings | `GET /settings`, `PATCH /settings` | Settings tabs | Plan Step 4 only; exact paths unconfirmed |

### Dashboard derivation

`getDashboardSummary()` currently fetches devices, cloud resources, events and incidents through their list endpoints and derives KPIs, distributions and the 24-hour trend locally. This keeps charts consistent between demo and live modes. If the backend provides a richer summary or analytics endpoint, replace the body of that one function; no page changes are required.

---

## 4. Authentication and authorization

- Production auth is **Auth.js credentials provider with hashed passwords and server-side RBAC** (decision D-05; M1 owns it). The frontend's `AuthContext` is a demo-only session and must be replaced in `src/app/providers.tsx`.
- Canonical roles: `ADMINISTRATOR`, `SECURITY_ANALYST`, `VIEWER` (D-06).
- Documented permissions:
  - Administrator: manage users, devices, cloud resources and response workflows; approve/reject.
  - Security Analyst: review events, investigate incidents, update permitted incident fields, request response.
  - Viewer: read dashboard, events, resources, incidents, devices.
- UI gating exists in `AuthContext.can()` but is **not a security boundary**. The backend must enforce every rule and return `401` / `403`. The frontend renders denied states from those statuses.
- Failed and successful logins must be audited server-side (audit `action: LOGIN`).

---

## 5. Canonical vocabularies

API/DB values are `UPPER_SNAKE_CASE`. The UI renders human labels with `humanize()` in `src/lib/types.ts`. Do not send lowercase example values from the proposed API doc.

| Domain | Canonical values |
|---|---|
| Roles | `ADMINISTRATOR`, `SECURITY_ANALYST`, `VIEWER` |
| Severity / risk level | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| Risk bands | `0–29`, `30–59`, `60–79`, `80–100` (D-07) |
| Device status | `ONLINE`, `OFFLINE`, `COMPROMISED`, `MAINTENANCE`, `DECOMMISSIONED` |
| Simulated policy state | `OPERATIONAL`, `QUARANTINED` (D-10; not a DB `device.status`) |
| Device type | `SENSOR`, `CAMERA`, `GATEWAY`, `ACTUATOR`, `SMART_LOCK`, `OTHER` |
| Environment | `DEVELOPMENT`, `TESTING`, `STAGING`, `PRODUCTION`, `SIMULATION` |
| Event source | `IOT_DEVICE`, `CLOUD_RESOURCE`, `SYSTEM` |
| Event type | `UNAUTHORIZED_ACCESS`, `FAILED_LOGIN`, `MALWARE_DETECTED`, `ANOMALOUS_TRAFFIC`, `PORT_SCAN`, `PRIVILEGE_ESCALATION`, `CONFIGURATION_CHANGE`, `DATA_EXFILTRATION`, `FIRMWARE_TAMPERING`, `OTHER` |
| Incident status | `OPEN`, `INVESTIGATING`, `CONTAINED`, `RESOLVED`, `CLOSED`, `FALSE_POSITIVE` |
| Response status | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED` |
| Response execution | `EXECUTED`, `DRY_RUN` |
| Cloud resource type | `EC2`, `S3`, `IAM`, `LAMBDA`, `RDS`, `VPC`, `CLOUDFRONT`, `OTHER` |
| Cloud resource status | `ACTIVE`, `INACTIVE`, `TERMINATED`, `ERROR` |
| Audit outcome | `SUCCESS`, `DENIED`, `FAILURE` |

Frontend-only presentation fields (not assumed to be backend fields): `processingState` on events, `approvalPending` on incidents, `execution` / `recovery` on response records, `baseline` on devices, and all `SystemSettings` keys. If the backend exposes equivalents, map them in the service layer; do not leak UI-only fields into requests.

---

## 6. Response-action safety contract

The UI enforces a typed confirmation (password re-entry plus exact target text), shows allowlist/cooldown/reversibility information, and offers a dry run. The backend must independently:

1. validate target and action type;
2. reject unknown, production and non-allowlisted targets;
3. require approval before execution;
4. allow automatic isolation only for allowlisted simulated targets with score ≥85 (80–84 requires approval);
5. record requester, approver, target, timestamp and execution result in the append-only audit log;
6. use simulated state changes (`QUARANTINED`, deny-all policy) — no real AWS calls in the MVP.

The demo's `createResponse()` writes an in-memory audit entry and simulated device state. This must be replaced with server-side execution.

---

## 7. Conflicts and decisions required from the backend team

| # | Conflict | Frontend decision | Confirmation needed |
|---|---|---|---|
| 1 | API doc shows lowercase example enums (`investigating`, `medium`, `simulated_iot`) | Use canonical uppercase values (D-13) | Backend must normalise/validate uppercase |
| 2 | Risk bands differ across docs (0–30 vs 0–24 vs 0–29) | Use D-07: 0–29/30–59/60–79/80–100 | Confirm scoring engine uses the same bands |
| 3 | `QUARANTINED` appears as a device status in the prototype | Model as simulated policy state, keep canonical `device.status` | Confirm response API field name |
| 4 | Response `action_type` canonical list does not include `REINSTATE_DEVICE` or `DRY_RUN` | UI uses plan Step 7 action set + separate `execution` field | Add an ADR or map to canonical values server-side |
| 5 | Proposed summary endpoint has only five counters | Derive all dashboard metrics from list endpoints | Confirm analytics endpoint or accept derivation |
| 6 | Auth mechanism unspecified in API doc | Adapter sends bearer token; M1 may switch to cookie session | Confirm Auth.js integration shape and 401 behaviour |
| 7 | List response shape unspecified (`[]` vs `{items,total,page,pageSize}`) | Adapter accepts both | Confirm pagination contract and query parameter names |
| 8 | Notes/rescan endpoints are frontend conventions | Clearly marked in the table above | Confirm paths or supply alternatives |
| 9 | Port mismatch: frontend 3100, plan example 3000 | `APP_BASE_URL=http://localhost:3100` in `.env.example` | Align deployment callback URLs |
| 10 | Settings/user paths are plan-level placeholders | Isolated behind service methods | Confirm exact routes and payloads |

---

## 8. Switch-off checklist for demo fixtures

- [ ] Backend confirms the endpoint map, envelope, pagination and error codes.
- [ ] Backend confirms canonical enums and response-action semantics.
- [ ] M1 Auth.js provider replaces `AuthProvider` in `src/app/providers.tsx`.
- [ ] `NEXT_PUBLIC_USE_MOCK_DATA=0` set in the target environment.
- [ ] `NEXT_PUBLIC_API_BASE_URL` points to the confirmed base path.
- [ ] Smoke-test each route with 401, 403, 404, empty-list and 500 responses.
- [ ] Confirm audit records are produced server-side for all sensitive actions.
- [ ] Remove the `DEMO DATA` strip only after no fixture-backed call remains (it is conditional on `USE_MOCK` and will disappear automatically).

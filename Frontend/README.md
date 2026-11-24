# CloudGuard IoT — Frontend (Member 3 handover)

Next.js 15 App Router frontend for the CloudGuard IoT security console. This folder is self-contained: source, configuration, dependency manifest, environment example and handover docs. It runs without a backend using clearly labelled demo fixtures, and it is structured so the backend team can switch to real API responses from one place.

> **Data status:** the API documentation in the project is explicitly *proposed*, not deployed. Until the backend confirms contracts, every data call is routed through `src/lib/api/services.ts`. The UI displays a permanent `DEMO DATA` strip whenever fixtures are in use.

---

## 1. Run locally

Requires Node.js 20+ (developed on Node 24) and npm.

```powershell
cd Frontend
npm install
Copy-Item .env.example .env.local   # optional; defaults already use demo data
npm run dev                          # http://localhost:3100
```

Other scripts:

```powershell
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # production server on port 3100
```

If PowerShell blocks `npm.ps1`, invoke npm directly:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### Demo sign-in

Any seeded account works with password `demo1234`; select the matching role:

| Email | Role |
|---|---|
| `admin@example.com` | Administrator |
| `analyst@example.com` | Security Analyst |
| `viewer@example.com` | Viewer |

The login page has one-click buttons for each account. Sign-up is intentionally not offered: the documented model is administrator-provisioned accounts; M1 owns authentication.

---

## 2. Implemented pages and functions

| Route | Functionality |
|---|---|
| `/login` | Validated sign-in, show/hide password, role selection, seeded-account fill, error and busy states |
| `/forgot-password` | Email validation, demo request-recorded state, no email sent |
| `/reset-password` | Token display, password rules, confirm field, success state |
| `/dashboard` | KPI metrics, 24-hour event trend SVG chart, risk/severity/status distributions, critical alerts, recent events, incident queue |
| `/devices` | Search, status/simulation/risk filters, sorting, pagination, register-device form and modal |
| `/devices/[id]` | Canonical device fields, observed baseline, risk explanation, related events/incidents, guarded isolate/reinstate and dry run |
| `/cloud-resources` | Simulated resource inventory, search/type filters, detail modal, simulated rescan |
| `/events` | Search, severity/score/state/source/device/range filters, sorting, pagination, CSV export |
| `/events/[id]` | Detection record, "Why this score" factor breakdown, guidance, related incident link |
| `/incidents` | Status/severity/search filters, incident register |
| `/incidents/[id]` | Overview / Evidence / Timeline tabs, notes, response actions, guarded response, mark resolved |
| `/response-actions` | Execution/action/search filters, detail modal, CSV export |
| `/audit-logs` | Append-only audit view, filters, CSV export, Administrator-only access |
| `/settings` | Eight tabs: profile, user management/invite, notifications, security policies, device policies, retention, integrations, system configuration |
| `/access-denied` | Access-denied state |
| `404` | Not-found state |

Global shell: collapsible sidebar, responsive topbar, dark/light theme, notifications popover, user menu with demo role switch, global search that routes into the event stream, and the persistent demo-data strip.

---

## 3. Architecture and design decisions

- **Stack:** Next.js 15.5 App Router, React 19, TypeScript 5.8 strict, Tailwind CSS 3.4, CSS design tokens in `src/app/globals.css`.
- **Typography:** IBM Plex Sans + IBM Plex Mono. Deliberately not Inter, per `read this first.txt`.
- **Visual system:** dark graphite surface, teal accent, hairline borders, 3px radii, square-line icons, tabular mono numerics. No gradients, glow, glassmorphism, emoji navigation, fake stats or marketing sections.
- **Routes:** App Router route groups `(auth)` and `(dashboard)`; the dashboard layout owns the shell and the demo session guard.
- **Layers:**
  - `src/app` — routes only, no data fetching code inline beyond `useResource` calls.
  - `src/components` — shell, primitives, charts, tables and confirmations.
  - `src/context` — demo session and toast state.
  - `src/hooks` — `useResource` loading/error/retry hook.
  - `src/lib/api` — endpoint constants, HTTP client with response-envelope unwrapping, and all service adapters.
  - `src/lib/mock` — synthetic fixtures, never imported by production API code.
  - `src/lib/types.ts` — canonical domain types from the system analysis, data dictionary and decision records.
- **Canonical values:** API/DB values stay `UPPER_SNAKE_CASE`; the UI renders title-case labels. Risk bands are `0–29 / 30–59 / 60–79 / 80–100` (decision D-07). Roles are `ADMINISTRATOR`, `SECURITY_ANALYST`, `VIEWER` (D-06). `QUARANTINED` is a simulated policy state, not a DB `device.status` (D-10).
- **RBAC:** `can()` in `AuthContext` hides unavailable controls and the audit/settings pages render denied states for non-admins. This is convenience only — the backend must enforce the same rules and return 401/403.
- **Sensitive actions:** isolation/reinstatement require password re-entry plus typed target confirmation, show allowlist/cooldown/reversibility information, offer a dry run, and write an in-memory audit entry in demo mode.
- **States:** every data view implements loading, empty, error, retry and (where relevant) denied/not-found states.

---

## 4. Mock data and integration switch

Mock data is enabled by default (`NEXT_PUBLIC_USE_MOCK_DATA=1`). It includes 3 users, 10 devices, 3 simulated cloud resources, 42 events, 3 incidents, 3 response records and audit entries. These numbers match the implementation-plan seed targets.

To call the backend instead:

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_USE_MOCK_DATA=0`.
2. Set `NEXT_PUBLIC_API_BASE_URL` (default `/api/v1`).
3. Confirm the proposed routes and shapes in [`docs/API-INTEGRATION.md`](docs/API-INTEGRATION.md) with the backend team.
4. Replace the demo session provider in `src/app/providers.tsx` with M1's Auth.js session provider.

No component calls `fetch` directly. All mock/real branching is in `src/lib/api/services.ts`.

---

## 5. Pending backend integration

See [`docs/API-INTEGRATION.md`](docs/API-INTEGRATION.md) for the full list. In short:

- Auth.js credentials session and server-side RBAC (M1) must replace `AuthContext`.
- Every `/api/v1` endpoint in `src/lib/api/endpoints.ts` is proposed and needs confirmation.
- The API doc's lowercase example enum values conflict with the canonical uppercase vocabularies; the frontend uses canonical values.
- Dashboard distributions are derived from list endpoints because the proposed summary endpoint only returns five counters.
- Simulated response state changes and audit entries are currently in-memory only.
- `docs/API-INTEGRATION.md` also records the port mismatch: this frontend uses 3100, while the plan's `APP_BASE_URL` example uses 3000.

---

## 6. QA status

`npm run typecheck` and `npm run build` were executed. Browser verification of routes, navigation, forms, filters, tabs, modals, charts and responsive layouts is recorded in `docs/QA-RECORD.md` after the verification pass. Automated test suites (Vitest/RTL/Playwright) are owned by the project test plan and are **not** claimed as passing here; TC-001–TC-022 and ST-001–ST-008 remain `Not Run` until executed by the team.

---

## 7. Handover notes

- No secrets, credentials or personal data are included. The `.env.example` contains public configuration only.
- The demo password is printed on the login page and documented intentionally; it authenticates nothing on a server.
- The prototype in `UI_UX/index.html` was used as a functional reference, not copied as application code.
- Do not move synthetic records into production code paths. Fixtures are isolated in `src/lib/mock/`.

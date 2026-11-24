# QA Record — CloudGuard IoT Frontend

**Date:** 22 November 2026  
**Build:** Member 3 frontend handover  
**Mode:** `NEXT_PUBLIC_USE_MOCK_DATA=1` (demo fixtures; no backend was running)  
**Servers used for verification:** `next dev -p 3100`, then a clean `next build` + `next start -p 3100` production smoke test.

This record documents the checks that were actually executed. It is not a claim that the project's written test suites were automated or passed.

---

## 1. Build and static verification

| Check | Command / evidence | Result |
|---|---|---|
| TypeScript strict check | `npm run typecheck` (`tsc --noEmit`) | Passed with no output/errors |
| Production build | `npm run build` | `✓ Compiled successfully in 7.3s`; lint/type validation passed; `✓ Generating static pages (16/16)` |
| Route output | Build route table | 16 routes generated, including static `/login`, `/dashboard`, `/devices`, `/events`, `/incidents`, `/settings`, and dynamic `/devices/[id]`, `/events/[id]`, `/incidents/[id]` |
| Production server | `npm start` | `✓ Ready in 708ms` on `http://localhost:3100` |
| Final production smoke | Browser open on `/login`, sign-in, incident flows, audit log | No console errors; no failed network requests |

**Environment note:** one intermediate `Cannot find module './477.js'` occurred when `next build` was run while a `next dev` process was still active. This was a tooling artifact of sharing `.next` between dev and build, not an application defect. The dev process was stopped, `.next` was deleted, a clean build was run, and `next start` was restarted successfully.

---

## 2. Route sweep

The following routes were opened in the browser and checked through DOM assertions. All valid routes rendered their expected content with zero console errors.

| Route | Verified observation |
|---|---|
| `/` | Redirected into the authenticated shell; when signed out, the guard redirected to `/login` |
| `/dashboard` | Security Overview, KPI cards (`10` devices / `7 simulated`, `42` events, `0` critical alerts, `2` open incidents / `1 awaiting approval`), SVG trend chart, distributions, alerts and recent tables |
| `/devices` | Inventory table, filters and registration control for Administrator |
| `/devices/SIM-07` | Device detail, canonical fields, risk explanation, `Quarantined` simulated state, guarded actions |
| `/cloud-resources` | Simulated resource inventory and rescan action |
| `/events` | 42 matching events, filters, sorting, pagination and CSV export |
| `/events/EVT-1000` | Detection detail and score explanation |
| `/incidents` | Incident register with status/severity filters |
| `/incidents/INC-1042` | Incident detail, Overview/Evidence/Timeline tabs, notes and response actions |
| `/response-actions` | Response history records, filters and details modal |
| `/audit-logs` | Append-only audit table; Administrator-only |
| `/settings` | Eight settings tabs |
| `/access-denied` | Dedicated access-denied state |
| `/this-route-does-not-exist` | Custom `Page not found (404)` and `Go to overview` link |

The only expected HTTP 404 network status was on the deliberately unknown route.

---

## 3. Functional browser checks

| Area | Action performed | Observed result |
|---|---|---|
| Login validation | Submitted `not-an-email` | Inline error: `Enter a valid work email address.` |
| Login success | Used seeded `admin@example.com` button and signed in | Redirected to `/dashboard`; shell rendered with sidebar, topbar and `DEMO DATA` strip |
| Sign out | User menu → Sign out | Redirected to `/login` |
| Forgot password | Submitted `analyst@example.com` | `Request recorded in demo mode` and reset link shown |
| Reset password | Entered `NewPass123` twice | Password rules showed `okCount: 3`; submit produced `Password updated in demo mode` |
| Theme | Toggled light then dark | `document.documentElement.dataset.theme` changed `dark → light → dark` |
| Notifications | Opened popover and selected Mark read | Popover showed 2 notifications; `Notifications marked as read` toast appeared |
| User menu | Opened avatar menu | Role switch and sign-out actions available |
| Sidebar | Collapse/expand control | `.app-shell` gained `nav-collapsed`; expand restored it |
| Global search | Submitted `SIM-07` | Routed to `/events?q=SIM-07`; event search field prefilled; 4 matching rows |
| Viewer RBAC | Switched demo role to Viewer | Sidebar hid Settings and Audit Log; `/settings` showed `Only the Administrator role may change settings`; `/audit-logs` showed `Administrator role is required to read the audit log`; `/devices` hid Register device and showed the Administrator-only notice |
| Device search | Filtered `SIM-07` | Table reduced to 1 row |
| Device form | Submitted empty form, then valid values | Validation: `Device name must be at least 3 characters.`; valid submit created `QA Sensor 01` / `SIM-11` |
| Event filters | Selected severity `CRITICAL`, then Clear filters | `0 matching events` plus empty state; clearing restored `42 matching events` |
| Pagination | Events Next page | Pager moved `1 / 5` → `2 / 5` and rows changed |
| CSV export | Events → Export CSV | Downloaded `cloudguard-events-demo.csv` (987 bytes); headers `ID,Detected at,Device,Event type,Rule,Risk score,Severity,State` and correct demo rows |
| Cloud resources | Run simulated scan, then Details | `Simulated rescan complete` toast; CRS-001 detail modal opened |
| Settings tabs | Cycled tabs and opened invite modal | All 8 tabs rendered; Security Policies showed fixed bands `0–29 / 30–59 / 60–79 / 80–100`; invite created `qa.test@example.com` in memory |
| Incident tabs | Evidence and Timeline | Evidence showed 4 correlated events; Timeline showed 4 items |
| Incident note | Added note on INC-1042 | Note text appeared in the investigation notes |
| Mark resolved | Confirmed resolution on INC-1042 | Status changed to `RESOLVED`; Mark resolved button disappeared; client-side navigation to Audit Log showed `AUD-9002 … UPDATE_INCIDENT … Status changed to RESOLVED.` |
| Response actions | Filtered execution to `EXECUTED` | 3 records reduced to 2; Details modal included `Audited` |
| Charts/tables | Inspected dashboard and all tables | SVG trend chart, distribution panels, metric cards and all data tables rendered with visible text/content |

---

## 4. Defect found, fixed and retested

### DRY_RUN confirmation defaulted to an executed state

**Found:** clicking `Run dry run` on an incident opened the confirmation with Execution set to `Executed (simulated state change)` and the reinstatement warning. This was misleading and could imply a state-changing action.

**Fix:**
- `src/components/ConfirmDialog.tsx` now detects `action === "DRY_RUN"`, locks the display to `DRY_RUN · no change made`, shows the no-change warning, and labels the confirm button `Run dry run`.
- `src/lib/api/services.ts` normalises any `DRY_RUN` action to `execution: "DRY_RUN"` before persisting the response record, preventing a caller from accidentally executing it.

**Retest (dev):** a completed dry run produced `RSP-222 | Dry Run | INC-1042 | admin@example.com | DRY RUN | COMPLETED | NOT APPLICABLE`.

**Retest (final production build):** the modal showed:

```text
Confirm dry run of SIM-07
Dry run. No device or cloud state will change. The simulated result is recorded in the audit log.
✓ Allowlist check
✓ Cooldown enforced
✓ No state change
Action type        DRY_RUN
Execution          DRY_RUN · no change made
Confirm button     Run dry run (disabled until password and target are entered)
```

---

## 5. Responsive and accessibility observations

- Browser viewport during QA was `716×686`, exercising the `max-width: 900px` breakpoint: `matchMedia('(max-width: 900px)').matches === true`.
- At that width the sidebar was 68px (icon rail), and `.table-scroll` used `overflow-x: auto` for wide tables.
- Source review confirmed breakpoints at `max-width: 1180px`, `900px` and `620px` in `src/app/globals.css`.
- Full manual resizing to `1366×768` and `1920×1080` was **not run** because the available browser tooling had no viewport-resize operation.
- The browser accessibility snapshot did not traverse client-rendered `<main>` content reliably. DOM evaluation confirmed the dashboard `<main>` was present, visible, approximately 2659px tall and contained 1898 characters of visible text; no `aria-hidden` or hidden-content styling was found.
- Dead-link scan found no `href="#"`; interactive buttons were wired to handlers.

---

## 6. Console and network results

- Dev route sweep: no console errors on valid routes and no failed network requests.
- Final production smoke: `consoleErrors: []` and `failedRequests: []` after sign-in, incident resolution and dry-run modal checks.
- No failed font, script, stylesheet or image asset requests were observed.

---

## 7. Not run / outstanding

- Automated suites `TC-001–TC-022` and `ST-001–ST-008` are **Not Run**. No Vitest, React Testing Library or Playwright suite was configured as part of this handover, so no automated pass rate is claimed.
- Lighthouse was not run.
- No real backend endpoint was exercised. All checks above used isolated demo fixtures.
- In-memory demo mutations persist across client-side navigation for the browser session and reset on a full page reload. Backend persistence is out of scope.
- Auth.js, server-side RBAC, allowlists, cooldown enforcement and audit persistence remain M1/backend responsibilities as documented in `API-INTEGRATION.md`.

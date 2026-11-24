# CloudGuard IoT — Console User Manual (Demo Build)

This manual describes the workflows available in the frontend handover build. All records are synthetic and labelled `DEMO DATA`.

## Signing in

1. Open `http://localhost:3100`. You are redirected to `/dashboard`, then to `/login` if no demo session exists.
2. Choose a seeded account with the one-click buttons, or enter the email and password and select the matching role.
3. Select **Sign in**. Validation errors appear next to the affected field.

Passwords must be at least 8 characters. Sign-up is not available: accounts are provisioned by an administrator. Forgot-password and reset screens show the validation and success states; no email is sent.

## Switching roles

Open the avatar menu in the top right and choose **Switch demo role**. This changes which controls and pages are visible:

- **Administrator** — full access, including user management, settings, audit log and response approval.
- **Security Analyst** — review events and incidents, add notes, request responses and dry runs.
- **Viewer** — read-only access; mutation controls are hidden and privileged pages show an access-denied state.

## Overview

The dashboard shows KPIs, a sampled 24-hour event trend, critical alerts, risk/severity/state distributions, recent events and the incident queue. Select any alert, event or incident to open its detail view.

## Devices

- Filter by status, simulated policy state, risk band or free-text search; sort and paginate the table.
- Administrators can **Register device** — fill the required fields and submit. The record is added to the in-memory demo inventory and an audit entry is written.
- Open a device to see canonical fields, its observed baseline, risk explanation, related events and incidents.
- **Isolate device…**, **Reinstate device…** and **Run dry run** open a guarded confirmation: re-enter the password and type the exact device ID. Analysts may run dry runs only; administrators may execute simulated state changes.

## Cloud resources

A simulated AWS inventory supports search, type filtering, detail view and a **Run simulated scan** action for administrators. No AWS API call is made.

## Security events

Use the filters (severity, minimum score, processing state, source, device, time range) and sorting to narrow the stream. **Export CSV** downloads the current page. Open an event for the detection record and the "Why this score" factor breakdown. The severity bands and disclaimer are shown on the detail page.

## Incidents

Filter the register by status and severity. Incident detail has three tabs:

- **Overview** — summary, canonical fields, response history and investigation notes.
- **Evidence** — all correlated events.
- **Timeline** — recorded activity in order.

Analysts and administrators can add a note, request isolation/reinstatement, run a dry run or mark an incident resolved. All mutating actions show a confirmation and are reflected in the audit log (in memory for this build).

## Response history and audit log

Response history shows authorisation, execution mode, result and recovery state; use **Details** for the full record and **Export CSV** for the filtered page. The audit log is Administrator-only and records successes, denials and failures.

## Settings (Administrator)

Eight tabs cover profile, user management/invite, notifications, security policies, device policies, retention, integrations and system configuration. Risk bands are read-only because they are a locked decision. Save actions show a success toast; changes are in-memory only.

## Global controls

- Sidebar collapse/expand (state saved locally).
- Dark/light theme toggle (state saved locally).
- Notifications popover with **Mark read**.
- Global search: type a term and press Enter to open the event stream filtered by that term.
- **Skip to content** keyboard link and visible focus rings throughout.

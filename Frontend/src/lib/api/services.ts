/**
 * API service layer — the ONLY module pages/components may use for data.
 *
 * `USE_MOCK` defaults to true, so a fresh checkout runs without a backend.
 * Set NEXT_PUBLIC_USE_MOCK_DATA=0 to route every call through `apiFetch`.
 * Mock state lives in cloned module-level arrays: actions performed in the UI
 * persist for the lifetime of the browser session, then reset on reload.
 *
 * The API documentation is proposed, not deployed. Every real-mode call is a
 * documented integration placeholder and must be confirmed by the backend
 * team. See `docs/API-INTEGRATION.md`.
 */
import { apiFetch, RequestError } from "./client";
import { ENDPOINTS, withQuery } from "./endpoints";
import * as FIX from "@/lib/mock/fixtures";
import { paginate, riskLevel } from "@/lib/format";
import type {
  ApiError,
  AuditEntry,
  CloudResource,
  DashboardSummary,
  DetectionRule,
  Device,
  DeviceType,
  Environment,
  ExecutionType,
  Incident,
  IncidentStatus,
  Page,
  ResponseAction,
  ResponseRecord,
  Role,
  SecurityEvent,
  Session,
  SystemSettings,
  User,
} from "@/lib/types";

export const USE_MOCK = (process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? "1") !== "0";

/** Seed accounts from the implementation plan. Demo-only; never used in real mode. */
export const DEMO_ACCOUNTS: { email: string; password: string; role: Role; label: string }[] = [
  { email: "admin@example.com", password: "demo1234", role: "ADMINISTRATOR", label: "Administrator" },
  { email: "analyst@example.com", password: "demo1234", role: "SECURITY_ANALYST", label: "Security Analyst" },
  { email: "viewer@example.com", password: "demo1234", role: "VIEWER", label: "Viewer" },
];

const wait = (ms = 160) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => structuredClone(value);

// Mutable demo state — cloned so fixtures remain pristine.
let devices: Device[] = clone(FIX.DEVICES);
let resources: CloudResource[] = clone(FIX.CLOUD_RESOURCES);
let events: SecurityEvent[] = clone(FIX.EVENTS);
let incidents: Incident[] = clone(FIX.INCIDENTS);
let responses: ResponseRecord[] = clone(FIX.RESPONSES);
let audit: AuditEntry[] = clone(FIX.AUDIT_ENTRIES);
let users: User[] = clone(FIX.USERS);
let settings: SystemSettings = clone(FIX.SETTINGS);
let nextDeviceNumber = 11;
let nextResponseNumber = 222;
let nextAuditNumber = 9002;

export function resetDemoState(): void {
  devices = clone(FIX.DEVICES);
  resources = clone(FIX.CLOUD_RESOURCES);
  events = clone(FIX.EVENTS);
  incidents = clone(FIX.INCIDENTS);
  responses = clone(FIX.RESPONSES);
  audit = clone(FIX.AUDIT_ENTRIES);
  users = clone(FIX.USERS);
  settings = clone(FIX.SETTINGS);
  nextDeviceNumber = 11;
  nextResponseNumber = 222;
  nextAuditNumber = 9002;
}

function addAudit(actorId: string, action: string, entityType: string, entityId: string, detail: string, outcome: AuditEntry["outcome"] = "SUCCESS"): void {
  audit.unshift({
    id: `AUD-${nextAuditNumber++}`,
    createdAt: new Date().toISOString(),
    actorId,
    action,
    entityType,
    entityId,
    outcome,
    details: detail,
  });
}

function normalizePage<T>(raw: Page<T> | T[] | null | undefined, page: number, pageSize: number): Page<T> {
  if (Array.isArray(raw)) return paginate(raw, page, pageSize);
  if (raw && Array.isArray(raw.items)) {
    return { items: raw.items, total: raw.total ?? raw.items.length, page: raw.page ?? page, pageSize: raw.pageSize ?? pageSize };
  }
  return { items: [], total: 0, page, pageSize };
}

function matches(value: string | null | undefined, filter: string | null | undefined): boolean {
  return !filter || filter === "ALL" || (value ?? "").toUpperCase() === filter.toUpperCase();
}

function contains(haystack: string[], needle: string | undefined): boolean {
  return !needle || haystack.some((v) => v.toLowerCase().includes(needle.toLowerCase()));
}

/* ------------------------------------------------------------------ auth */

export async function login(email: string, password: string, role: Role): Promise<Session> {
  await wait(260);
  if (USE_MOCK) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400, "VALIDATION_ERROR", "Enter a valid email address.");
    if (password.length < 8) throw new RequestError(400, "VALIDATION_ERROR", "Password must be at least 8 characters.");
    if (password === "wrong-password") throw new RequestError(401, "INVALID_CREDENTIALS", "The email or password was not accepted.");
    if (role !== FIX.demoRoleForEmail(email)) {
      throw new RequestError(400, "ROLE_MISMATCH", "For this demo account, use the role associated with the email address.");
    }
    addAudit(email, "LOGIN", "OTHER", "-", "Demo session started; role selected from seed accounts.");
    return FIX.makeDemoSession(email, role);
  }
  // Integration placeholder: M1 owns Auth.js credentials auth and must confirm
  // whether this route is an HTTP endpoint or a client helper.
  return apiFetch<Session>(ENDPOINTS.auth.login, { method: "POST", body: { email, password } });
}

export async function logout(): Promise<void> {
  if (USE_MOCK) {
    await wait(80);
    return;
  }
  await apiFetch<void>(ENDPOINTS.auth.logout, { method: "POST" });
}

/* -------------------------------------------------------------- dashboard */

export function computeSummary(
  deviceRows: Device[],
  resourceRows: CloudResource[],
  eventRows: SecurityEvent[],
  incidentRows: Incident[],
): DashboardSummary {
  const zero: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const riskDistribution = { ...zero } as DashboardSummary["riskDistribution"];
  const severityDistribution = { ...zero } as DashboardSummary["severityDistribution"];
  const deviceStatusDistribution: Record<string, number> = {};
  const simulationStateDistribution: Record<string, number> = {};

  deviceRows.forEach((d) => {
    riskDistribution[d.riskLevel] = (riskDistribution[d.riskLevel] ?? 0) + 1;
    deviceStatusDistribution[d.status] = (deviceStatusDistribution[d.status] ?? 0) + 1;
    simulationStateDistribution[d.simulationState] = (simulationStateDistribution[d.simulationState] ?? 0) + 1;
  });
  eventRows.forEach((e) => {
    severityDistribution[e.severity] = (severityDistribution[e.severity] ?? 0) + 1;
  });

  const latest = eventRows.reduce((max, e) => Math.max(max, Date.parse(e.detectedAt)), 0) || Date.now();
  const trend: DashboardSummary["trend"] = [];
  for (let i = 23; i >= 0; i--) {
    const start = latest - i * 3_600_000;
    const end = start + 3_600_000;
    const bucket = eventRows.filter((e) => {
      const t = Date.parse(e.detectedAt);
      return t >= start && t < end;
    });
    trend.push({
      label: new Date(start).toISOString().slice(11, 16),
      events: bucket.length,
      critical: bucket.filter((e) => e.severity === "CRITICAL").length,
    });
  }

  return {
    totalDevices: deviceRows.length,
    totalCloudResources: resourceRows.length,
    totalSecurityEvents: eventRows.length,
    criticalEvents: eventRows.filter((e) => e.severity === "CRITICAL").length,
    openIncidents: incidentRows.filter((i) => !["RESOLVED", "CLOSED", "FALSE_POSITIVE"].includes(i.status)).length,
    approvalsPending: incidentRows.filter((i) => i.approvalPending).length,
    simulatedDevices: deviceRows.filter((d) => d.isSimulated).length,
    riskDistribution,
    severityDistribution,
    deviceStatusDistribution,
    simulationStateDistribution,
    trend,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (USE_MOCK) {
    await wait();
    return computeSummary(devices, resources, events, incidents);
  }
  // The proposed /dashboard/summary endpoint returns only five counters.
  // Deriving from the list endpoints keeps one code path for the charts and
  // distributions. Confirm with the backend whether to switch to the summary
  // endpoint plus a dedicated analytics route.
  const [deviceRows, resourceRows, eventRows, incidentRows] = await Promise.all([
    listDevices(),
    listCloudResources(),
    listEvents(),
    listIncidents(),
  ]);
  return computeSummary(deviceRows.items, resourceRows, eventRows.items, incidentRows);
}

export async function getRecentEvents(limit = 6): Promise<SecurityEvent[]> {
  if (USE_MOCK) {
    await wait(90);
    return [...events].sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt)).slice(0, limit);
  }
  const raw = await apiFetch<SecurityEvent[] | Page<SecurityEvent>>(withQuery(ENDPOINTS.dashboard.recentEvents, { limit }));
  return Array.isArray(raw) ? raw : raw.items;
}

export async function getRecentIncidents(limit = 3): Promise<Incident[]> {
  if (USE_MOCK) {
    await wait(90);
    return [...incidents].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, limit);
  }
  const raw = await apiFetch<Incident[] | Page<Incident>>(withQuery(ENDPOINTS.dashboard.recentIncidents, { limit }));
  return Array.isArray(raw) ? raw : raw.items;
}

/* ---------------------------------------------------------------- devices */

export interface DeviceFilters {
  search?: string;
  status?: string;
  simulationState?: string;
  risk?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function listDevices(filters: DeviceFilters = {}): Promise<Page<Device>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  if (USE_MOCK) {
    await wait();
    let rows = devices.filter((d) => {
      const scoreOk = !filters.risk || filters.risk === "ALL" || riskLevel(d.riskScore) === filters.risk;
      return contains([d.id, d.deviceName, d.model, d.location], filters.search) &&
        matches(d.status, filters.status) &&
        matches(d.simulationState, filters.simulationState) &&
        scoreOk;
    });
    const sort = filters.sort ?? "risk-desc";
    rows = [...rows].sort((a, b) => {
      if (sort === "name-asc") return a.deviceName.localeCompare(b.deviceName);
      if (sort === "name-desc") return b.deviceName.localeCompare(a.deviceName);
      if (sort === "seen-desc") return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
      if (sort === "risk-asc") return a.riskScore - b.riskScore;
      return b.riskScore - a.riskScore;
    });
    return paginate(rows, page, pageSize);
  }
  const raw = await apiFetch<Page<Device> | Device[]>(withQuery(ENDPOINTS.devices.list, { ...filters }));
  return normalizePage(raw, page, pageSize);
}

export async function getDevice(id: string): Promise<Device | null> {
  if (USE_MOCK) {
    await wait(120);
    return devices.find((d) => d.id === id) ?? null;
  }
  try {
    return await apiFetch<Device>(ENDPOINTS.devices.detail(id));
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

export interface DeviceInput {
  deviceName: string;
  deviceType: DeviceType;
  model: string;
  environment: Environment;
  location: string;
  isSimulated: boolean;
}

export async function createDevice(input: DeviceInput, actor: string): Promise<Device> {
  if (USE_MOCK) {
    await wait(260);
    if (devices.some((d) => d.deviceName.toLowerCase() === input.deviceName.toLowerCase())) {
      throw new RequestError(409, "DUPLICATE_DEVICE", "A device with this name already exists in the demo inventory.");
    }
    const id = `SIM-${String(nextDeviceNumber++).padStart(2, "0")}`;
    const device: Device = {
      id,
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      model: input.model,
      status: "OFFLINE",
      simulationState: "OPERATIONAL",
      environment: input.environment,
      isSimulated: input.isSimulated,
      lastSeenAt: new Date().toISOString(),
      riskScore: 0,
      riskLevel: "LOW",
      incidentCount: 0,
      firmwareVersion: "not-reported",
      location: input.location,
      topicNamespace: `devices/${id.toLowerCase()}/telemetry`,
      baseline: { messageRate: 0, payloadSize: 0, allowedTopics: [], reconnectRate: 0, observedWindow: "no baseline yet" },
    };
    devices.unshift(device);
    addAudit(actor, "CREATE_DEVICE", "DEVICE", id, "Device registered in demo inventory.");
    return device;
  }
  return apiFetch<Device>(ENDPOINTS.devices.list, { method: "POST", body: input });
}

export async function setDeviceSimulationState(id: string, state: "OPERATIONAL" | "QUARANTINED"): Promise<Device | null> {
  if (USE_MOCK) {
    await wait(220);
    const device = devices.find((d) => d.id === id);
    if (!device) return null;
    device.simulationState = state;
    device.status = state === "QUARANTINED" ? "OFFLINE" : "ONLINE";
    return device;
  }
  const action: ResponseAction = state === "QUARANTINED" ? "ISOLATE_DEVICE" : "REINSTATE_DEVICE";
  return apiFetch<Device>(ENDPOINTS.responseActions.list, { method: "POST", body: { targetId: id, actionType: action } });
}

/* -------------------------------------------------------- cloud resources */

export async function listCloudResources(): Promise<CloudResource[]> {
  if (USE_MOCK) {
    await wait(120);
    return clone(resources);
  }
  const raw = await apiFetch<CloudResource[] | Page<CloudResource>>(ENDPOINTS.cloudResources.list);
  return Array.isArray(raw) ? raw : raw.items;
}

export async function rescanCloudResources(actor: string): Promise<CloudResource[]> {
  if (USE_MOCK) {
    await wait(380);
    resources = resources.map((r) => ({ ...r, lastScannedAt: new Date().toISOString() }));
    addAudit(actor, "RESCAN_CLOUD_RESOURCES", "CLOUD_RESOURCE", "-", "Simulated rescan; no AWS API call was made.");
    return clone(resources);
  }
  return apiFetch<CloudResource[]>(`${ENDPOINTS.cloudResources.list}/rescan`, { method: "POST" });
}

/* ----------------------------------------------------------------- events */

export interface EventFilters {
  search?: string;
  severity?: string;
  processingState?: string;
  sourceType?: string;
  deviceId?: string;
  minScore?: string;
  range?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function listEvents(filters: EventFilters = {}): Promise<Page<SecurityEvent>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  if (USE_MOCK) {
    await wait();
    const min = Number(filters.minScore ?? 0) || 0;
    const rangeMinutes = filters.range === "24h" ? 1440 : filters.range === "7d" ? 10080 : filters.range === "30d" ? 43200 : 0;
    const cutoff = rangeMinutes ? FIX_LATEST_EVENT_TIME() - rangeMinutes * 60_000 : 0;
    let rows = events.filter((e) => {
      const scoreOk = e.riskScore >= min;
      const timeOk = !cutoff || Date.parse(e.detectedAt) >= cutoff;
      return contains([e.id, e.title, e.description, e.deviceId ?? "", e.ruleId], filters.search) &&
        matches(e.severity, filters.severity) &&
        matches(e.processingState, filters.processingState) &&
        matches(e.sourceType, filters.sourceType) &&
        matches(e.deviceId, filters.deviceId) && scoreOk && timeOk;
    });
    const sort = filters.sort ?? "time-desc";
    rows = [...rows].sort((a, b) => {
      if (sort === "score-desc") return b.riskScore - a.riskScore;
      if (sort === "score-asc") return a.riskScore - b.riskScore;
      if (sort === "severity-desc") return b.riskScore - a.riskScore;
      return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
    });
    return paginate(rows, page, pageSize);
  }
  const raw = await apiFetch<Page<SecurityEvent> | SecurityEvent[]>(withQuery(ENDPOINTS.events.list, { ...filters }));
  return normalizePage(raw, page, pageSize);
}

function FIX_LATEST_EVENT_TIME(): number {
  return events.reduce((max, e) => Math.max(max, Date.parse(e.detectedAt)), 0);
}

export async function getEvent(id: string): Promise<SecurityEvent | null> {
  if (USE_MOCK) {
    await wait(120);
    return events.find((e) => e.id === id) ?? null;
  }
  try {
    return await apiFetch<SecurityEvent>(ENDPOINTS.events.detail(id));
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

/* --------------------------------------------------------------- incidents */

export interface IncidentFilters {
  search?: string;
  status?: string;
  severity?: string;
}

export async function listIncidents(filters: IncidentFilters = {}): Promise<Incident[]> {
  if (USE_MOCK) {
    await wait(120);
    return [...incidents]
      .filter((i) => contains([i.id, i.title, i.deviceId, i.description], filters.search) &&
        matches(i.status, filters.status) && matches(i.severity, filters.severity))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  const raw = await apiFetch<Incident[] | Page<Incident>>(withQuery(ENDPOINTS.incidents.list, { ...filters }));
  return Array.isArray(raw) ? raw : raw.items;
}

export async function getIncident(id: string): Promise<Incident | null> {
  if (USE_MOCK) {
    await wait(140);
    return incidents.find((i) => i.id === id) ?? null;
  }
  try {
    return await apiFetch<Incident>(ENDPOINTS.incidents.detail(id));
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

export async function addIncidentNote(id: string, author: string, body: string): Promise<Incident | null> {
  if (USE_MOCK) {
    await wait(200);
    const incident = incidents.find((i) => i.id === id);
    if (!incident) return null;
    incident.notes.push({ id: `NOTE-${Date.now()}`, author, body, createdAt: new Date().toISOString() });
    incident.timeline.push({ id: `TL-${Date.now()}`, at: new Date().toISOString(), label: "Note added", detail: body });
    incident.updatedAt = new Date().toISOString();
    addAudit(author, "ADD_INCIDENT_NOTE", "INCIDENT", id, "Investigation note added.");
    return incident;
  }
  return apiFetch<Incident>(`${ENDPOINTS.incidents.detail(id)}/notes`, { method: "POST", body: { author, body } });
}

export async function setIncidentStatus(id: string, status: IncidentStatus, actor: string): Promise<Incident | null> {
  if (USE_MOCK) {
    await wait(200);
    const incident = incidents.find((i) => i.id === id);
    if (!incident) return null;
    incident.status = status;
    incident.approvalPending = false;
    incident.updatedAt = new Date().toISOString();
    incident.timeline.push({ id: `TL-${Date.now()}`, at: incident.updatedAt, label: `Status → ${status}`, detail: `Status updated by ${actor}.` });
    addAudit(actor, "UPDATE_INCIDENT", "INCIDENT", id, `Status changed to ${status}.`);
    return incident;
  }
  return apiFetch<Incident>(ENDPOINTS.incidents.detail(id), { method: "PATCH", body: { status } });
}

/* -------------------------------------------------------- response actions */

export interface ResponseFilters {
  search?: string;
  execution?: string;
  actionType?: string;
}

export async function listResponses(filters: ResponseFilters = {}): Promise<ResponseRecord[]> {
  if (USE_MOCK) {
    await wait(140);
    return [...responses]
      .filter((r) => contains([r.id, r.incidentId, r.targetId, r.requestedBy], filters.search) &&
        matches(r.execution, filters.execution) && matches(r.actionType, filters.actionType))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }
  const raw = await apiFetch<ResponseRecord[] | Page<ResponseRecord>>(withQuery(ENDPOINTS.responseActions.list, { ...filters }));
  return Array.isArray(raw) ? raw : raw.items;
}

export async function getResponse(id: string): Promise<ResponseRecord | null> {
  if (USE_MOCK) {
    await wait(100);
    return responses.find((r) => r.id === id) ?? null;
  }
  try {
    return await apiFetch<ResponseRecord>(ENDPOINTS.responseActions.detail(id));
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

export interface ResponseInput {
  incidentId: string;
  targetId: string;
  actionType: ResponseAction;
  execution: ExecutionType;
  requestedBy: string;
  authorizedBy: string;
  reason?: string;
}

export async function createResponse(input: ResponseInput): Promise<ResponseRecord> {
  // A DRY_RUN action is a no-change action by definition. Normalise here so no
  // caller (or future integration) can accidentally execute it against a device.
  if (input.actionType === "DRY_RUN") input = { ...input, execution: "DRY_RUN" };
  if (USE_MOCK) {
    await wait(320);
    if (!settings.allowedTargets.includes(input.targetId)) {
      addAudit(input.requestedBy, "REQUEST_RESPONSE", "RESPONSE_ACTION", input.targetId, "Target not on the allowlist; request denied.", "DENIED");
      throw new RequestError(422, "TARGET_NOT_ALLOWLISTED", "This target is not on the simulated response allowlist; no action was taken.");
    }
    const record: ResponseRecord = {
      id: `RSP-${nextResponseNumber++}`,
      incidentId: input.incidentId,
      targetId: input.targetId,
      actionType: input.actionType,
      status: "COMPLETED",
      execution: input.execution,
      requestedBy: input.requestedBy,
      authorizedBy: input.authorizedBy,
      result: input.execution === "DRY_RUN" ? "No change made (simulation)" :
        input.actionType === "ISOLATE_DEVICE" ? "Device cannot publish or subscribe (simulated)" :
        "Policy restored (simulated)",
      recovery: input.execution === "DRY_RUN" ? "NOT_APPLICABLE" : input.actionType === "REINSTATE_DEVICE" ? "RECOVERED" : "PENDING",
      timestamp: new Date().toISOString(),
      allowlistChecked: true,
      audited: true,
    };
    responses.unshift(record);
    if (input.execution === "EXECUTED") {
      if (input.actionType === "ISOLATE_DEVICE") await setDeviceSimulationState(input.targetId, "QUARANTINED");
      if (input.actionType === "REINSTATE_DEVICE") await setDeviceSimulationState(input.targetId, "OPERATIONAL");
    }
    const incident = incidents.find((i) => i.id === input.incidentId);
    if (incident) {
      incident.approvalPending = false;
      incident.updatedAt = new Date().toISOString();
      if (input.actionType === "ISOLATE_DEVICE" && input.execution === "EXECUTED") incident.status = "CONTAINED";
      incident.timeline.push({ id: `TL-${Date.now()}`, at: incident.updatedAt, label: `Response ${record.id}`, detail: `${input.actionType} (${input.execution}) authorised by ${input.authorizedBy}.` });
    }
    addAudit(input.authorizedBy, "APPROVE_RESPONSE", "RESPONSE_ACTION", record.id, `${input.actionType} ${input.execution} on allowlisted simulated target ${input.targetId}.`);
    return record;
  }
  return apiFetch<ResponseRecord>(ENDPOINTS.responseActions.list, { method: "POST", body: input });
}

/* -------------------------------------------------------------- audit log */

export async function listAudit(filters: { search?: string; outcome?: string; action?: string } = {}): Promise<AuditEntry[]> {
  if (USE_MOCK) {
    await wait(140);
    return [...audit]
      .filter((a) => contains([a.id, a.actorId, a.entityId, a.details, a.action], filters.search) &&
        matches(a.outcome, filters.outcome) && matches(a.action, filters.action))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  const raw = await apiFetch<AuditEntry[] | Page<AuditEntry>>(withQuery(ENDPOINTS.auditLogs.list, { ...filters }));
  return Array.isArray(raw) ? raw : raw.items;
}

/* ----------------------------------------------------------- users/config */

export async function listUsers(): Promise<User[]> {
  if (USE_MOCK) {
    await wait(100);
    return clone(users);
  }
  const raw = await apiFetch<User[] | Page<User>>(ENDPOINTS.users.list);
  return Array.isArray(raw) ? raw : raw.items;
}

export interface InviteInput { name: string; email: string; role: Role }

export async function inviteUser(input: InviteInput, actor: string): Promise<User> {
  if (USE_MOCK) {
    await wait(240);
    if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new RequestError(409, "DUPLICATE_USER", "A user with this email already exists.");
    }
    const user: User = {
      id: `USR-${String(users.length + 1).padStart(3, "0")}`,
      name: input.name,
      email: input.email,
      role: input.role,
      active: true,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    addAudit(actor, "INVITE_USER", "OTHER", user.id, "Demo invitation recorded; no email was sent.");
    return user;
  }
  return apiFetch<User>(ENDPOINTS.users.list, { method: "POST", body: input });
}

export async function getSettings(): Promise<SystemSettings> {
  if (USE_MOCK) {
    await wait(120);
    return clone(settings);
  }
  return apiFetch<SystemSettings>(ENDPOINTS.settings.get);
}

export async function updateSettings(patch: Partial<SystemSettings>, actor: string): Promise<SystemSettings> {
  if (USE_MOCK) {
    await wait(200);
    settings = { ...settings, ...patch };
    addAudit(actor, "UPDATE_SETTINGS", "OTHER", "-", "Demo configuration updated in memory only.");
    return clone(settings);
  }
  return apiFetch<SystemSettings>(ENDPOINTS.settings.update, { method: "PATCH", body: patch });
}

export async function getDetectionRules(): Promise<DetectionRule[]> {
  await wait(80);
  return clone(FIX.DETECTION_RULES);
}

export function toError(error: unknown): ApiError {
  if (error instanceof RequestError) return { status: error.status, code: error.code, message: error.message };
  return {
    status: 0,
    code: "CLIENT_ERROR",
    message: error instanceof Error ? error.message : "Unexpected client error",
  };
}

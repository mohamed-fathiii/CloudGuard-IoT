/**
 * DEVELOPMENT FIXTURES ONLY — NOT REAL SECURITY DATA.
 *
 * Every record below is synthetic. The application shows a persistent
 * "DEMO DATA" strip whenever this module is used. Risk scores come from a
 * prototype rule-based engine and are triage aids, not validated
 * probabilities of compromise. No real AWS resource is represented here.
 */
import type {
  AuditEntry,
  CloudResource,
  DetectionRule,
  Device,
  Incident,
  ResponseRecord,
  RiskFactor,
  RiskLevel,
  SecurityEvent,
  Session,
  SystemSettings,
  User,
} from "@/lib/types";
import { riskLevel } from "@/lib/format";

const BASE = Date.parse("2026-11-21T14:59:00Z");
const at = (minutesAgo: number) => new Date(BASE - minutesAgo * 60_000).toISOString();

export const USERS: User[] = [
  { id: "USR-001", name: "Admin User", email: "admin@example.com", role: "ADMINISTRATOR", active: true, createdAt: at(60_000) },
  { id: "USR-002", name: "SOC Analyst", email: "analyst@example.com", role: "SECURITY_ANALYST", active: true, createdAt: at(58_000) },
  { id: "USR-003", name: "Cloud Engineer", email: "viewer@example.com", role: "VIEWER", active: true, createdAt: at(55_000) },
  { id: "USR-004", name: "IoT Engineer", email: "iot@example.com", role: "SECURITY_ANALYST", active: false, createdAt: at(50_000) },
  { id: "USR-005", name: "Security Manager", email: "manager@example.com", role: "VIEWER", active: true, createdAt: at(49_000) },
];

export const DEMO_PASSWORD = "demo1234";

export function demoRoleForEmail(email: string): User["role"] {
  if (email.toLowerCase().startsWith("analyst")) return "SECURITY_ANALYST";
  if (email.toLowerCase().startsWith("viewer")) return "VIEWER";
  return "ADMINISTRATOR";
}

export const RULE_DEFINITIONS = [
  { ruleId: "R1", eventType: "ANOMALOUS_TRAFFIC", title: "Excessive publish rate", domain: "IOT", points: 38, detail: "Publish rate exceeded the device baseline" },
  { ruleId: "R2", eventType: "FAILED_LOGIN", title: "Repeated auth failure", domain: "IOT", points: 33, detail: "Repeated failed authentication attempts" },
  { ruleId: "R3", eventType: "UNAUTHORIZED_ACCESS", title: "Unauthorized topic publish", domain: "IOT", points: 42, detail: "Publish to a topic outside the device policy" },
  { ruleId: "R4", eventType: "DATA_EXFILTRATION", title: "Abnormal payload size", domain: "IOT", points: 16, detail: "Payload size deviated from the observed baseline" },
  { ruleId: "R5", eventType: "ANOMALOUS_TRAFFIC", title: "Reconnect storm", domain: "IOT", points: 24, detail: "Connection attempts above the expected rate" },
  { ruleId: "R6", eventType: "CONFIGURATION_CHANGE", title: "New topic subscribed", domain: "IOT", points: 18, detail: "First subscription to a previously unseen topic" },
  { ruleId: "R7", eventType: "DATA_EXFILTRATION", title: "Unexpected destination", domain: "CLOUD", points: 44, detail: "Destination not present in the known-destination set" },
  { ruleId: "R8", eventType: "PRIVILEGE_ESCALATION", title: "Cloud API anomaly", domain: "CROSS_DOMAIN", points: 29, detail: "Cloud API call pattern did not match the device identity" },
] as const;

export const DETECTION_RULES: DetectionRule[] = RULE_DEFINITIONS.map((r) => ({
  id: r.ruleId,
  name: r.title,
  domain: r.domain,
  description: r.detail,
  enabled: true,
  weight: r.points,
}));

const DEVICE_SEED = [
  ["ESP32-01", "dev-100", "SENSOR", "ONLINE", false, "TESTING", 2, 24, "Lab A"],
  ["ESP32-02", "dev-101", "SENSOR", "ONLINE", false, "TESTING", 1, 31, "Lab A"],
  ["ESP32-03", "dev-102", "SENSOR", "ONLINE", false, "TESTING", 4, 12, "Lab B"],
  ["SIM-04", "dev-103", "OTHER", "ONLINE", true, "SIMULATION", 1, 18, "Simulator"],
  ["SIM-05", "dev-104", "OTHER", "ONLINE", true, "SIMULATION", 3, 9, "Simulator"],
  ["SIM-06", "dev-105", "OTHER", "ONLINE", true, "SIMULATION", 0, 67, "Simulator"],
  ["SIM-07", "dev-106", "OTHER", "ONLINE", true, "SIMULATION", 14, 88, "Simulator"],
  ["SIM-08", "dev-107", "OTHER", "OFFLINE", true, "SIMULATION", 120, 41, "Simulator"],
  ["SIM-09", "dev-108", "OTHER", "ONLINE", true, "SIMULATION", 2, 27, "Simulator"],
  ["SIM-10", "dev-109", "OTHER", "ONLINE", true, "SIMULATION", 5, 15, "Simulator"],
] as const;

export const DEVICES: Device[] = DEVICE_SEED.map((d, i) => {
  const score = d[7];
  return {
    id: d[0],
    deviceName: `${d[0]} · ${d[1]}`,
    deviceType: d[2],
    model: i < 3 ? "ESP32-WROOM" : "Simulation profile",
    status: d[3],
    simulationState: d[0] === "SIM-07" ? "QUARANTINED" : "OPERATIONAL",
    environment: d[5],
    isSimulated: d[4],
    lastSeenAt: at(d[6]),
    riskScore: score,
    riskLevel: riskLevel(score),
    incidentCount: d[0] === "SIM-07" || d[0] === "SIM-06" ? 1 : 0,
    firmwareVersion: i < 3 ? "esp32-idf-4.4" : "simulator-1.2",
    location: d[8],
    topicNamespace: `devices/${d[1]}/telemetry`,
    baseline: {
      messageRate: 12 + i,
      payloadSize: 256 + i * 32,
      allowedTopics: [`devices/${d[1]}/telemetry`, `devices/${d[1]}/status`],
      reconnectRate: 1 + (i % 3),
      observedWindow: "7 days (sample)",
    },
  };
});

export const CLOUD_RESOURCES: CloudResource[] = [
  { id: "CRS-001", resourceName: "iot-ingest-topic", resourceType: "OTHER", provider: "AWS", providerResourceId: "sim-topic-iot-ingest", region: "eu-west-1", environment: "SIMULATION", status: "ACTIVE", simulated: true, lastScannedAt: at(3) },
  { id: "CRS-002", resourceName: "event-normalizer", resourceType: "LAMBDA", provider: "AWS", providerResourceId: "sim-lambda-normalizer", region: "eu-west-1", environment: "SIMULATION", status: "ACTIVE", simulated: true, lastScannedAt: at(9) },
  { id: "CRS-003", resourceName: "event-store", resourceType: "RDS", provider: "AWS", providerResourceId: "sim-db-event-store", region: "eu-west-1", environment: "SIMULATION", status: "ACTIVE", simulated: true, lastScannedAt: at(12) },
];

const PROCESSING_CYCLE = ["PROCESSED", "PROCESSING", "PROCESSED", "FAILED", "PROCESSED", "PROCESSED", "PROCESSED", "PROCESSING"] as const;

export const EVENTS: SecurityEvent[] = Array.from({ length: 42 }, (_, i) => {
  const device = DEVICES[(i * 3) % DEVICES.length];
  const rule = RULE_DEFINITIONS[i % RULE_DEFINITIONS.length];
  const score = Math.min(100, Math.max(3, rule.points + ((i * 7) % 29) - 12));
  const factors: RiskFactor[] = [
    { ruleId: rule.ruleId, label: rule.title, points: rule.points, detail: rule.detail },
  ];
  if (score > 60) {
    factors.push({ ruleId: "BASE", label: "Baseline deviation", points: Math.max(4, score - rule.points), detail: "Observed values exceeded the device baseline" });
  }
  if (rule.domain !== "IOT") {
    factors.push({ ruleId: "DOM", label: "Cross-domain match", points: 8, detail: "Correlated with activity from the second domain" });
  }
  const explanation = `${rule.title} matched rule ${rule.ruleId} (${rule.points} points). ${factors.length > 1 ? `${factors.slice(1).map((f) => `${f.label} added ${f.points} points`).join("; ")}.` : "No additional factors were present."} Recorded score: ${score}/100.`;
  return {
    id: `EVT-${String(1000 + i).padStart(4, "0")}`,
    eventType: rule.eventType,
    ruleId: rule.ruleId,
    title: `${rule.title} · ${device.id}`,
    description: `${rule.title} observed on ${device.id}. ${rule.detail.toLowerCase()}.`,
    sourceType: rule.domain === "CLOUD" ? "CLOUD_RESOURCE" : rule.domain === "CROSS_DOMAIN" ? "SYSTEM" : "IOT_DEVICE",
    deviceId: device.id,
    resourceId: rule.domain === "CLOUD" ? CLOUD_RESOURCES[0].id : null,
    detectedAt: at(i * 7 + 2),
    riskScore: score,
    severity: riskLevel(score),
    processingState: PROCESSING_CYCLE[i % PROCESSING_CYCLE.length],
    simulated: true,
    factors,
    explanation,
    incidentId: i % 11 === 0 ? "INC-1042" : i % 13 === 0 ? "INC-1041" : null,
  };
});

export const INCIDENTS: Incident[] = [
  {
    id: "INC-1042",
    title: "Cross-domain: abnormal MQTT traffic + suspicious IAM calls",
    description: "Publish rate far above baseline, then publishes to topics outside the device policy.",
    deviceId: "SIM-07",
    severity: "CRITICAL",
    status: "INVESTIGATING",
    riskScore: 88,
    openedAt: at(62),
    updatedAt: at(56),
    assignedTo: "analyst@example.com",
    relatedEventIds: EVENTS.filter((e) => e.deviceId === "SIM-07").slice(0, 4).map((e) => e.id),
    notes: [{ id: "NOTE-01", author: "analyst@example.com", body: "Escalated for isolation review. Evidence preserved.", createdAt: at(58) }],
    timeline: [
      { id: "TL-01", at: at(62), label: "Incident opened", detail: "Correlation grouped four related events within the configured window." },
      { id: "TL-02", at: at(59), label: "Risk score assigned", detail: "Score 88/100 with written explanation from the rule engine." },
      { id: "TL-03", at: at(56), label: "Isolation executed", detail: "Simulated deny-all policy applied; device state set to QUARANTINED." },
    ],
    approvalPending: false,
  },
  {
    id: "INC-1041",
    title: "Unauthorized topic publish attempts",
    description: "Repeated publishes to topics outside the device namespace.",
    deviceId: "SIM-06",
    severity: "HIGH",
    status: "OPEN",
    riskScore: 67,
    openedAt: at(79),
    updatedAt: at(70),
    assignedTo: null,
    relatedEventIds: EVENTS.filter((e) => e.deviceId === "SIM-06").slice(0, 3).map((e) => e.id),
    notes: [],
    timeline: [
      { id: "TL-04", at: at(79), label: "Incident opened", detail: "Three correlated events." },
      { id: "TL-05", at: at(75), label: "Response requested", detail: "Isolation request created; approval pending." },
    ],
    approvalPending: true,
  },
  {
    id: "INC-1039",
    title: "Reconnect storm on sensor node",
    description: "Connection attempts rose above the expected rate and returned to baseline after review.",
    deviceId: "ESP32-02",
    severity: "MEDIUM",
    status: "RESOLVED",
    riskScore: 41,
    openedAt: at(1500),
    updatedAt: at(1400),
    assignedTo: "analyst@example.com",
    relatedEventIds: EVENTS.filter((e) => e.deviceId === "ESP32-02").slice(0, 2).map((e) => e.id),
    notes: [{ id: "NOTE-02", author: "manager@example.com", body: "Reviewed and closed. No device action required.", createdAt: at(1410) }],
    timeline: [
      { id: "TL-06", at: at(1500), label: "Incident opened", detail: "Reconnect storm detected." },
      { id: "TL-07", at: at(1400), label: "Resolved", detail: "Behaviour returned to baseline." },
    ],
    approvalPending: false,
  },
];

export const RESPONSES: ResponseRecord[] = [
  { id: "RSP-221", incidentId: "INC-1042", targetId: "SIM-07", actionType: "ISOLATE_DEVICE", status: "COMPLETED", execution: "EXECUTED", requestedBy: "analyst@example.com", authorizedBy: "admin@example.com", result: "Device cannot publish or subscribe (simulated)", recovery: "PENDING", timestamp: at(56), allowlistChecked: true, audited: true },
  { id: "RSP-220", incidentId: "INC-1041", targetId: "SIM-06", actionType: "DRY_RUN", status: "COMPLETED", execution: "DRY_RUN", requestedBy: "analyst@example.com", authorizedBy: "admin@example.com", result: "No change made", recovery: "NOT_APPLICABLE", timestamp: at(74), allowlistChecked: true, audited: true },
  { id: "RSP-214", incidentId: "INC-1039", targetId: "ESP32-02", actionType: "REINSTATE_DEVICE", status: "COMPLETED", execution: "EXECUTED", requestedBy: "manager@example.com", authorizedBy: "admin@example.com", result: "Policy restored; simulated certificate rotation", recovery: "RECOVERED", timestamp: at(1400), allowlistChecked: true, audited: true },
];

export const AUDIT_ENTRIES: AuditEntry[] = [
  { id: "AUD-9001", createdAt: at(56), actorId: "admin@example.com", action: "APPROVE_RESPONSE", entityType: "RESPONSE_ACTION", entityId: "RSP-221", outcome: "SUCCESS", details: "Isolation approved and executed in simulation." },
  { id: "AUD-9000", createdAt: at(58), actorId: "analyst@example.com", action: "REQUEST_RESPONSE", entityType: "RESPONSE_ACTION", entityId: "RSP-221", outcome: "SUCCESS", details: "Isolation requested for SIM-07." },
  { id: "AUD-8999", createdAt: at(62), actorId: "engine", action: "CREATE_INCIDENT", entityType: "INCIDENT", entityId: "INC-1042", outcome: "SUCCESS", details: "Incident created by correlation." },
  { id: "AUD-8998", createdAt: at(74), actorId: "admin@example.com", action: "APPROVE_DRY_RUN", entityType: "RESPONSE_ACTION", entityId: "RSP-220", outcome: "SUCCESS", details: "Dry run authorised; no device state changed." },
  { id: "AUD-8997", createdAt: at(90), actorId: "viewer@example.com", action: "VIEW_AUDIT_LOG", entityType: "AUDIT_LOG", entityId: "-", outcome: "DENIED", details: "VIEWER attempted an administrator-only operation." },
  { id: "AUD-8996", createdAt: at(120), actorId: "unknown", action: "LOGIN", entityType: "OTHER", entityId: "-", outcome: "FAILURE", details: "Failed login attempt recorded in the demo dataset." },
];

export const SETTINGS: SystemSettings = {
  riskThresholds: {
    LOW: { min: 0, max: 29 },
    MEDIUM: { min: 30, max: 59 },
    HIGH: { min: 60, max: 79 },
    CRITICAL: { min: 80, max: 100 },
  },
  correlationWindowMinutes: 15,
  allowedTargets: DEVICES.map((d) => d.id),
  responseMode: "APPROVAL_REQUIRED",
  cooldownMinutes: 15,
  retentionDays: 30,
  awsIntegration: "SIMULATED",
};

export const RISK_LEVELS: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function makeDemoSession(email: string, role: User["role"]): Session {
  const name = role === "ADMINISTRATOR" ? "Administrator" : role === "SECURITY_ANALYST" ? "Security Analyst" : "Viewer";
  return {
    user: { id: `DEMO-${role.slice(0, 3)}`, name, email, role, active: true, createdAt: new Date().toISOString() },
    token: `demo.${role.toLowerCase()}.${Date.now()}`,
    expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
  };
}

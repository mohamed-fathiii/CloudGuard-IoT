/**
 * Domain types for the CloudGuard IoT frontend.
 *
 * Canonical sources: `Database-Design/Data-Dictionary.docx` (physical schema
 * and controlled vocabularies), decision records D-05/D-06/D-07/D-10/D-13 in
 * `01-System-Analysis/00-System-Analysis-Phase-Report.md`, and the canonical
 * `Implementation/00-Implementation-Plan.md`.
 *
 * API values are UPPER_SNAKE_CASE. The UI renders title-case labels via
 * `humanize()`. Fields marked UI-ONLY are presentation state and are not
 * assumed to be part of a backend response.
 *
 * The API doc is explicitly PROPOSED; nothing here is a deployed contract
 * until the backend team confirms it. See `docs/API-INTEGRATION.md`.
 */

export type Role = "ADMINISTRATOR" | "SECURITY_ANALYST" | "VIEWER";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Severity = RiskLevel;

/** Canonical `device.status` values. */
export type DeviceStatus = "ONLINE" | "OFFLINE" | "COMPROMISED" | "MAINTENANCE" | "DECOMMISSIONED";
/** Simulated policy state written by a response action (D-10). UI-ONLY unless backend exposes it. */
export type SimulationState = "OPERATIONAL" | "QUARANTINED";
export type DeviceType = "SENSOR" | "CAMERA" | "GATEWAY" | "ACTUATOR" | "SMART_LOCK" | "OTHER";
export type Environment = "DEVELOPMENT" | "TESTING" | "STAGING" | "PRODUCTION" | "SIMULATION";

/** Canonical `security_event.source_type`. */
export type EventSourceType = "IOT_DEVICE" | "CLOUD_RESOURCE" | "SYSTEM";
export type EventType =
  | "UNAUTHORIZED_ACCESS" | "FAILED_LOGIN" | "MALWARE_DETECTED" | "ANOMALOUS_TRAFFIC"
  | "PORT_SCAN" | "PRIVILEGE_ESCALATION" | "CONFIGURATION_CHANGE" | "DATA_EXFILTRATION"
  | "FIRMWARE_TAMPERING" | "OTHER";
/** Prototype triage state; UI-ONLY, not a canonical `security_event` field. */
export type ProcessingState = "PROCESSED" | "PROCESSING" | "FAILED";

/** Canonical `incident.status`. */
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "CONTAINED" | "RESOLVED" | "CLOSED" | "FALSE_POSITIVE";
/** Canonical `response_action.status`. */
export type ResponseStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
/** Plan Step 7 MVP action set; canonical `action_type` values are listed in API-INTEGRATION.md. */
export type ResponseAction = "ISOLATE_DEVICE" | "REINSTATE_DEVICE" | "DRY_RUN";
export type ExecutionType = "EXECUTED" | "DRY_RUN";

export type CloudResourceType = "EC2" | "S3" | "IAM" | "LAMBDA" | "RDS" | "VPC" | "CLOUDFRONT" | "OTHER";
export type CloudResourceStatus = "ACTIVE" | "INACTIVE" | "TERMINATED" | "ERROR";
export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILURE";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Session {
  user: User;
  token: string;
  expiresAt: string;
}

export interface DeviceBaseline {
  messageRate: number;
  payloadSize: number;
  allowedTopics: string[];
  reconnectRate: number;
  observedWindow: string;
}

export interface Device {
  id: string;
  deviceName: string;
  deviceType: DeviceType;
  model: string;
  status: DeviceStatus;
  simulationState: SimulationState;
  environment: Environment;
  isSimulated: boolean;
  lastSeenAt: string;
  riskScore: number;
  riskLevel: RiskLevel;
  incidentCount: number;
  firmwareVersion: string;
  location: string;
  topicNamespace: string;
  baseline: DeviceBaseline;
}

export interface CloudResource {
  id: string;
  resourceName: string;
  resourceType: CloudResourceType;
  provider: "AWS";
  providerResourceId: string;
  region: string;
  environment: Environment;
  status: CloudResourceStatus;
  simulated: true;
  lastScannedAt: string;
}

export interface RiskFactor {
  ruleId: string;
  label: string;
  points: number;
  detail: string;
}

export interface SecurityEvent {
  id: string;
  eventType: EventType | string;
  ruleId: string;
  title: string;
  description: string;
  sourceType: EventSourceType;
  deviceId?: string | null;
  resourceId?: string | null;
  detectedAt: string;
  riskScore: number;
  severity: Severity;
  processingState: ProcessingState;
  simulated: boolean;
  factors: RiskFactor[];
  explanation: string;
  incidentId?: string | null;
}

export interface IncidentNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  at: string;
  label: string;
  detail: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  deviceId: string;
  severity: Severity;
  status: IncidentStatus;
  riskScore: number;
  openedAt: string;
  updatedAt: string;
  assignedTo: string | null;
  relatedEventIds: string[];
  notes: IncidentNote[];
  timeline: TimelineEntry[];
  approvalPending: boolean;
}

export interface ResponseRecord {
  id: string;
  incidentId: string;
  targetId: string;
  actionType: ResponseAction;
  status: ResponseStatus;
  execution: ExecutionType;
  requestedBy: string;
  authorizedBy: string;
  result: string;
  recovery: "PENDING" | "RECOVERED" | "NOT_APPLICABLE";
  timestamp: string;
  allowlistChecked: boolean;
  audited: boolean;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  details: string;
}

export interface DetectionRule {
  id: string;
  name: string;
  domain: "IOT" | "CLOUD" | "CROSS_DOMAIN";
  description: string;
  enabled: boolean;
  weight: number;
}

/** Derived, read-only view model for the dashboard. Not a backend table. */
export interface DashboardSummary {
  totalDevices: number;
  totalCloudResources: number;
  totalSecurityEvents: number;
  criticalEvents: number;
  openIncidents: number;
  approvalsPending: number;
  simulatedDevices: number;
  riskDistribution: Record<RiskLevel, number>;
  severityDistribution: Record<RiskLevel, number>;
  deviceStatusDistribution: Record<string, number>;
  simulationStateDistribution: Record<string, number>;
  trend: { label: string; events: number; critical: number }[];
}

export interface SystemSettings {
  riskThresholds: Record<RiskLevel, { min: number; max: number }>;
  correlationWindowMinutes: number;
  allowedTargets: string[];
  responseMode: "APPROVAL_REQUIRED" | "GUARDED_AUTOMATIC";
  cooldownMinutes: number;
  retentionDays: number;
  awsIntegration: "SIMULATED" | "NOT_CONNECTED";
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

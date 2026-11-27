/**
 * ================================================================
 *  Audit helper — سجل غير قابل للتعديل
 * ================================================================
 *  `audit_log` append-only: مفيش UPDATE ولا DELETE في أي مكان في الكود.
 *  الـ helper ده هو المدخل الوحيد للجدول.
 *
 *  الحقول مطابقة للـ schema: actor_type, actor_id, action,
 *  entity_type (polymorphic بدون FK), entity_id, details, ip_address
 */

import { db } from "@/db";
import { auditLog, type NewAuditLog } from "@/db/schema";

export interface AuditParams {
  actorType?: "USER" | "SYSTEM" | "DEVICE" | "SERVICE";
  actorId: string;
  action: string;
  entityType?:
    | "DEVICE"
    | "CLOUD_RESOURCE"
    | "SECURITY_EVENT"
    | "RISK_ASSESSMENT"
    | "INCIDENT"
    | "INCIDENT_EVENT"
    | "RESPONSE_ACTION"
    | "AUDIT_LOG"
    | "OTHER";
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function audit(params: AuditParams) {
  const row: NewAuditLog = {
    actorType: params.actorType ?? "SYSTEM",
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details ?? {},
    ipAddress: params.ipAddress,
  };

  /* الـ audit مايفشلش العملية الأساسية */
  try {
    await db.insert(auditLog).values(row);
  } catch (e) {
    console.error("[audit] فشل تسجيل العملية:", e);
  }
}

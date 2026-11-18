import { NextResponse } from "next/server";
import { db } from "@/db";
import { riskAssessments, devices, securityEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const riskSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  riskScore: z.number().min(0).max(100),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  triggeredRules: z.array(z.string()),
  explanation: z.array(z.string()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = riskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.error.format() }, { status: 400 });
    }

    const data = validation.data;

    // 1. حفظ تقييم الخطورة
    await db.insert(riskAssessments).values({
      id: data.id,
      eventId: data.eventId,
      riskScore: data.riskScore,
      severity: data.severity,
      triggeredRules: data.triggeredRules,
      explanation: data.explanation,
    });

    // 2. تحديث درجة خطورة الجهاز المرتبط بالحدث
    const event = await db.query.securityEvents.findFirst({
      where: eq(securityEvents.id, data.eventId),
    });

    if (event) {
      await db
        .update(devices)
        .set({ riskScore: data.riskScore, lastSeen: new Date() })
        .where(eq(devices.id, event.deviceId));
    }

    return NextResponse.json({ success: true, message: "Risk assessment saved" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const assessments = await db.select().from(riskAssessments);
    return NextResponse.json({ success: true, data: assessments }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { db } from "@/db";
import { securityEvents, devices } from "@/db/schema";
import { z } from "zod";

// قالب التحقق من صحة البيانات باستخدام Zod (عشان نضمن إن محدش يبعت بيانات ناقصة أو غلط)
const eventSchema = z.object({
  eventId: z.string().min(1),
  deviceId: z.string().min(1),
  eventType: z.string().min(1),
  topic: z.string().optional(),
  payloadSize: z.number().optional(),
  sourceType: z.enum(["AWS_IOT", "SIMULATOR", "AWS_CLOUD"]),
  correlationId: z.string().optional(),
  timestamp: z.string(),
});

// 1. استقبال وتخزين حدث أمني جديد (POST Request)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // التحقق من البيانات
    const validation = eventSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "Invalid event data", errors: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // نتأكد الأول إن الجهاز مسجل في قاعدة البيانات، لو مش مسجل نسجله تلقائياً عشان ميبحصلش خطأ
    const existingDevice = await db.query.devices.findFirst({
      where: (devices, { eq }) => eq(devices.id, data.deviceId),
    });

    if (!existingDevice) {
      await db.insert(devices).values({
        id: data.deviceId,
        name: `Device ${data.deviceId}`,
        status: "ONLINE",
      });
    }

    // حفظ الحدث الأمني في قاعدة البيانات
    await db.insert(securityEvents).values({
      id: data.eventId,
      deviceId: data.deviceId,
      eventType: data.eventType,
      topic: data.topic,
      payloadSize: data.payloadSize,
      sourceType: data.sourceType,
      correlationId: data.correlationId,
      timestamp: new Date(data.timestamp),
    });

    return NextResponse.json(
      { success: true, message: "Security event stored successfully" },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error saving event:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error", error: error.message },
      { status: 500 }
    );
  }
}

// 2. استعراض الأحداث الأمنية (GET Request) عشان M3 يقدر يعرضها في الـ Dashboard
export async function GET() {
  try {
    const events = await db.select().from(securityEvents).orderBy(securityEvents.createdAt);
    return NextResponse.json({ success: true, data: events }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch events", error: error.message },
      { status: 500 }
    );
  }
}
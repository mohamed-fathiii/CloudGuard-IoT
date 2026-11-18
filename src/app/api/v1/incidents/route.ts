import { NextResponse } from "next/server";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { z } from "zod";

const incidentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["OPEN", "INVESTIGATING", "CONTAINED", "RECOVERED", "CLOSED"]).default("OPEN"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  deviceId: z.string().optional(),
  assignedAnalyst: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = incidentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.error.format() }, { status: 400 });
    }

    await db.insert(incidents).values(validation.data);
    return NextResponse.json({ success: true, message: "Incident created" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const allIncidents = await db.select().from(incidents);
    return NextResponse.json({ success: true, data: allIncidents }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
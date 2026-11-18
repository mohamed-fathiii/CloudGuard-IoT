import { NextResponse } from "next/server";
import { db } from "@/db";
import { devices } from "@/db/schema";

export async function GET() {
  try {
    const allDevices = await db.select().from(devices);
    return NextResponse.json({ success: true, data: allDevices }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch devices", error: error.message },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({ message: "Pipeline extraction endpoint is not configured yet." }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ message: "Pipeline extraction endpoint is not configured yet." }, { status: 501 });
}

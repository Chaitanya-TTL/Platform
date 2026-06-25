import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fileExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const candidates = [
    path.resolve(process.cwd(), "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"),
    path.resolve(process.cwd(), "..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"),
    path.resolve(process.cwd(), "..", "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const content = await fs.readFile(candidate, "utf8");
      return NextResponse.json(JSON.parse(content));
    }
  }

  return NextResponse.json(
    { error: "Extraction file not yet available" },
    { status: 404 }
  );
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

async function fileExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function extractionCandidates() {
  const configured = process.env.TC_EXTRACTION_PATH?.trim();
  const localCandidates = [
    ["..", "..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"],
    ["..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"],
    ["..", "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "tc_extraction.json"],
  ];

  return [
    ...(configured ? [configured] : []),
    ...localCandidates.map((segments) =>
      path.resolve(
        /* turbopackIgnore: true */ process.cwd(),
        ...segments,
      ),
    ),
  ];
}

export async function GET() {
  for (const candidate of extractionCandidates()) {
    if (await fileExists(candidate)) {
      const content = await fs.readFile(candidate, "utf8");
      return NextResponse.json(JSON.parse(content));
    }
  }

  return NextResponse.json(
    {
      error: "Extraction file not yet available",
      hint: "Set TC_EXTRACTION_PATH on hosted environments when the extractor file is mounted outside the frontend project.",
    },
    { status: 404 },
  );
}

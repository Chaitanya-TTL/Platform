import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const execFileAsync = promisify(execFile);

async function fileExists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findPythonExecutable(scriptDir: string) {
  const candidates = [
    path.resolve(scriptDir, ".venv", "Scripts", "python.exe"),
    path.resolve(scriptDir, ".venv", "bin", "python"),
    "python",
    "python3",
  ];

  for (const candidate of candidates) {
    if (candidate === "python" || candidate === "python3") {
      try {
        await execFileAsync(candidate, ["--version"]);
        return candidate;
      } catch {
        continue;
      }
    }

    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const partId = request.nextUrl.searchParams.get("partId");
  const debug = request.nextUrl.searchParams.get("debug");

  if (!partId) {
    return NextResponse.json({ error: "partId is required." }, { status: 400 });
  }

  async function findScriptDir(startDir: string) {
    let current = path.resolve(startDir);
    for (let i = 0; i < 6; i += 1) {
      const candidate = path.resolve(current, "windchill_extractor");
      if (await fileExists(candidate)) {
        return candidate;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  const scriptDir = await findScriptDir(process.cwd());
  if (!scriptDir) {
    return NextResponse.json({ error: "Unable to locate windchill_extractor directory from the frontend runtime." }, { status: 500 });
  }

  const scriptPath = path.resolve(scriptDir, "extractor.py");
  const outputPath = path.resolve(scriptDir, "windchill_extraction.json");

  if (!(await fileExists(scriptPath))) {
    return NextResponse.json({ error: "Windchill extractor script not found." }, { status: 500 });
  }

  const python = await findPythonExecutable(scriptDir);
  if (!python) {
    return NextResponse.json({ error: "Unable to find Python executable for Windchill extraction." }, { status: 500 });
  }

  try {
    await execFileAsync(python, [
      scriptPath,
      "--part-id",
      partId,
      "--output",
      outputPath,
    ], {
      cwd: scriptDir,
      timeout: 5 * 60 * 1000,
    });

    const content = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(content);

    if (debug === "1") {
      const rawPath = path.resolve(scriptDir, "windchill_extraction_raw.json");
      let raw: unknown = null;
      if (await fileExists(rawPath)) {
        try {
          raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
        } catch {
          raw = null;
        }
      }
      return NextResponse.json({ python, script: scriptPath, raw, normalized: parsed });
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to run extraction.";
    return NextResponse.json({ error: `Windchill extraction failed: ${message}` }, { status: 500 });
  }
}

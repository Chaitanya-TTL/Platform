import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const execFileAsync = promisify(execFile);

type Operation = "extract" | "versions" | "structure" | "compare" | "change-impact" | "search";

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
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function findScriptDir(startDir: string) {
  let current = path.resolve(startDir);
  for (let index = 0; index < 6; index += 1) {
    const candidate = path.resolve(current, "windchill_extractor");
    if (await fileExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function operationOf(request: NextRequest): Operation {
  const value = request.nextUrl.searchParams.get("operation");
  return value === "versions" || value === "structure" || value === "compare" || value === "change-impact" || value === "search"
    ? value
    : "extract";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const partId = params.get("partId")?.trim();
  const query = params.get("query")?.trim();
  const operation = operationOf(request);
  if (operation === "search" && !query) {
    return NextResponse.json({ error: "query is required." }, { status: 400 });
  }
  if (operation !== "search" && !partId) {
    return NextResponse.json({ error: "partId is required." }, { status: 400 });
  }

  const fromVersion = params.get("from")?.trim();
  const toVersion = params.get("to")?.trim();
  const version = params.get("version")?.trim();
  if (operation === "compare" && (!fromVersion || !toVersion)) {
    return NextResponse.json(
      { error: "from and to versions are required." },
      { status: 400 },
    );
  }
  if (operation === "compare" && fromVersion === toVersion) {
    return NextResponse.json(
      { error: "from and to versions must be different." },
      { status: 400 },
    );
  }

  const scriptDir = await findScriptDir(process.cwd());
  if (!scriptDir) {
    return NextResponse.json(
      { error: "Unable to locate windchill_extractor directory." },
      { status: 500 },
    );
  }
  const scriptPath = path.resolve(scriptDir, "extractor.py");
  const python = await findPythonExecutable(scriptDir);
  if (!(await fileExists(scriptPath)) || !python) {
    return NextResponse.json(
      { error: "Windchill extractor runtime is unavailable." },
      { status: 500 },
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "windchill-"));
  const outputPath = path.join(tempDir, "result.json");
  const args = [
    scriptPath,
    "--operation",
    operation,
    "--part-id",
    partId ?? "",
    "--output",
    outputPath,
  ];
  if (query) args.push("--query", query);
  if (version) args.push("--version", version);
  if (fromVersion) args.push("--from-version", fromVersion);
  if (toVersion) args.push("--to-version", toVersion);

  try {
    await execFileAsync(python, args, {
      cwd: scriptDir,
      timeout: operation === "compare" || operation === "change-impact" ? 10 * 60 * 1000 : 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    const parsed: unknown = JSON.parse(await fs.readFile(outputPath, "utf8"));
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : error instanceof Error
          ? error.message
          : "Unable to run extraction.";
    const safeMessage = detail.split("\n").filter(Boolean).slice(-1)[0] ?? detail;
    return NextResponse.json(
      { error: `Windchill ${operation} failed: ${safeMessage}` },
      { status: 502 },
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

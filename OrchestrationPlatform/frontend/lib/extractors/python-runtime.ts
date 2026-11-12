import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
type PythonProbe = (candidate: string) => Promise<boolean>;

async function exists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function localPythonCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];

  const pythonDirectory = path.join(localAppData, "Programs", "Python");
  let entries: Dirent[];
  try {
    entries = await fs.readdir(pythonDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && /^Python\d+$/i.test(entry.name))
    .map((entry) => path.join(pythonDirectory, entry.name, "python.exe"))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

async function isRunnable(candidate: string) {
  try {
    await execFileAsync(candidate, ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function findPythonExecutable(
  extractorDir: string,
  probe: PythonProbe = isRunnable,
) {
  const candidates = [
    process.env.PYTHON_EXECUTABLE,
    path.resolve(extractorDir, ".venv", "Scripts", "python.exe"),
    path.resolve(extractorDir, ".venv", "bin", "python"),
    "python",
    "python3",
    ...(await localPythonCandidates()),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !(await exists(candidate))) continue;
    if (await probe(candidate)) return candidate;
  }

  return null;
}

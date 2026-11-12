import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findPythonExecutable } from "@/lib/extractors/python-runtime";

const run = promisify(execFile);

async function exists(candidate: string) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function locate() {
  let current = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    const directory = path.join(current, "windchill_extractor");
    if (await exists(path.join(directory, "requirements_extractor.py"))) {
      return directory;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Windchill extractor unavailable.");
}

export async function windchillContent(args: string[]) {
  const directory = await locate();
  const python = await findPythonExecutable(directory);
  if (!python) throw new Error("Windchill Python runtime is unavailable.");

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "wc-content-"));
  const output = path.join(tempDirectory, "file.bin");
  const metadata = path.join(tempDirectory, "meta.json");
  try {
    await run(
      python,
      [
        path.join(directory, "requirements_extractor.py"),
        ...args,
        "--output",
        output,
        "--metadata-output",
        metadata,
      ],
      { cwd: directory, timeout: 120_000, maxBuffer: 1024 * 1024 },
    );
    return {
      bytes: await fs.readFile(output),
      meta: JSON.parse(await fs.readFile(metadata, "utf8")),
    };
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

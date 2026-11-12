import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findPythonExecutable } from "./python-runtime";

describe("findPythonExecutable", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("falls back to an installed per-user Python when PATH has no Python", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "python-runtime-"));
    temporaryDirectories.push(root);
    const localAppData = path.join(root, "local");
    const extractorDir = path.join(root, "configit_extractor");
    const python = path.join(localAppData, "Programs", "Python", "Python313", "python.exe");
    await mkdir(path.dirname(python), { recursive: true });
    await mkdir(extractorDir, { recursive: true });
    await writeFile(python, "");
    vi.stubEnv("LOCALAPPDATA", localAppData);

    const resolved = await findPythonExecutable(extractorDir, async (candidate) =>
      candidate === python,
    );

    expect(resolved).toBe(python);
  });
});

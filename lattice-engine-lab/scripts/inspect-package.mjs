import { execFileSync } from "node:child_process";
import process from "node:process";

const specification = process.argv[2];
if (!specification) {
  throw new Error("Usage: node inspect-package.mjs package@version");
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const raw = execFileSync(npmExecutable, ["view", specification, "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const data = JSON.parse(raw);
const report = {
  inspectedAt: new Date().toISOString(),
  specification,
  name: data.name,
  version: data.version,
  publicationDate: data.time?.[data.version] ?? null,
  license: data.license ?? null,
  engines: data.engines ?? null,
  peerDependencies: data.peerDependencies ?? null,
  peerDependenciesMeta: data.peerDependenciesMeta ?? null,
  lifecycleScripts: data.scripts ?? null,
  integrity: data.dist?.integrity ?? null,
  shasum: data.dist?.shasum ?? null,
  tarball: data.dist?.tarball ?? null,
  unpackedSize: data.dist?.unpackedSize ?? null,
  dependencies: data.dependencies ?? null,
};
process.stdout.write(JSON.stringify(report, null, 2));

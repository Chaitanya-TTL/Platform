import { promises as fs } from "node:fs";
import path from "node:path";
export const evidenceRoot = path.resolve(process.env.LATTICE_EVIDENCE_DATA_DIR?.trim() || path.join(process.cwd(), ".lattice-data", "evidence"));
export const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_");
export async function readJson<T>(file: string): Promise<T | undefined> { try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw e; } }
export async function atomicJson(file: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); const temp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, JSON.stringify(value), "utf8"); await fs.rename(temp,file); }
export async function atomicBytes(file: string, value: Uint8Array): Promise<void> { await fs.mkdir(path.dirname(file), { recursive: true }); const temp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp,value); await fs.rename(temp,file); }

import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvidenceArtifact, EvidenceArtifactStore } from "../../ports/evidence-artifact-store";
import { atomicBytes, atomicJson, evidenceRoot, readJson, safeSegment } from "./evidence-storage-utils";
export class FileEvidenceArtifactStore implements EvidenceArtifactStore {
  private base(id:string){ return path.join(evidenceRoot,"artifacts",safeSegment(id)); }
  async put(a:EvidenceArtifact):Promise<"created"|"existing"> { const base=this.base(a.artifactId); try { await fs.access(`${base}.bin`); return "existing"; } catch {} await atomicBytes(`${base}.bin`,a.bytes); await atomicJson(`${base}.meta.json`,{artifactId:a.artifactId,mediaType:a.mediaType,byteLength:a.bytes.byteLength}); return "created"; }
  async get(id:string):Promise<EvidenceArtifact|undefined>{ const meta=await readJson<{artifactId:string;mediaType:string}>(`${this.base(id)}.meta.json`); if(!meta)return undefined; try{return{...meta,bytes:new Uint8Array(await fs.readFile(`${this.base(id)}.bin`))};}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw e;} }
}

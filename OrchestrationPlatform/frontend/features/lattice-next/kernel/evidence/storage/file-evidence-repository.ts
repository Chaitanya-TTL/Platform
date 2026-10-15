import path from "node:path";
import type { AcceptedEvidenceEnvelope, EvidenceId, EvidenceRejection } from "../evidence-contracts";
import type { EvidenceManifestEntry, EvidenceQuery, EvidenceRepository } from "../../ports/evidence-repository";
import { hashEvidencePayload } from "../evidence-hasher";
import { atomicJson, evidenceRoot, readJson, safeSegment } from "./evidence-storage-utils";

interface Manifest { version:1; entries:EvidenceManifestEntry[] }
export class EvidenceIntegrityError extends Error {}
export class FileEvidenceRepository implements EvidenceRepository {
  private record(id:string,status:"accepted"|"rejected"){return path.join(evidenceRoot,"records",status,`${safeSegment(id)}.json`);}
  private manifest(id:string,rev:number){return path.join(evidenceRoot,"investigations",safeSegment(id),String(rev),"manifest.json");}
  async putAccepted(e:AcceptedEvidenceEnvelope){return this.put(e,"accepted");}
  async putRejected(e:EvidenceRejection){return this.put(e,"rejected");}
  private async put(e:AcceptedEvidenceEnvelope|EvidenceRejection,status:"accepted"|"rejected"):Promise<"created"|"existing">{
    const file=this.record(e.evidenceId,status); const existing=await readJson<typeof e>(file);
    if(existing){if(existing.payloadHash!==e.payloadHash)throw new EvidenceIntegrityError(`Evidence ${e.evidenceId} is immutable and already exists with another hash.`);return "existing";}
    await atomicJson(file,e); const revision="investigationRevision" in e?e.investigationRevision:e.execution.revision; const mf=this.manifest(e.investigationId,revision); const current=await readJson<Manifest>(mf)??{version:1 as const,entries:[]};
    const entry:EvidenceManifestEntry={evidenceId:e.evidenceId,investigationId:e.investigationId,investigationRevision:revision,executionId:String(e.execution.executionId),source:e.execution.source,operation:e.execution.operation,authority:e.authority,schemaName:e.schema.name,schemaVersion:e.schema.version,payloadHash:e.payloadHash,status,storedAt:new Date().toISOString()};
    await atomicJson(mf,{version:1,entries:[...current.entries.filter(x=>x.evidenceId!==e.evidenceId),entry]}); return "created";
  }
  async getAccepted(id:EvidenceId){const e=await readJson<AcceptedEvidenceEnvelope>(this.record(id,"accepted"));if(e&&await hashEvidencePayload(e.payload)!==e.payloadHash)throw new EvidenceIntegrityError(`Evidence ${id} failed payload hash verification.`);return e;}
  async getRejected(id:EvidenceId){return readJson<EvidenceRejection>(this.record(id,"rejected"));}
  async query(q:EvidenceQuery){ const revisions=q.revision?[q.revision]:await this.revisions(q.investigationId); const all=(await Promise.all(revisions.map(async r=>(await readJson<Manifest>(this.manifest(q.investigationId,r)))?.entries??[]))).flat(); return all.filter(x=>(!q.executionId||x.executionId===q.executionId)&&(!q.source||x.source===q.source)).sort((a,b)=>a.storedAt.localeCompare(b.storedAt)); }
  private async revisions(id:string):Promise<number[]>{const {promises:fs}=await import("node:fs");const dir=path.join(evidenceRoot,"investigations",safeSegment(id));try{return(await fs.readdir(dir,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^\d+$/.test(x.name)).map(x=>Number(x.name)).sort((a,b)=>a-b);}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return[];throw e;}}
}

import type { LatticeSource,NormalizedSearchResult } from "./contracts";
import { resolveSelectedStructure,type ResolutionUpdate,type ResolvedStructure } from "./structure-resolver";
const limits:Record<LatticeSource,number>={sap:1,teamcenter:1,windchill:3,configit:2};
class Semaphore{private active=0;private queue:Array<()=>void>=[];constructor(private readonly limit:number){}async run<T>(work:()=>Promise<T>){if(this.active>=this.limit)await new Promise<void>(resolve=>this.queue.push(resolve));this.active++;try{return await work()}finally{this.active--;this.queue.shift()?.()}}}
export type ResolutionRecord={result:NormalizedSearchResult;outcome:ResolvedStructure};
export class StructureResolutionOrchestrator{private readonly gates=new Map<LatticeSource,Semaphore>(Object.entries(limits).map(([source,limit])=>[source as LatticeSource,new Semaphore(limit)]));private readonly controllers=new Map<string,AbortController>();cancel(resultId?:string){if(resultId){this.controllers.get(resultId)?.abort();this.controllers.delete(resultId);return}for(const controller of this.controllers.values())controller.abort();this.controllers.clear()}
 async resolveAll(results:NormalizedSearchResult[],onUpdate?:(update:ResolutionUpdate)=>void,onSettled?:(record:ResolutionRecord)=>void){const tasks=results.map(async result=>{const controller=new AbortController();this.controllers.set(result.resultId,controller);onUpdate?.({resultId:result.resultId,source:result.source,nativeId:result.nativeId,state:"queued",message:`Queued for ${result.source} extraction.`,updatedAt:new Date().toISOString()});const gate=this.gates.get(result.source)!;const outcome=await gate.run(()=>resolveSelectedStructure(result,controller.signal,onUpdate));this.controllers.delete(result.resultId);const record={result,outcome};onSettled?.(record);return record});return Promise.allSettled(tasks)}
}



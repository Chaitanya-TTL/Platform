import { NextResponse } from "next/server";
import { asEvidenceId } from "@/features/lattice-next/kernel/evidence/evidence-contracts";
import { serverEvidenceRepository } from "@/features/lattice-next/kernel/evidence/server/server-evidence-runtime";
export const runtime="nodejs"; export const dynamic="force-dynamic"; type C={params:Promise<{evidenceId:string}>};
export async function GET(_r:Request,c:C){const {evidenceId}=await c.params,id=asEvidenceId(evidenceId);try{const accepted=await serverEvidenceRepository.getAccepted(id);if(accepted)return NextResponse.json(accepted);const rejected=await serverEvidenceRepository.getRejected(id);return rejected?NextResponse.json(rejected):NextResponse.json({message:"Evidence not found."},{status:404});}catch(e){return NextResponse.json({message:e instanceof Error?e.message:"Evidence read failed."},{status:409});}}

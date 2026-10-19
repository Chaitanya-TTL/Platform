import { NextResponse } from "next/server";
import { asInvestigationId } from "@/features/lattice-next/kernel/contracts/investigation-identity";
import { serverEvidenceRepository } from "@/features/lattice-next/kernel/evidence/server/server-evidence-runtime";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){const u=new URL(request.url),id=u.searchParams.get("investigationId");if(!id)return NextResponse.json({message:"investigationId is required."},{status:400});const revision=u.searchParams.get("revision");const entries=await serverEvidenceRepository.query({investigationId:asInvestigationId(id),revision:revision?Number(revision):undefined,executionId:u.searchParams.get("executionId")??undefined,source:u.searchParams.get("source")??undefined});return NextResponse.json({entries});}

export async function POST(request:Request){
  try{
    const value=await request.json();
    if(!value||typeof value!=="object"||typeof value.status!=="string")return NextResponse.json({message:"An accepted or rejected evidence decision is required."},{status:400});
    const result=value.status==="accepted"&&value.evidence
      ? await serverEvidenceRepository.putAccepted(value.evidence)
      : value.status==="rejected"
        ? await serverEvidenceRepository.putRejected(value)
        : undefined;
    if(!result)return NextResponse.json({message:"Unsupported evidence decision."},{status:400});
    return NextResponse.json({result},{status:result==="created"?201:200});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Evidence persistence failed."},{status:409});}
}

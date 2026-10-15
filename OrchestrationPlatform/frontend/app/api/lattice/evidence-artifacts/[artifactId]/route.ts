import { NextResponse } from "next/server";
import { serverEvidenceArtifacts } from "@/features/lattice-next/kernel/evidence/server/server-evidence-runtime";
export const runtime="nodejs"; export const dynamic="force-dynamic"; type C={params:Promise<{artifactId:string}>};
export async function GET(_r:Request,c:C){const {artifactId}=await c.params,a=await serverEvidenceArtifacts.get(artifactId);return a?new Response(a.bytes.buffer.slice(a.bytes.byteOffset,a.bytes.byteOffset+a.bytes.byteLength) as ArrayBuffer,{headers:{"content-type":a.mediaType,"content-length":String(a.bytes.byteLength)}}):NextResponse.json({message:"Artifact not found."},{status:404});}

export async function PUT(request:Request,c:C){const{artifactId}=await c.params;const mediaType=request.headers.get("content-type")||"application/octet-stream";const bytes=new Uint8Array(await request.arrayBuffer());const result=await serverEvidenceArtifacts.put({artifactId,mediaType,bytes});return NextResponse.json({result,artifactId,byteLength:bytes.byteLength},{status:result==="created"?201:200});}

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
async function exists(candidate:string){try{await fs.access(candidate);return true}catch{return false}}
async function findDir(start:string){let current=path.resolve(start);for(let i=0;i<6;i++){const candidate=path.resolve(current,"configit_extractor");if(await exists(candidate))return candidate;const parent=path.dirname(current);if(parent===current)break;current=parent}return null}
async function pythonOf(dir:string){for(const candidate of [path.resolve(dir,".venv","Scripts","python.exe"),path.resolve(dir,".venv","bin","python"),"python","python3"]){if(candidate==="python"||candidate==="python3"){try{await execFileAsync(candidate,["--version"]);return candidate}catch{continue}}if(await exists(candidate))return candidate}return null}
export async function GET(request:NextRequest){
  const params=request.nextUrl.searchParams;
  // productId-only is retained as a compatibility alias for the existing BOM workspace state.
  const packagePath=(params.get("packagePath")??params.get("productId"))?.trim();
  const productId=params.get("productIdOverride")?.trim()??undefined;
  const date=params.get("date")?.trim()??undefined;
  if(!packagePath)return NextResponse.json({error:"packagePath is required."},{status:400});
  const dir=await findDir(process.cwd());if(!dir)return NextResponse.json({error:"Configit extractor directory is unavailable."},{status:500});
  const script=path.resolve(dir,"extractor.py"),python=await pythonOf(dir);if(!(await exists(script))||!python)return NextResponse.json({error:"Configit extractor runtime is unavailable."},{status:500});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"configit-"));const output=path.join(temp,"normalized-bom.json");
  const args=[script,"--package-path",packagePath,"--output",output];if(productId)args.push("--product-id",productId);if(date)args.push("--date",date);
  try{await execFileAsync(python,args,{cwd:dir,timeout:5*60*1000,maxBuffer:10*1024*1024,env:process.env});return NextResponse.json(JSON.parse(await fs.readFile(output,"utf8")))}
  catch(error:unknown){const detail=error&&typeof error==="object"&&"stderr" in error?String((error as {stderr?:unknown}).stderr??""):error instanceof Error?error.message:"Unable to run extraction.";const message=detail.split("\n").filter(Boolean).at(-1)??detail;return NextResponse.json({error:`Configit extraction failed: ${message}`},{status:502})}
  finally{await fs.rm(temp,{recursive:true,force:true})}
}

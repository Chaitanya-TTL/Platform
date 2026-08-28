import { describe, expect, it } from "vitest";
import type { RelationshipProjection } from "../contracts/projection";
import { decomposeProjection } from "../layout/branch-decomposition";
import { buildElkBranchGraph } from "../layout/elk-branch-builder";
import { boundsOverlap, sectorAngles, usableViewport } from "../layout/sector-orchestrator";
import { hybridLayout } from "../infrastructure/hybrid-layout-planner";

const projection = (branches: number, depth = 3, width = 2): RelationshipProjection => {
  const nodes: RelationshipProjection["nodes"] = [{ id:"subject",label:"Subject",subtitle:"Universal",kind:"identity",source:"unified",level:0,selected:false,expanded:true,hasChildren:true,hiddenChildren:0,relationshipCount:branches,childCount:branches }];
  const edges: RelationshipProjection["edges"] = [];
  for (let branch=0; branch<branches; branch++) {
    let parents=["subject"];
    for (let level=1; level<=depth; level++) {
      const next:string[]=[];
      for (const parent of parents) for (let child=0; child<width; child++) {
        const id=`b${branch}-l${level}-${parent}-${child}`; next.push(id);
        nodes.push({id,label:id,subtitle:"Generated",kind:level===depth?"component":"assembly",source:`source-${branch}`,level,selected:false,expanded:true,hasChildren:level<depth,hiddenChildren:0,relationshipCount:1,childCount:level<depth?width:0});
        edges.push({id:`e:${parent}:${id}`,source:parent,target:id,kind:parent==="subject"?"represented-by":"contains",selected:false});
      }
      parents=next;
    }
  }
  return {nodes,edges,structuralKey:`${branches}:${depth}:${width}`};
};

describe("universal sector-layered architecture",()=>{
  it("decomposes arbitrary topology into primary branches",()=>{const graph=projection(5,2,2);const result=decomposeProjection(graph)!;expect(result.subjectId).toBe("subject");expect(result.branches).toHaveLength(10);expect(new Set(result.branches.flatMap(b=>b.nodeIds)).size).toBe(graph.nodes.length-1);});
  it("builds deterministic ELK graphs with explicit ordered ports",()=>{const graph=projection(2,2,1);const branch=decomposeProjection(graph)!.branches[0];const a=buildElkBranchGraph(branch,graph,"RIGHT");const b=buildElkBranchGraph(branch,graph,"RIGHT");expect(a).toEqual(b);expect(a.children.every(n=>n.ports.length===2)).toBe(true);expect(a.layoutOptions["elk.edgeRouting"]).toBe("ORTHOGONAL");});
  it("allocates exact 360/n sectors for any branch count",()=>{const values=sectorAngles(["d","a","c","b"]);const gaps=values.map((v,i)=>((values[(i+1)%values.length].angle-v.angle+Math.PI*2)%(Math.PI*2)));expect(gaps.every(g=>Math.abs(g-Math.PI/2)<1e-9)).toBe(true);});
  it("accounts for inspector, toolbar and gutters",()=>{expect(usableViewport({width:1600,height:1000,inspectorWidth:400,toolbarHeight:100,gutter:50})).toMatchObject({width:1100,height:800,center:{x:550,y:400}});});
  it("composes a complete deterministic non-overlapping investigation",async()=>{const graph=projection(4,3,2);const a=await hybridLayout(graph,{},1,{width:1800,height:1200,inspectorWidth:360});const b=await hybridLayout(graph,{},1,{width:1800,height:1200,inspectorWidth:360});expect(a.positions).toEqual(b.positions);expect(Object.keys(a.positions)).toHaveLength(graph.nodes.length);expect(a.diagnostics.invalidCoordinateCount).toBe(0);for(let i=0;i<a.branches.length;i++)for(let j=i+1;j<a.branches.length;j++)expect(boundsOverlap(a.branches[i].bounds,a.branches[j].bounds,0)).toBe(false);});
});


describe("production layout invariants",()=>{
  it("returns valid ELK ports and finite routed structural edges",async()=>{const graph=projection(3,3,2);const result=await hybridLayout(graph,{},9,{width:1700,height:1050});expect(Object.keys(result.ports).length).toBeGreaterThan(0);expect(Object.keys(result.routes).length).toBeGreaterThan(0);expect(result.diagnostics.invalidRouteCount).toBe(0);for(const port of Object.values(result.ports)){expect(result.positions[port.nodeId]).toBeDefined();expect(Number.isFinite(port.position.x)&&Number.isFinite(port.position.y)).toBe(true)}});
  it("keeps branches outside the subject exclusion zone",async()=>{const result=await hybridLayout(projection(6,2,3),{},4,{width:1900,height:1200});expect(result.diagnostics.subjectIntrusionCount).toBe(0);expect(result.diagnostics.branchOverlapCount).toBe(0);});
  it("handles zero and one branch without invalid geometry",async()=>{for(const count of [0,1]){const result=await hybridLayout(projection(count,2,1),{},count);expect(result.diagnostics.invalidCoordinateCount).toBe(0);expect(Object.values(result.positions).every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))).toBe(true)}});
  it("honors a valid pin without losing graph coordinates",async()=>{const graph=projection(2,2,1);const target=graph.nodes[1].id;const result=await hybridLayout(graph,{[target]:{x:91,y:37}},7);expect(result.positions[target]).toEqual({x:91,y:37});expect(Object.keys(result.positions)).toHaveLength(graph.nodes.length);});
});

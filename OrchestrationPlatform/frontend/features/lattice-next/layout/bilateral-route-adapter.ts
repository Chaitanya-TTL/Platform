import type { LatticeFlowEdge, LatticeFlowNode } from "../canvas/lattice-flow-types";
import type { LayoutRoute } from "./layout-contract";
import type { BilateralPortPlan, BilateralSide } from "./bilateral-layout-contract";
import { BILATERAL_LAYOUT_CONFIG } from "./bilateral-layout-contract";

export function planBilateralRoutes(nodes: LatticeFlowNode[], edges: LatticeFlowEdge[], positions: Record<string,{x:number;y:number}>, sideByNode: Record<string,BilateralSide>) {
  const byId = new Map(nodes.map((node) => [node.id,node]));
  const routes: Record<string,LayoutRoute> = {};
  const ports: Record<string,BilateralPortPlan> = {};
  for (const edge of edges) {
    const source=byId.get(edge.source), target=byId.get(edge.target);
    if(!source||!target||!positions[source.id]||!positions[target.id]) continue;
    const side=sideByNode[target.id]??sideByNode[source.id]??"RIGHT";
    const sourceSide=side==="LEFT"?"west":"east";
    const targetSide=side==="LEFT"?"east":"west";
    const sp=positions[source.id],tp=positions[target.id];
    const sw=source.width??Number(source.style?.width)??272, sh=source.height??Number(source.style?.height)??96;
    const tw=target.width??Number(target.style?.width)??272, th=target.height??Number(target.style?.height)??96;
    const start={x:sourceSide==="east"?sp.x+sw:sp.x,y:sp.y+sh/2};
    const end={x:targetSide==="west"?tp.x:tp.x+tw,y:tp.y+th/2};
    const departure=BILATERAL_LAYOUT_CONFIG.routeDeparture*(side==="LEFT"?-1:1);
    const laneX=start.x+departure;
    const approachX=end.x-departure;
    routes[edge.id]={edgeId:edge.id,start,bends:[{x:laneX,y:start.y},{x:approachX,y:end.y}],end,label:{x:(laneX+approachX)/2,y:(start.y+end.y)/2},family:String(edge.data?.category??"structure")};
    ports[edge.id]={edgeId:edge.id,sourceSide,targetSide};
  }
  return {routes,ports};
}

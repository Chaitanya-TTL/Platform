import type { LayoutOrientation, NodePosition, RelationshipProjection } from "../contracts/projection";
import type { LayoutViewport } from "../layout/layout-contract";
import type { LayoutSession } from "../layout/layout-session";
import { classifyChange, createSession, movementDiagnostics, stabilizeLayout } from "../layout/layout-session";
import { routeRelationships } from "../layout/relationship-router";
import { hybridLayout, NODE_HEIGHT, NODE_WIDTH } from "./hybrid-layout-planner";
export { NODE_HEIGHT, NODE_WIDTH };
export async function layoutProjection(projection:RelationshipProjection,_orientation:LayoutOrientation,signal:number,pinned:Readonly<Record<string,NodePosition>>={},viewport?:LayoutViewport,previous?:LayoutSession){
 const started=Date.now();const changeType=classifyChange(previous,projection,pinned,false);let result=await hybridLayout(projection,pinned,signal,viewport);result=stabilizeLayout(result,previous,changeType);const routed=routeRelationships(projection,result.positions,result.dimensions,result.branches,result.routes,pinned);result={...result,routes:routed.routes,diagnostics:{...result.diagnostics,invalidRouteCount:routed.diagnostics.invalidRouteCount,routing:routed.diagnostics}};const stability=movementDiagnostics(previous,result,changeType,Date.now()-started);result={...result,diagnostics:{...result.diagnostics,stability}};return{...result,session:createSession(result,projection,signal)};
}

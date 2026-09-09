import type { LatticeFlowEdge, LatticeFlowNode } from "../canvas/lattice-flow-types";
import type { Bounds } from "./layout-contract";
import { BILATERAL_LAYOUT_CONFIG, type BilateralLayoutResult, type BilateralSide } from "./bilateral-layout-contract";
import { buildBilateralVisibleGraph, inheritBranchSide } from "./bilateral-visible-graph";
import { planBilateralRoutes } from "./bilateral-route-adapter";

const size=(node:LatticeFlowNode)=>({width:node.width??Number(node.style?.width)??272,height:node.height??Number(node.style?.height)??96});
const pos=(node:LatticeFlowNode)=>node.position;
export function bilateralReflow(nodes:LatticeFlowNode[],edges:LatticeFlowEdge[]):BilateralLayoutResult|null{
 const graph=buildBilateralVisibleGraph(nodes,edges); if(!graph)return null;
 const {subject,children,domains,byId}=graph, subjectSize=size(subject), subjectCenterX=pos(subject).x+subjectSize.width/2;
 const sideByNode:Record<string,BilateralSide>={},depthByNode:Record<string,number>={};
 const left:LatticeFlowNode[]=[],right:LatticeFlowNode[]=[];
 for(const domain of domains){const center=pos(domain).x+size(domain).width/2,delta=center-subjectCenterX;const side:BilateralSide=delta< -BILATERAL_LAYOUT_CONFIG.sideDeadZone?"LEFT":delta>BILATERAL_LAYOUT_CONFIG.sideDeadZone?"RIGHT":left.length<=right.length?"LEFT":"RIGHT";(side==="LEFT"?left:right).push(domain);inheritBranchSide(domain.id,side,children,sideByNode,depthByNode)}
 left.sort((a,b)=>pos(a).y-pos(b).y||a.id.localeCompare(b.id));right.sort((a,b)=>pos(a).y-pos(b).y||a.id.localeCompare(b.id));
 const footprint=new Map<string,number>();
 const measure=(id:string):number=>{if(footprint.has(id))return footprint.get(id)!;const own=size(byId.get(id)!).height,kids=children.get(id)??[];const h=kids.length?Math.max(own,kids.reduce((sum,k)=>sum+measure(k),0)+(kids.length-1)*BILATERAL_LAYOUT_CONFIG.siblingVerticalGap):own;footprint.set(id,h);return h};
 domains.forEach(d=>measure(d.id));
 const positions:Record<string,{x:number;y:number}>={[subject.id]:{...subject.position}};const branchBounds:Record<string,Bounds>={};
 const placeChildren=(parentId:string,side:BilateralSide,laneTop:number,laneHeight:number)=>{const parent=byId.get(parentId)!;const kids=(children.get(parentId)??[]).map(id=>byId.get(id)!).filter(Boolean);if(!kids.length)return;const total=kids.reduce((s,k)=>s+measure(k.id),0)+(kids.length-1)*BILATERAL_LAYOUT_CONFIG.siblingVerticalGap;let cursor=laneTop+(laneHeight-total)/2;for(const child of kids){const ph=positions[parentId],ps=size(parent),cs=size(child),ch=measure(child.id);positions[child.id]={x:side==="LEFT"?ph.x-BILATERAL_LAYOUT_CONFIG.levelHorizontalGap-cs.width:ph.x+ps.width+BILATERAL_LAYOUT_CONFIG.levelHorizontalGap,y:cursor+(ch-cs.height)/2};placeChildren(child.id,side,cursor,ch);cursor+=ch+BILATERAL_LAYOUT_CONFIG.siblingVerticalGap}};
 const placeSide=(list:LatticeFlowNode[],side:BilateralSide)=>{const total=list.reduce((s,n)=>s+measure(n.id),0)+Math.max(0,list.length-1)*BILATERAL_LAYOUT_CONFIG.branchVerticalGap;let cursor=subject.position.y+subjectSize.height/2-total/2;for(const domain of list){const ds=size(domain),h=measure(domain.id);positions[domain.id]={x:side==="LEFT"?subject.position.x-BILATERAL_LAYOUT_CONFIG.subjectToDomainGap-ds.width:subject.position.x+subjectSize.width+BILATERAL_LAYOUT_CONFIG.subjectToDomainGap,y:cursor+(h-ds.height)/2};placeChildren(domain.id,side,cursor,h);const ids=Object.keys(sideByNode).filter(id=>sideByNode[id]===side&&(id===domain.id||isDescendant(domain.id,id,children)));const boxes=ids.filter(id=>positions[id]&&byId.get(id)).map(id=>({...positions[id],...size(byId.get(id)!)}));if(boxes.length){const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),rightEdge=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));branchBounds[domain.id]={x,y,width:rightEdge-x,height:bottom-y}}cursor+=h+BILATERAL_LAYOUT_CONFIG.branchVerticalGap}};
 placeSide(left,"LEFT");placeSide(right,"RIGHT");
 const planned=planBilateralRoutes(nodes,edges,positions,sideByNode);return{positions,sideByNode,depthByNode,branchBounds,routes:planned.routes,ports:planned.ports};
}
function isDescendant(root:string,candidate:string,children:Map<string,string[]>) {const q=[...(children.get(root)??[])],seen=new Set<string>();while(q.length){const id=q.shift()!;if(id===candidate)return true;if(seen.has(id))continue;seen.add(id);q.push(...(children.get(id)??[]))}return false}

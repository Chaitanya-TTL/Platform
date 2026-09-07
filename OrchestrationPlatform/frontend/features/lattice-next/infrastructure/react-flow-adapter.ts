import { projectedNodeDimensions } from "../motion/node-sizing";
import type { LayoutOrientation, RelationshipProjection } from "../contracts/projection";
import type { UniversalLayoutResult } from "../layout/layout-contract";
import type { LatticeEdgeCategory,LatticeFlowEdge,LatticeFlowNode,LatticeNodeCategory,LatticePinnedPositions,RelationshipFamily,ResolutionState } from "../canvas/lattice-flow-types";
const relationshipLabel=(kind:string,source:string,target:string)=>{if(target.includes("physical-attributes"))return "physical properties";if(target.includes("product-context"))return "product context";if(target.includes("requirements"))return "defined by";if(target.includes("changes"))return "changed through";if(kind==="described-by")return "described by";if(kind==="supersedes")return "supersedes";if(kind==="affected-by")return "affected by";if(kind==="contains"&&target.includes("requirement"))return "contains requirement";if(kind==="requirement")return "defined by";return undefined};
const relationshipFamily=(kind:RelationshipProjection["edges"][number]["kind"]):RelationshipFamily=>kind==="contains"?"structure":kind==="requirement"?"requirement":kind==="business-impact"?"operational":kind==="corresponds-to"||kind==="comparison"?"correspondence":"evidence";
const edgeCategory=(kind:RelationshipProjection["edges"][number]["kind"]):LatticeEdgeCategory=>kind==="contains"?"structure":kind==="corresponds-to"||kind==="comparison"?"correspondence":kind==="requirement"?"requirement":kind==="business-impact"?"operational-impact":"evidence";
function resolution(value?:string):ResolutionState{return value==="failed"?"failed":value==="partial"?"partial":value==="warning"?"warning":value==="resolving"||value==="extracting"?"resolving":"ready"}
export function toReactFlow(projection:RelationshipProjection,positions:Record<string,{x:number;y:number}>,pinned:LatticePinnedPositions={},orientation:LayoutOrientation="RIGHT",layout?:UniversalLayoutResult):{nodes:LatticeFlowNode[];edges:LatticeFlowEdge[]}{
 const branchDirection=new Map(layout?.branches.flatMap(branch=>branch.nodeIds.map(id=>[id,branch.direction] as const))??[]);
 const incoming=new Map<string,RelationshipProjection["edges"]>();const outgoing=new Map<string,RelationshipProjection["edges"]>();
 for(const edge of projection.edges){incoming.set(edge.target,[...(incoming.get(edge.target)??[]),edge]);outgoing.set(edge.source,[...(outgoing.get(edge.source)??[]),edge])}
 const flowNodes=projection.nodes.map((node,index)=>{
  const dimensions=projectedNodeDimensions(node);
  const represented=(incoming.get(node.id)??[]).some(edge=>edge.kind==="represented-by");
  const domain=node.id.startsWith("projection:domain:");
  const category:LatticeNodeCategory=node.level===0?"subject":domain?"cluster":represented?"source-representation":node.kind==="requirement"?"requirement":node.kind==="change-notice"||node.kind==="change-task"?"change":node.kind==="finding"||node.kind==="document"?"evidence":"engineering-item";
  const attributes=node.attributes??{};
  const completeness=Number(attributes.Completeness??attributes.completeness??(node.resolutionState==="partial"?65:100));
  const families=[...new Set([...(incoming.get(node.id)??[]),...(outgoing.get(node.id)??[])].map(edge=>relationshipFamily(edge.kind)))];
  return {
    id:node.id,
    type:category,
    position:pinned[node.id]??positions[node.id]??{x:node.level*320,y:0},
    origin:category==="subject"?[0.5,0.5]:[0,0.5],
    width:dimensions.width,
    height:dimensions.height,
    style:{width:dimensions.width,height:dimensions.height},
    selected:node.selected,
    data:{category,label:node.label,subtitle:node.subtitle,source:node.source,level:node.level,selected:node.selected,expanded:node.expanded,hasChildren:node.hasChildren,hiddenChildren:node.hiddenChildren,entityKind:node.kind,nativeIdentifier:node.nativeIdentifier,revision:node.revision,completeness,resolutionState:resolution(node.resolutionState),matchConfidence:node.matchConfidence===undefined?undefined:Math.round(node.matchConfidence*100),childCount:node.childCount,lastCapturedAt:node.capturedAt,participatingSystems:node.provenanceSources?.length??1,coverageSummary:`${node.relationshipCount} relationships`,relationshipFamilies:families.length?families:["structure"],orientation,activeResolution:node.resolutionState==="resolving"||node.resolutionState==="extracting",pinned:Boolean(pinned[node.id]),evidenceSummary:node.subtitle,attributes:node.attributes,entering:true,revealIndex:index,geometryRevision:dimensions.width*1000+dimensions.height,routeSettled:true,dimmed:node.dimmed,layoutDirection:branchDirection.get(node.id),radialHandles:layout?Object.values(layout.ports).filter(port=>port.nodeId===node.id&&Boolean(port.branchId)):undefined}
  } as LatticeFlowNode;
});
 const nodeById=new Map(flowNodes.map(node=>[node.id,node]));
 const flowEdges=projection.edges.map(edge=>{
  const category=edgeCategory(edge.kind),family=relationshipFamily(edge.kind);
  const source=nodeById.get(edge.source),target=nodeById.get(edge.target);
  const sourceCenter={x:(source?.position.x??0)+(source?.width??196)/2,y:(source?.position.y??0)+(source?.height??76)/2};
  const targetCenter={x:(target?.position.x??0)+(target?.width??196)/2,y:(target?.position.y??0)+(target?.height??76)/2};
  const dx=targetCenter.x-sourceCenter.x,dy=targetCenter.y-sourceCenter.y;
  const horizontal=Math.abs(dx)>=Math.abs(dy);
  const sourceSide=horizontal?(dx>=0?"east":"west"):(dy>=0?"south":"north");
  const targetSide=horizontal?(dx>=0?"west":"east"):(dy>=0?"north":"south");
  const label=edge.label||relationshipLabel(edge.kind,edge.source,edge.target);
  return {id:edge.id,source:edge.source,target:edge.target,sourceHandle:`source:${sourceSide}:${family}`,targetHandle:`target:${targetSide}:${family}`,type:"lattice-edge",selectable:true,focusable:true,deletable:false,reconnectable:false,selected:edge.selected,interactionWidth:26,ariaLabel:`${edge.fullLabel??label??edge.kind} relationship`,data:{category,relationshipKind:edge.kind,label,fullLabel:edge.fullLabel||label,confidence:edge.confidence,direction:edge.kind==="corresponds-to"?"bidirectional":(edge.confidence??1)<.7?"inferred":"forward",importance:edge.kind==="contains"?"primary":(edge.confidence??1)<.65?"low":"normal",animation:edge.selected?"selected":"settled",authoritative:true,layoutRoute:undefined}} as LatticeFlowEdge;
 });
 return {nodes:flowNodes,edges:flowEdges};
}

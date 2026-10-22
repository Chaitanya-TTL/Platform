import type {IntelligenceEntity} from "../../contracts/intelligence-v1";import type {AttributeAdapter,VerifiedAttributePath} from "../contracts/application-attribute";import {readVerified} from "./common";
const allowed=new Set<VerifiedAttributePath>(["provenance.nativeId","properties.preferredProductId"]);
export const sapAttributeAdapter:AttributeAdapter={application:"sap",supports:e=>e.provenance.source==="sap"&&["material","material-master","source-representation"].includes(e.kind),read:(e,p)=>allowed.has(p)?readVerified(e,"sap","MaterialMaster",p):undefined};

import type {IntelligenceEntity} from "../../contracts/intelligence-v1";import type {AttributeAdapter,VerifiedAttributePath} from "../contracts/application-attribute";import {readVerified} from "./common";
const allowed=new Set<VerifiedAttributePath>(["provenance.nativeId","properties.partNumber"]);
export const windchillAttributeAdapter:AttributeAdapter={application:"windchill",supports:e=>e.provenance.source==="windchill"&&["part","component","source-representation"].includes(e.kind),read:(e,p)=>allowed.has(p)?readVerified(e,"windchill","WTPart",p):undefined};

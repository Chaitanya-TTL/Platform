import type { QueryIntent } from "./contracts";
export function normalizeQuery(value:string){return value.trim().replace(/\s+/g," ");}
export function classifyQueryIntent(value:string):QueryIntent{
  const query=normalizeQuery(value);
  if(!query)return "unknown";
  if(/^REQ[-_: ]?[A-Z0-9]+$/i.test(query))return "requirement-id";
  if(/^(CN|ECN|ECR|CHANGE)[-_: ]?[A-Z0-9]+$/i.test(query))return "change-id";
  if(/^[A-Z]{2,}\d{4,}$/i.test(query))return "material-number";
  if(/^\d{5,}$/.test(query)||/^[A-Z0-9]+[-_]\d{3,}$/i.test(query))return "exact-engineering-id";
  if(/^[A-Z0-9._/-]+$/i.test(query)&&/\d/.test(query))return "part-number";
  if(/^[\p{L}\d][\p{L}\d ._-]{2,}$/u.test(query))return "product-name";
  return "unknown";
}

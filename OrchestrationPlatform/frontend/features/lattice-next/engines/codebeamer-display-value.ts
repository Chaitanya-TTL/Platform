type JsonRecord = Record<string, unknown>;
export type CodebeamerDisplayKind = "text"|"choice"|"reference"|"reference-list"|"number"|"boolean"|"date"|"attachment"|"empty";
export type CodebeamerDisplayValue = { kind:CodebeamerDisplayKind; text:string; sourceId?:string; cardinality?:number; raw:unknown };
const object=(value:unknown):JsonRecord|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:undefined;
const scalar=(value:unknown)=>typeof value==="string"||typeof value==="number"||typeof value==="boolean"?String(value):undefined;
const named=(value:JsonRecord)=>scalar(value.name)??scalar(value.displayName)??scalar(value.label)??scalar(value.fileName)??scalar(value.value);
export function normalizeCodebeamerValue(value:unknown):CodebeamerDisplayValue {
 if(value===null||value===undefined||value==="") return {kind:"empty",text:"",raw:value};
 if(typeof value==="boolean") return {kind:"boolean",text:value?"Yes":"No",raw:value};
 if(typeof value==="number") return {kind:"number",text:String(value),raw:value};
 if(typeof value==="string") {
  const text=value
   .replace(/\r\n?/g,"\n")
   .replace(/[ \t]+/g," ")
   .replace(/([:;])\s*(\d+)\.\s*(?=[A-Z])/g,"$1\n$2. ")
   .replace(/(?<=[a-z)])(\d+)\.\s*(?=[A-Z])/g,"\n$1. ")
   .replace(/\n{3,}/g,"\n\n")
   .trim();
  return {kind:/^\d{4}-\d{2}-\d{2}T/.test(value)?"date":"text",text,raw:value};
 }
 if(Array.isArray(value)) {
  const values=value.map(normalizeCodebeamerValue).filter(item=>item.kind!=="empty");
  return {kind:"reference-list",text:values.map(item=>item.text).join(", "),cardinality:values.length,raw:value};
 }
 const item=object(value)!; const label=named(item); const sourceId=scalar(item.id);
 if(label) return {kind:item.type==="ChoiceOptionReference"?"choice":item.fileName?"attachment":"reference",text:label,sourceId,raw:value};
 return {kind:"text",text:Object.entries(item).map(([key,nested])=>`${key}: ${normalizeCodebeamerValue(nested).text}`).filter(line=>!line.endsWith(": ")).join("; "),sourceId,raw:value};
}
export const meaningfulCodebeamerValue=(value:unknown)=>normalizeCodebeamerValue(value).kind!=="empty"&&normalizeCodebeamerValue(value).text.length>0;

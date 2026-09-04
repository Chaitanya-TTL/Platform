import { requirementQuery, formatFileSize, trustedDownload } from "./windchill/requirements";
export { requirementQuery, formatFileSize, trustedDownload };
export const windchillRequirementQuery = (value: string, oid?: string) => { const result = requirementQuery(value, oid); return { type: result.type, parameter: result.type === "part-oid" ? "partOid" : result.type === "part-number" ? "partNumber" : "partName", value: result.value }; };
export const formatWindchillFileSize = formatFileSize;
export const platformWindchillDownloadUrl = (value: string) => { if (value.startsWith("/api/windchill/content/")) return value; if (value.startsWith("/api/engineering/windchill/content/")) return value.replace("/api/engineering/windchill/content/", "/api/windchill/content/"); throw new Error("Untrusted Windchill download URL"); };

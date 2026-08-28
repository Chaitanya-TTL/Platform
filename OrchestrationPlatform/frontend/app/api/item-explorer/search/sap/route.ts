import { params } from "@/lib/item-explorer/server";
import { searchEngineeringSource } from "@/lib/item-explorer/engineering-discovery";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { query, mode, limit } = params(request);
  return searchEngineeringSource("sap", query, mode, limit);
}

import type { FederatedSearchRequest, LatticeSource, SourceSearchOutcome } from "../contracts";
export interface SourceSearchAdapter { readonly source:LatticeSource; search(request:FederatedSearchRequest,signal:AbortSignal):Promise<SourceSearchOutcome>; }
export function safeError(cause:unknown){return cause instanceof Error?cause.message:"Connector request failed.";}

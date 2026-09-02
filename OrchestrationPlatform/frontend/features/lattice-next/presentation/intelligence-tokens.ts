export const SOURCE_TOKENS={teamcenter:{accent:"cyan",label:"Teamcenter"},windchill:{accent:"violet",label:"Windchill"},sap:{accent:"emerald",label:"SAP"},configit:{accent:"fuchsia",label:"Configit"},unified:{accent:"slate",label:"Unified"},platform:{accent:"slate",label:"Platform"}} as const;
export const SEMANTIC_EDGE_TOKENS={structure:"slate",requirement:"cyan",change:"amber",configuration:"fuchsia",operation:"emerald","cost-and-inventory":"teal",evidence:"neutral",correspondence:"violet"} as const;
export const STATE_TOKENS={verified:"emerald",probable:"cyan",partial:"amber",warning:"amber",unavailable:"rose",stale:"slate"} as const;
export type SourceTokenKey=keyof typeof SOURCE_TOKENS;
export const sourceToken=(source:string)=>SOURCE_TOKENS[source as SourceTokenKey]??SOURCE_TOKENS.platform;
export const semanticEdgeToken=(family:string)=>SEMANTIC_EDGE_TOKENS[family as keyof typeof SEMANTIC_EDGE_TOKENS]??"neutral";

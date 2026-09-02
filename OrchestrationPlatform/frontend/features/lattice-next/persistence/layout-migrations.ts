import { LATTICE_LAYOUT_REVISION } from "../layout/layout-contract";
export const LATTICE_PERSISTENCE_VERSION = 5 as const;
export type PersistedEnvelope = Record<string, unknown> & { version?: number; layoutRevision?: number; interaction?: Record<string, unknown> };
type Migration = (value: PersistedEnvelope) => PersistedEnvelope;
const migrate2to3: Migration = value => ({ ...value, version: 3 });
const migrate3to4: Migration = value => ({ ...value, version: 4, layoutRevision: LATTICE_LAYOUT_REVISION, interaction: { ...(value.interaction ?? {}), pinnedPositions: {} } });
const migrate4to5: Migration = value => ({ ...value, version: 5, layoutRevision: LATTICE_LAYOUT_REVISION, graphStructuralKey: typeof value.graphStructuralKey === "string" ? value.graphStructuralKey : "unknown" });
const migrations = new Map<number, Migration>([[2,migrate2to3],[3,migrate3to4],[4,migrate4to5]]);
export type MigrationResult = { ok: true; value: PersistedEnvelope; migratedFrom: number | null } | { ok: false; reason: "invalid"|"future-version"|"unsupported-version" };
export function migratePersistedInvestigation(input: unknown): MigrationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok:false, reason:"invalid" };
  let value={...(input as PersistedEnvelope)}; const from=typeof value.version==="number"?value.version:0;
  if (from>LATTICE_PERSISTENCE_VERSION) return {ok:false,reason:"future-version"};
  if (from<2) return {ok:false,reason:"unsupported-version"};
  while(value.version!==LATTICE_PERSISTENCE_VERSION){const migration=migrations.get(value.version!);if(!migration)return{ok:false,reason:"unsupported-version"};value=migration(value)}
  if(value.layoutRevision!==LATTICE_LAYOUT_REVISION)value={...value,layoutRevision:LATTICE_LAYOUT_REVISION,interaction:{...(value.interaction??{}),pinnedPositions:{}}};
  return {ok:true,value,migratedFrom:from===LATTICE_PERSISTENCE_VERSION?null:from};
}

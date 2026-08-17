import type { SapBusinessImpact } from "@/lib/api";
export type SapEvidenceAvailability = "confirmed" | "referenced" | "not-found" | "unavailable";
export interface SapDocumentReference { availability: SapEvidenceAvailability; reference: string; fiscalYear: string; detailsVerified: boolean; }
export interface SapAccountingLine { lineItem: string; glAccount: string; direction: string; signedAmount: number | null; currency: string; text: string; accountName: string; businessArea: string; profitCenter: string; productionOrder: string; }
export interface SapAccountingDocument { availability: SapEvidenceAvailability; companyCode: string; documentNumber: string; fiscalYear: string; postingPeriod: string; currency: string; postingDate: string; lines: SapAccountingLine[]; }
export interface SapMaterialMovement {
  materialDocument: string; materialDocumentYear: string; item: string; movementType: string; movementDescription: string; direction: string;
  quantity: number | null; signedQuantity: number | null; unit: string; localAmount: number | null; signedLocalAmount: number | null; currency: string;
  plant: string; storageLocation: string; productionOrder: string; businessArea: string; profitCenter: string; materialItemGlAccount: string;
  postingDate: string; documentDate: string; createdDate: string; createdTime: string; sourceTransaction: string;
  accountingDocument: SapAccountingDocument; controllingReference: SapDocumentReference; materialLedgerReference: SapDocumentReference; evidenceConfidence: "confirmed" | "reconstructed" | "unverified";
}
export interface SapMaterialHistory { requestedMaterialId: string; materialId: string; internalMaterialId: string; plant: string; status: string; movements: SapMaterialMovement[]; warnings: string[]; extractedAt: string; }
export interface SapOperationalImpact { schemaVersion: string; sourceMaterialId: string; plant: string; status: string; currentState: SapBusinessImpact | null; history: SapMaterialHistory | null; warnings: string[]; generatedAt: string; }

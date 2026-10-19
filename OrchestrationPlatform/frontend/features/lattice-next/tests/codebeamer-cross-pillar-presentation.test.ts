import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("Codebeamer cross-pillar presentation alignment",()=>{
 it("uses the investigation search label as the central presentation label",()=>{const source=readFileSync(fileURLToPath(new URL("../workspace/LatticeNextWorkspace.tsx",import.meta.url)),"utf8");expect(source).toContain("displayName: handoff.subjectLabel || canonical.subject.displayName");expect(source).toContain("buildIntelligenceInvestigation({")});
 it("registers the available Codebeamer logo",()=>{const source=readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx",import.meta.url)),"utf8");expect(source).toContain('codebeamer: { src: "/images/cb.png", alt: "Codebeamer" }')});
 it("uses logos consistently for source entity cards",()=>{const source=readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx",import.meta.url)),"utf8");expect(source).toContain("const showSourceLogo = Boolean(sourceLogos[visualSource]);")});
 it("does not route ordinary Codebeamer entities through a special visual branch",()=>{const source=readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx",import.meta.url)),"utf8");expect(source).not.toContain(') : isCodebeamer ? (');expect(source).toContain(') : requirementId ? (')});
 it("preserves Codebeamer-only information group and detail rendering",()=>{const source=readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx",import.meta.url)),"utf8");expect(source).toContain("{isDetailGroup ? (");expect(source).toContain(") : isRequirementDetail ? (")});
});

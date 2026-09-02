import {expect,it} from "vitest";import {semanticEdgeToken,sourceToken} from "../presentation/intelligence-tokens";
it("keeps source identity separate from relationship semantics",()=>{expect(sourceToken("sap").accent).toBe("emerald");expect(semanticEdgeToken("change")).toBe("amber");expect(sourceToken("windchill").accent).not.toBe(semanticEdgeToken("change"));});

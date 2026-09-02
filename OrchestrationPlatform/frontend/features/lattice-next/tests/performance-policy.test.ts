import {describe,expect,it} from "vitest";
import {performancePolicy} from "../layout/performance-policy";
describe("large graph policy",()=>{it("classifies all production tiers",()=>{expect(performancePolicy(100,100).tier).toBe("small");expect(performancePolicy(500,1000).tier).toBe("medium");expect(performancePolicy(1500,3000).tier).toBe("large");expect(performancePolicy(1501,3000).tier).toBe("stress")});it("degrades dense graphs without product assumptions",()=>{const p=performancePolicy(200,1800);expect(p.deferEvidence).toBe(true);expect(p.simplifySemanticRoutes).toBe(true)})});

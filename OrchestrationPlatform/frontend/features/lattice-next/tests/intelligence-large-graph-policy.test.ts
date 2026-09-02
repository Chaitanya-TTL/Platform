import {expect,it} from "vitest";import {graphScalePolicy,visibilityBudget} from "../projection/intelligence-visibility-policy";
it("degrades large dense graphs explicitly",()=>{expect(graphScalePolicy(800,7000)).toEqual({labels:false,maxPerDomain:12,deferEvidence:true});expect(visibilityBudget("deep",900).entities).toBe(900);});

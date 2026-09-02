import {describe,expect,it} from "vitest";
import {nodeZoomTier} from "../components/PremiumNodes";
describe("semantic node zoom",()=>{it("shows identity-only nodes at distance",()=>{expect(nodeZoomTier(.2)).toBe("far");expect(nodeZoomTier(.57)).toBe("far")});it("progressively discloses working and close detail",()=>{expect(nodeZoomTier(.58)).toBe("working");expect(nodeZoomTier(1.07)).toBe("working");expect(nodeZoomTier(1.08)).toBe("close")})});

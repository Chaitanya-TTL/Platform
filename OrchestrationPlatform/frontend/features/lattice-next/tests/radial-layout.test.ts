import { describe, expect, it } from "vitest";
import { radialChildPositions } from "../infrastructure/hybrid-layout-planner";
const angle=(p:{x:number;y:number})=>Math.atan2(p.y,p.x);
const separation=(a:number,b:number)=>{const raw=Math.abs(a-b)%(Math.PI*2);return Math.min(raw,Math.PI*2-raw)};
describe("360/n radial geometry",()=>{
 it("places two children exactly 180 degrees apart",()=>{const p=radialChildPositions({x:0,y:0},["b","a"],300,0);expect(separation(angle(p.a),angle(p.b))).toBeCloseTo(Math.PI,8);});
 it("places three children 120 degrees apart",()=>{const p=radialChildPositions({x:0,y:0},["c","a","b"],300,0);const values=Object.values(p).map(angle).sort((a,b)=>a-b);const gaps=[values[1]-values[0],values[2]-values[1],Math.PI*2-(values[2]-values[0])];gaps.forEach(gap=>expect(gap).toBeCloseTo((Math.PI*2)/3,8));});
 it("is deterministic regardless of input order",()=>{expect(radialChildPositions({x:10,y:20},["z","a"],200,0)).toEqual(radialChildPositions({x:10,y:20},["a","z"],200,0));});
});

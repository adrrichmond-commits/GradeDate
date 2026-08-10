import { describe, expect, test } from "bun:test";
import { normalizeMessageText, scanMessageHeuristics, policyForMessageScan, classifyMessageScan } from "./message-moderation";
describe("message moderation",()=>{
 test("clean ordinary dating language",()=>expect(scanMessageHeuristics("I enjoy hiking and coffee").classification).toBe("clean"));
 test("normalizes obfuscation",()=>expect(scanMessageHeuristics("s3x w1th a m1nor").classification).toMatch(/underage|csam/));
 test("requires trafficking combo",()=>expect(scanMessageHeuristics("I have a job").classification).toBe("clean"));
 test("policy locks underage",()=>expect(policyForMessageScan(scanMessageHeuristics("minor sex meet")).lockAccount).toBe(true));
 test("provider vocabulary",()=>expect(classifyMessageScan({category:"trafficking",confidence:.8}).classification).toBe("trafficking_or_exploitation"));
});

import { describe, expect, test } from "bun:test";
import { canManageReport, canTransition, canUseOwnerAction, isReportReason, isReportStatus } from "./report-queue";
describe("report queue policy", () => {
 test("allowlists roles and reasons", () => { expect(canManageReport("moderator")).toBe(true); expect(canManageReport("user")).toBe(false); expect(canUseOwnerAction("moderator")).toBe(false); expect(isReportReason("harassment")).toBe(true); expect(isReportReason("private_message")).toBe(false); });
 test("state machine is fail closed", () => { expect(canTransition("open", "triaged")).toBe(true); expect(canTransition("closed", "open")).toBe(false); expect(isReportStatus("actioned")).toBe(true); expect(isReportStatus("bogus")).toBe(false); });
});

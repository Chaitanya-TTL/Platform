import { afterEach, describe, expect, it } from "vitest";
import { register } from "../instrumentation";

const originalTelemetrySetting = process.env.COPILOTKIT_TELEMETRY_DISABLED;

afterEach(() => {
  if (originalTelemetrySetting === undefined) {
    delete process.env.COPILOTKIT_TELEMETRY_DISABLED;
  } else {
    process.env.COPILOTKIT_TELEMETRY_DISABLED = originalTelemetrySetting;
  }
});

describe("CopilotKit telemetry configuration", () => {
  it("disables external CopilotKit telemetry before the runtime handles requests", () => {
    delete process.env.COPILOTKIT_TELEMETRY_DISABLED;

    register();

    expect(process.env.COPILOTKIT_TELEMETRY_DISABLED).toBe("true");
  });
});

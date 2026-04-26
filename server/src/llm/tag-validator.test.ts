import { describe, it, expect } from "vitest";
import { validateTagContract } from "./tag-validator.js";

describe("validateTagContract", () => {
  it("Scenario: Valid tag set accepted", () => {
    const result = validateTagContract([
      "d:ai-agents",
      "t:harness-engineering",
      "t:agent-workflows",
      "a:fundamentals",
      "a:theory",
    ]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("Scenario: Missing d: tag rejected", () => {
    const result = validateTagContract(["t:harness-engineering", "a:theory"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing discipline tag/);
  });

  it("Scenario: Multiple d: tags rejected", () => {
    const result = validateTagContract(["d:ai-agents", "d:software-testing", "t:verification"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Multiple discipline tags/);
  });

  it("Scenario: Missing t: tag rejected", () => {
    const result = validateTagContract(["d:ai-agents", "a:fundamentals"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing topic tag/);
  });

  it("Scenario: Unknown a: axis rejected", () => {
    const result = validateTagContract(["d:ai-agents", "t:harness-engineering", "a:beginner"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unknown axis tag "a:beginner"/);
  });

  it("Scenario: Tag without prefix rejected", () => {
    const result = validateTagContract(["d:ai-agents", "harness-engineering"]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing role prefix/);
  });
});

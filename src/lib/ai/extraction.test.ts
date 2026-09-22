import { describe, it, expect } from "vitest";
import { stripCodeFence } from "./extraction";

describe("stripCodeFence", () => {
  it("passes plain JSON through unchanged", () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it("strips a ```json fenced block", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips a bare ``` fenced block", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("trims surrounding whitespace", () => {
    expect(stripCodeFence('  \n{"a":1}\n  ')).toBe('{"a":1}');
  });
});

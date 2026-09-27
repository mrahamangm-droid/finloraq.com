import { describe, it, expect } from "vitest";
import { evaluateMathExpression, isPlainNumberInProgress, MathExpressionError } from "./mathExpression";

describe("evaluateMathExpression", () => {
  it("evaluates a plain integer", () => {
    expect(evaluateMathExpression("100")).toBe(100);
  });

  it("evaluates a plain decimal", () => {
    expect(evaluateMathExpression("12.5")).toBe(12.5);
  });

  it("adds", () => {
    expect(evaluateMathExpression("100+50")).toBe(150);
  });

  it("subtracts", () => {
    expect(evaluateMathExpression("100-30")).toBe(70);
  });

  it("multiplies before adding (precedence)", () => {
    expect(evaluateMathExpression("2+3*4")).toBe(14);
  });

  it("divides", () => {
    expect(evaluateMathExpression("100/4")).toBe(25);
  });

  it("honors parentheses", () => {
    expect(evaluateMathExpression("(2+3)*4")).toBe(20);
  });

  it("handles unary minus", () => {
    expect(evaluateMathExpression("-5+10")).toBe(5);
  });

  it("handles a chain of operators", () => {
    expect(evaluateMathExpression("100+50-20*2/4")).toBe(140);
  });

  it("ignores surrounding whitespace and internal spaces", () => {
    expect(evaluateMathExpression("  100 + 50  ")).toBe(150);
  });

  it("tolerates a stray comma as a typo", () => {
    expect(evaluateMathExpression("1,000+50")).toBe(1050);
  });

  it("returns null for blank input", () => {
    expect(evaluateMathExpression("")).toBeNull();
    expect(evaluateMathExpression("   ")).toBeNull();
  });

  it("rejects division by zero", () => {
    expect(() => evaluateMathExpression("5/0")).toThrow(MathExpressionError);
  });

  it("rejects an unbalanced expression", () => {
    expect(() => evaluateMathExpression("5+")).toThrow(MathExpressionError);
    expect(() => evaluateMathExpression("(5+3")).toThrow(MathExpressionError);
    expect(() => evaluateMathExpression("5+3)")).toThrow(MathExpressionError);
  });

  it("rejects letters or other characters", () => {
    expect(() => evaluateMathExpression("5+abc")).toThrow(MathExpressionError);
    expect(() => evaluateMathExpression("alert(1)")).toThrow(MathExpressionError);
  });

  it("never uses eval/Function — confirms no code execution occurs", () => {
    // A string that would be dangerous if this evaluator ever fell back
    // to eval()/Function() must be rejected as a parse error, not
    // executed.
    expect(() => evaluateMathExpression("(() => 1)()")).toThrow(MathExpressionError);
  });
});

describe("isPlainNumberInProgress", () => {
  it("accepts an empty string, a bare minus, and partial decimals", () => {
    expect(isPlainNumberInProgress("")).toBe(true);
    expect(isPlainNumberInProgress("-")).toBe(true);
    expect(isPlainNumberInProgress("12.")).toBe(true);
    expect(isPlainNumberInProgress("-12.5")).toBe(true);
  });

  it("rejects anything containing an operator", () => {
    expect(isPlainNumberInProgress("100+")).toBe(false);
    expect(isPlainNumberInProgress("100*2")).toBe(false);
    expect(isPlainNumberInProgress("(100")).toBe(false);
  });
});

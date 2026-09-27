/**
 * Small, dependency-free arithmetic evaluator for amount/quantity fields
 * (MathInput, src/components/forms/math-input.tsx) — lets a user type
 * "100+50" or "12.5*3-2" into a number field and have it resolve to a
 * plain figure on blur, the way a spreadsheet cell or a physical
 * calculator would.
 *
 * Deliberately a hand-written recursive-descent parser rather than
 * `eval`/`Function` — this runs on financial-entry fields, so arbitrary
 * JS execution from pasted or typed text is not an acceptable risk
 * surface. The grammar only recognizes numbers, + - * / (with normal
 * precedence), unary +/-, and parentheses; nothing else, including
 * variables, function calls or exponents, is supported by design.
 *
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := ('+' | '-') factor | number | '(' expression ')'
 *   number     := digits ('.' digits)?
 */

export class MathExpressionError extends Error {}

type Token = { type: "num"; value: number } | { type: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input.charAt(j))) j++;
      const raw = input.slice(i, j);
      if (!/^\d*\.?\d*$/.test(raw) || raw === "" || raw === ".") {
        throw new MathExpressionError(`Invalid number "${raw}".`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new MathExpressionError(`Invalid number "${raw}".`);
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    throw new MathExpressionError(`Unexpected character "${ch}".`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consumeOp(value: string): boolean {
    const t = this.peek();
    if (t && t.type === "op" && t.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      if (this.consumeOp("+")) value += this.parseTerm();
      else if (this.consumeOp("-")) value -= this.parseTerm();
      else break;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      if (this.consumeOp("*")) value *= this.parseFactor();
      else if (this.consumeOp("/")) {
        const divisor = this.parseFactor();
        if (divisor === 0) throw new MathExpressionError("Division by zero.");
        value /= divisor;
      } else break;
    }
    return value;
  }

  private parseFactor(): number {
    if (this.consumeOp("+")) return this.parseFactor();
    if (this.consumeOp("-")) return -this.parseFactor();
    if (this.consumeOp("(")) {
      const value = this.parseExpression();
      if (!this.consumeOp(")")) throw new MathExpressionError("Missing closing parenthesis.");
      return value;
    }
    const t = this.peek();
    if (t && t.type === "num") {
      this.pos++;
      return t.value;
    }
    throw new MathExpressionError("Expected a number.");
  }

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }
}

/**
 * Evaluates a plain number or a simple arithmetic expression and returns
 * the numeric result, or `null` for blank/whitespace-only input. Throws
 * MathExpressionError for anything malformed, so callers can decide
 * whether to fall back to the previous value or surface an error.
 */
export function evaluateMathExpression(input: string): number | null {
  // Thousands separators (1,000+50) are a typo relative to this
  // evaluator's grammar, not an error a user typing an amount should
  // have to think about — strip them before tokenizing rather than
  // rejecting the whole expression over one stray comma.
  const trimmed = input.replace(/,/g, "").trim();
  if (trimmed === "") return null;
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return null;
  const parser = new Parser(tokens);
  const result = parser.parseExpression();
  if (!parser.atEnd()) throw new MathExpressionError("Unexpected trailing characters.");
  if (!Number.isFinite(result)) throw new MathExpressionError("Result is not a finite number.");
  return result;
}

/** True for input MathInput should treat as "still just a plain number,
 *  update live" rather than "an expression, wait for blur/Enter" — so
 *  typing an ordinary figure keeps updating any live total exactly as a
 *  plain <input type="number"> already does, and only a real expression
 *  (containing an operator) defers to evaluateMathExpression on commit. */
export function isPlainNumberInProgress(input: string): boolean {
  return /^-?\d*\.?\d*$/.test(input);
}

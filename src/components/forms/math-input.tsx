"use client";

import { useEffect, useRef, useState } from "react";
import { evaluateMathExpression, isPlainNumberInProgress, MathExpressionError } from "@/lib/mathExpression";

/**
 * A drop-in replacement for `<input type="number">` on amount/quantity
 * fields (expenses, invoice & bill line items, journal debit/credit)
 * that additionally accepts a typed arithmetic expression — "100+50",
 * "12.5*3", "(200-40)/2" — and resolves it to a plain figure once the
 * user is done, the way a calculator or a spreadsheet cell would.
 *
 * Behavior is deliberately split so it never regresses the plain-number
 * case: while the field holds nothing but digits/a decimal point (i.e.
 * `isPlainNumberInProgress`), every keystroke calls `onChange`
 * immediately — identical to a native number input, so any live total
 * that depends on this value (invoice/bill subtotal, journal debit vs.
 * credit) keeps updating as you type. Only once the text contains an
 * operator does it hold off calling `onChange` until the expression is
 * committed (blur, Enter, or Tab away), at which point it evaluates the
 * expression client-side (see src/lib/mathExpression.ts — a small
 * hand-written parser, never eval/Function) and replaces the field with
 * the numeric result. An invalid expression is left in the field with
 * an error outline instead of silently discarding what was typed or
 * propagating garbage to the parent form.
 */
export function MathInput({
  value,
  onChange,
  decimals,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  /** Rounds a *computed* expression result to this many decimal places
   *  (e.g. 2 for a currency amount). A plain number the user types is
   *  passed through untouched, exactly like the native input it
   *  replaces — only the output of an evaluated expression is rounded. */
  decimals?: number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  // Stay in sync with external updates (e.g. the row's Cancel button
  // resetting form state) as long as the user isn't mid-edit — mirrors
  // how a controlled <input> would already behave here.
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  function commit() {
    if (isPlainNumberInProgress(text)) {
      setInvalid(false);
      return;
    }
    try {
      const result = evaluateMathExpression(text);
      const formatted = result === null ? "" : String(decimals !== undefined ? Number(result.toFixed(decimals)) : result);
      setText(formatted);
      setInvalid(false);
      onChange(formatted);
    } catch (err) {
      if (err instanceof MathExpressionError) {
        setInvalid(true);
      } else {
        throw err;
      }
    }
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (invalid) setInvalid(false);
        if (isPlainNumberInProgress(next)) onChange(next);
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      title={invalid ? "Couldn't work out that expression — check it and try again." : undefined}
      aria-invalid={invalid || undefined}
      className={`${className ?? ""} ${invalid ? "border-destructive focus:outline-destructive" : ""}`}
    />
  );
}

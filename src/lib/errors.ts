/**
 * The record a request names doesn't exist in the caller's company — either
 * it never existed or it belongs to another tenant. The two are deliberately
 * indistinguishable. API routes map this to 404; it extends Error, so code
 * that already catches Error (and shows `message`) behaves as before.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * A request body is well-formed but names something it can't use — most often
 * a foreign key that isn't one of the caller's company's records. API routes
 * map this to 400 (src/lib/apiHandler.ts).
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

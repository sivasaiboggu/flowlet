/**
 * The one error shape the API uses, from brief section 4:
 * { "error": { "code", "message", "details" } }
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "MOCK_FAILURE";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Record<string, string>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(
  message: string,
  details: Record<string, string> = {},
): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function unauthorized(message: string): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

export function errorBody(err: ApiError): { error: { code: ErrorCode; message: string; details: Record<string, string> } } {
  return {
    error: { code: err.code, message: err.message, details: err.details },
  };
}

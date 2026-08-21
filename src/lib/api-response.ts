import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Thrown by backend services/route handlers for expected failure cases (bad credentials,
 * missing resource, ...). `apiErrorResponse` turns this into a consistent JSON error shape;
 * anything else (a genuine bug) becomes a generic 500 so internals never leak to the client.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string) =>
  new ApiError(400, "BAD_REQUEST", message);

export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (
  message = "You do not have access to this resource",
) => new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string) =>
  new ApiError(409, "CONFLICT", message);

export const tooManyRequests = (message = "Too many requests") =>
  new ApiError(429, "TOO_MANY_REQUESTS", message);

interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string[]> };
}

export function apiErrorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "One or more fields are invalid",
          fields: error.flatten().fieldErrors as Record<string, string[]>,
        },
      },
      { status: 422 },
    );
  }

  // Never leak internal details (stack traces, DB errors) to the client.
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  );
}

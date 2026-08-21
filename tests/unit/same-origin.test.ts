import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { isSameOrigin } from "@/lib/same-origin";

function requestWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as NextRequest;
}

describe("isSameOrigin", () => {
  it("allows a request with no Origin header (non-browser client)", () => {
    expect(isSameOrigin(requestWith({ host: "quizguard.example" }))).toBe(true);
  });

  it("allows a same-origin request", () => {
    const request = requestWith({
      origin: "https://quizguard.example",
      host: "quizguard.example",
    });
    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects a cross-origin request", () => {
    const request = requestWith({
      origin: "https://evil.example",
      host: "quizguard.example",
    });
    expect(isSameOrigin(request)).toBe(false);
  });

  it("rejects a malformed Origin header", () => {
    const request = requestWith({
      origin: "not-a-url",
      host: "quizguard.example",
    });
    expect(isSameOrigin(request)).toBe(false);
  });
});

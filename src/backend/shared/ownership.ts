import "server-only";

import { forbidden } from "@/lib/api-response";
import type { AuthUser } from "@/backend/auth/session";

/**
 * Every quiz/question-bank/class CRUD path funnels through this: a teacher may only touch rows
 * they created, an admin may touch anything. Kept as one function so "teacher A can't reach
 * teacher B's data" only has to be gotten right in a single place instead of copy-pasted (and
 * inevitably forgotten) at each call site.
 */
export function assertOwner(
  ownerId: string,
  requester: AuthUser,
  message = "You do not have access to this resource",
): void {
  if (requester.role === "admin") return;
  if (requester.id !== ownerId) throw forbidden(message);
}

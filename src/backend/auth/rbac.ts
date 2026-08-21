import "server-only";

import { forbidden, unauthorized } from "@/lib/api-response";
import { getCurrentUser, type AuthUser } from "@/backend/auth/session";
import type { UserRole } from "@/database/schema/users";

export function isRoleAllowed(
  user: AuthUser,
  role?: UserRole | UserRole[],
): boolean {
  if (!role) return true;
  return Array.isArray(role) ? role.includes(user.role) : user.role === role;
}

/**
 * For Route Handlers, which the Next.js authentication guide says to treat with the same
 * security considerations as public-facing endpoints: throws ApiError (401/403) for
 * `apiErrorResponse()` to turn into JSON. Pages don't use this — they call `getCurrentUser()`
 * directly so they can redirect unauthenticated and wrong-role users to different places
 * (`/login` vs. their own dashboard) rather than collapsing both into one failure case.
 */
export async function requireApiUser(
  role?: UserRole | UserRole[],
): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (!isRoleAllowed(user, role)) throw forbidden();
  return user;
}

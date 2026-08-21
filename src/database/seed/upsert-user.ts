import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, type User, type UserRole } from "@/database/schema";

/**
 * Insert-or-fetch so every seed script is safe to re-run. `onConflictDoNothing` +
 * `.returning()` gives back nothing on a conflict, so a plain SELECT fills in the row (with
 * its id) either way — every other seed function needs that id for FK rows.
 */
export async function upsertUser(
  input: { email: string; name: string; role: UserRole },
  passwordHash: string,
): Promise<User> {
  const [inserted] = await db
    .insert(users)
    .values({ ...input, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  return existing;
}

import { hashPassword } from "@/backend/auth/password";
import type { User } from "@/database/schema";
import { upsertUser } from "@/database/seed/upsert-user";

// Dev/test fixtures only — never used for production accounts.
export const TEST_PASSWORD = "Passw0rd!";

const coreTestUsers = [
  { email: "admin@quizguard.test", name: "Ada Admin", role: "admin" as const },
  {
    email: "teacher@quizguard.test",
    name: "Tara Teacher",
    role: "teacher" as const,
  },
  {
    email: "student@quizguard.test",
    name: "Sam Student",
    role: "student" as const,
  },
];

export interface SeededUsers {
  admin: User;
  teacher: User;
  student: User;
}

export async function seedUsers(): Promise<SeededUsers> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const [admin, teacher, student] = await Promise.all(
    coreTestUsers.map((user) => upsertUser(user, passwordHash)),
  );

  console.log(
    `Seeded ${coreTestUsers.length} test users (password: ${TEST_PASSWORD})`,
  );
  for (const user of coreTestUsers) {
    console.log(`  ${user.role.padEnd(8)} ${user.email}`);
  }

  return { admin, teacher, student };
}

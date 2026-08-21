import { pool } from "@/lib/db";
import { seedUsers } from "@/database/seed/users.seed";
import { seedAcademicData } from "@/database/seed/academic.seed";

async function run() {
  const { teacher, student } = await seedUsers();
  await seedAcademicData({ teacher, student });
}

run()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

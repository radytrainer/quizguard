import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/database/schema/users";

export const importSourceEnum = pgEnum("import_source", [
  "csv",
  "excel",
  "google_sheets",
  "json",
]);

/**
 * An audit record of a *completed* import run — created once at commit time, after rows have
 * already been validated and (for the valid ones) inserted as questions. There's no
 * "pending"/"processing" row: the in-progress preview/validate/remap loop lives in Redis
 * (backend/imports/import-session.ts), not here — see docs/ARCHITECTURE.md — Section 8.
 */
export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: importSourceEnum("source").notNull(),
    filename: text("filename"),
    totalRows: integer("total_rows").notNull(),
    successCount: integer("success_count").notNull(),
    errorCount: integer("error_count").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("imports_created_by_idx").on(table.createdBy)],
);

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
export type ImportSource = (typeof importSourceEnum.enumValues)[number];

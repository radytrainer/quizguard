import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { imports } from "@/database/schema/imports";

export const importErrors = pgTable(
  "import_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    message: text("message").notNull(),
    // The offending row as parsed from the source file, for the teacher to see what needs
    // fixing without re-opening the original spreadsheet.
    rawData: jsonb("raw_data").notNull().$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("import_errors_import_id_idx").on(table.importId)],
);

export type ImportError = typeof importErrors.$inferSelect;
export type NewImportError = typeof importErrors.$inferInsert;

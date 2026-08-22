import { conflict } from "@/lib/api-response";
import { MAX_IMPORT_ROWS } from "@/backend/imports/parse-limits";
import { IMPORT_FIELDS } from "@/backend/imports/import-row.schema";
import type { ParsedFile } from "@/backend/imports/csv-parser";

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;
const ANSWER_TYPES = new Set(["short_answer", "fill_in_blank"]);

interface JsonQuestionEntry {
  question?: unknown;
  type?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
  subject?: unknown;
  category?: unknown;
  difficulty?: unknown;
  points?: unknown;
  explanation?: unknown;
  tags?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Flattens one JSON question object into the same canonical option_a..option_d + correct_answer
// shape the CSV/Excel/Google Sheets sources already produce — this is what lets JSON reuse
// import-row.schema.ts's validation and import.service.ts's session/commit pipeline unchanged,
// rather than needing a parallel one. Unlike a spreadsheet, correct_answer here is always the
// option's actual text (never a letter) — parseImportRow accepts both, and text is what an AI
// asked to fill in the sample format naturally produces.
function toFlatRow(entry: unknown): Record<string, string> {
  const e: JsonQuestionEntry =
    typeof entry === "object" && entry !== null
      ? (entry as JsonQuestionEntry)
      : {};

  const type = asString(e.type).trim().toLowerCase() || "multiple_choice";
  const options = Array.isArray(e.options) ? e.options.map(asString) : [];

  const row: Record<string, string> = {
    question: asString(e.question),
    type,
    subject: asString(e.subject),
    category: asString(e.category),
    difficulty: asString(e.difficulty),
    points:
      typeof e.points === "number" && Number.isFinite(e.points)
        ? String(e.points)
        : "",
    explanation: asString(e.explanation),
    tags: Array.isArray(e.tags) ? e.tags.map(asString).join(", ") : "",
  };

  OPTION_LETTERS.forEach((letter, i) => {
    row[`option_${letter}`] = options[i] ?? "";
  });

  if (ANSWER_TYPES.has(type)) {
    // Every listed option is an accepted answer variant for these two types — there's no
    // "correct" one to single out, so `options` (not `correctAnswer`) is the source of truth.
    row.correct_answer = options.join(";");
  } else if (Array.isArray(e.correctAnswer)) {
    row.correct_answer = e.correctAnswer.map(asString).join(",");
  } else if (typeof e.correctAnswer === "string") {
    row.correct_answer = e.correctAnswer;
  } else {
    row.correct_answer = "";
  }

  return row;
}

export function parseJsonQuestions(text: string): ParsedFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw conflict(
      "Could not parse this as JSON — check for a missing comma, quote, or bracket",
    );
  }

  if (!Array.isArray(data)) {
    throw conflict(
      "Expected a JSON array of question objects — see the sample format",
    );
  }
  if (data.length === 0) {
    throw conflict("The JSON array is empty");
  }
  if (data.length > MAX_IMPORT_ROWS) {
    throw conflict(
      `JSON has ${data.length} questions, which exceeds the ${MAX_IMPORT_ROWS} row limit`,
    );
  }

  const rows = data.map(toFlatRow);

  // A pasted batch is meant to be one topic at a time (e.g. "10 questions about
  // Photosynthesis") — mixed subjects almost always means the AI/teacher drifted off-topic
  // mid-batch, not an intentional multi-subject import. Caught once here, before the per-row
  // pipeline, so it's one clear error instead of N confusing per-row ones. Rows missing a
  // subject entirely are left to parseImportRow's own "Missing subject" check.
  const subjects = new Set(
    rows.map((row) => row.subject.trim()).filter(Boolean),
  );
  if (subjects.size > 1) {
    throw conflict(
      `All questions in a pasted batch must use the same subject — found ${subjects.size}: ${[...subjects].join(", ")}. Paste one subject at a time.`,
    );
  }

  return {
    headers: [...IMPORT_FIELDS],
    rows,
  };
}

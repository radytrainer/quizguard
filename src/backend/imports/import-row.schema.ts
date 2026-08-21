import { questionInputSchema } from "@/backend/questions/question.schema";
import type { QuestionInput } from "@/backend/questions/question.schema";

/** Canonical fields a source row can map to — the example columns from Section 8, extended
 * with `type`/`tags`/`explanation` so all 5 question types are reachable, not just
 * multiple choice. */
export const IMPORT_FIELDS = [
  "question",
  "type",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "points",
  "subject",
  "category",
  "difficulty",
  "tags",
  "explanation",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Maps a canonical field to the actual header name found in the uploaded/connected sheet
 * (or null if that field has no matching column). */
export type ColumnMapping = Partial<Record<ImportField, string | null>>;

const OPTION_FIELDS = ["option_a", "option_b", "option_c", "option_d"] as const;
const OPTION_LETTERS = ["a", "b", "c", "d"] as const;
const VALID_TYPES = new Set<QuestionInput["type"]>([
  "multiple_choice",
  "true_false",
  "multiple_answer",
  "short_answer",
  "fill_in_blank",
]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

/** Best-effort exact-or-normalized match between a file's actual headers and our canonical
 * field names — e.g. "Correct Answer" or "correct-answer" both match "correct_answer". */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const normalize = (h: string) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    mapping[field] = headers.find((h) => normalize(h) === field) ?? null;
  }
  return mapping;
}

function getField(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  field: ImportField,
): string {
  const header = mapping[field];
  if (!header) return "";
  return (raw[header] ?? "").trim();
}

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  question?: QuestionInput;
  errors: string[];
}

/**
 * Parses and validates one source row against the current column mapping. `seenQuestions` is
 * shared across a batch so within-batch duplicates (same subject + question text) are caught;
 * against-existing-database duplicates are checked separately at commit time
 * (import.service.ts), since that needs a DB round trip this pure function shouldn't do.
 */
export function parseImportRow(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  rowNumber: number,
  seenQuestions: Set<string>,
): ParsedRow {
  const errors: string[] = [];

  const questionText = getField(raw, mapping, "question");
  if (!questionText) errors.push("Missing question");

  const subject = getField(raw, mapping, "subject");
  if (!subject) errors.push("Missing subject");

  const typeRaw = getField(raw, mapping, "type")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const type = (typeRaw || "multiple_choice") as QuestionInput["type"];
  if (!VALID_TYPES.has(type)) {
    errors.push(`Invalid question type "${typeRaw}"`);
  }

  const options = OPTION_FIELDS.map((field, i) => ({
    letter: OPTION_LETTERS[i],
    text: getField(raw, mapping, field),
  })).filter((o) => o.text);

  const correctAnswerRaw = getField(raw, mapping, "correct_answer");
  if (!correctAnswerRaw) errors.push("Missing answer");

  const pointsRaw = getField(raw, mapping, "points");
  let points = 1;
  if (pointsRaw) {
    const parsed = Number(pointsRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.push(`Invalid points "${pointsRaw}"`);
    } else {
      points = parsed;
    }
  }

  const category = getField(raw, mapping, "category") || undefined;
  const difficultyRaw = getField(raw, mapping, "difficulty").toLowerCase();
  const difficulty = (
    VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : "medium"
  ) as QuestionInput["difficulty"];
  const tags = getField(raw, mapping, "tags")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const explanation = getField(raw, mapping, "explanation") || undefined;

  if (questionText && subject) {
    const dedupeKey = `${subject.toLowerCase()}::${questionText.toLowerCase()}`;
    if (seenQuestions.has(dedupeKey)) {
      errors.push("Duplicate question");
    } else {
      seenQuestions.add(dedupeKey);
    }
  }

  // Build the options payload and cross-check correct_answer against the present options — this
  // is the one thing questionInputSchema can't validate for us, since it only knows about
  // isCorrect flags, not what a spreadsheet (or a pasted-JSON) author actually typed. Accepts
  // either the option's letter ("b") or its exact text ("Mitochondria", case-insensitive) so a
  // human — or an AI asked to fill in the sample JSON format — doesn't have to track which
  // letter goes with which option.
  const matchesOption = (
    rawAnswer: string,
    option: { letter: string; text: string },
  ) => {
    const normalized = rawAnswer.trim().toLowerCase();
    return (
      normalized === option.letter || normalized === option.text.toLowerCase()
    );
  };

  let questionOptions: { text: string; isCorrect?: boolean }[] = [];
  if (correctAnswerRaw && VALID_TYPES.has(type)) {
    if (type === "multiple_choice" || type === "true_false") {
      const matched = options.find((o) => matchesOption(correctAnswerRaw, o));
      if (!matched) {
        errors.push(`Invalid correct answer "${correctAnswerRaw}"`);
      }
      questionOptions = options.map((o) => ({
        text: o.text,
        isCorrect: o === matched,
      }));
    } else if (type === "multiple_answer") {
      const correctEntries = correctAnswerRaw
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const matchedOptions = new Set(
        correctEntries
          .map((entry) => options.find((o) => matchesOption(entry, o)))
          .filter((o): o is (typeof options)[number] => o !== undefined),
      );
      if (matchedOptions.size !== correctEntries.length) {
        errors.push(`Invalid correct answer "${correctAnswerRaw}"`);
      }
      questionOptions = options.map((o) => ({
        text: o.text,
        isCorrect: matchedOptions.has(o),
      }));
    } else {
      // short_answer / fill_in_blank: correct_answer holds the accepted text(s) directly,
      // not a letter — semicolon-separated for multiple acceptable variants.
      questionOptions = correctAnswerRaw
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
    }
  }

  if (errors.length > 0) {
    return { rowNumber, raw, errors };
  }

  const parsed = questionInputSchema.safeParse({
    type,
    subject,
    category,
    difficulty,
    points,
    text: questionText,
    explanation,
    tags,
    options: questionOptions,
  });

  if (!parsed.success) {
    return {
      rowNumber,
      raw,
      errors: [...new Set(parsed.error.issues.map((issue) => issue.message))],
    };
  }

  return { rowNumber, raw, question: parsed.data, errors: [] };
}

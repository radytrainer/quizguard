// Deliberately no "server-only" guard — imported directly from client components
// (features/questions/question-form.tsx, features/attempts/exam-attempt.tsx), same as
// question.schema.ts already is.
//
// The single source of truth for "which question types exist and what they can do" — before
// this module, five call sites each declared their own copy of a subset of this list
// (question-form.tsx, exam-attempt.tsx, answer.service.ts, the import pipeline, and
// live.schema.ts), and they'd already drifted once: exam-attempt.tsx's own CHOICE_TYPES set
// silently omitted multiple_answer, papered over by a separate ad hoc isMulti check. Every one
// of those call sites now imports from here instead of re-declaring its own list.
import type { QuestionType } from "@/database/schema";

export interface QuestionTypeMeta {
  type: QuestionType;
  label: string;
  // Whether the client marks correctness per option (question_options.is_correct is
  // meaningful) vs. every option row just being an accepted-answer variant.
  isChoice: boolean;
  // Checkbox (multiple correct) vs. radio (exactly one) — only meaningful when isChoice.
  isMultiSelect: boolean;
  // Reachable by the live (Kahoot-style) game's question pool — see live.service.ts's
  // createLiveSession, which filters to these; a synchronous fast-tap round can't accommodate
  // free text, essay, or code.
  liveEligible: boolean;
  // Reachable by the bulk CSV/JSON import pipeline.
  autoImportable: boolean;
}

export const QUESTION_TYPES: Record<QuestionType, QuestionTypeMeta> = {
  multiple_choice: {
    type: "multiple_choice",
    label: "Multiple Choice",
    isChoice: true,
    isMultiSelect: false,
    liveEligible: true,
    autoImportable: true,
  },
  true_false: {
    type: "true_false",
    label: "True/False",
    isChoice: true,
    isMultiSelect: false,
    liveEligible: true,
    autoImportable: true,
  },
  multiple_answer: {
    type: "multiple_answer",
    label: "Multiple Answer",
    isChoice: true,
    isMultiSelect: true,
    liveEligible: true,
    autoImportable: true,
  },
  short_answer: {
    type: "short_answer",
    label: "Short Answer",
    isChoice: false,
    isMultiSelect: false,
    liveEligible: false,
    autoImportable: true,
  },
  fill_in_blank: {
    type: "fill_in_blank",
    label: "Fill in the Blank",
    isChoice: false,
    isMultiSelect: false,
    liveEligible: false,
    autoImportable: true,
  },
  essay: {
    type: "essay",
    label: "Essay",
    isChoice: false,
    isMultiSelect: false,
    liveEligible: false,
    autoImportable: true,
  },
  numeric_answer: {
    type: "numeric_answer",
    label: "Numeric Answer",
    isChoice: false,
    isMultiSelect: false,
    liveEligible: false,
    autoImportable: true,
  },
  // Phase 16: the DB enum value and this metadata entry exist now so the schema/registry never
  // needs to change again, but no Zod branch, authoring UI, or exam UI accepts this type yet —
  // see question-form.tsx's CREATABLE_TYPES.
  code_answer: {
    type: "code_answer",
    label: "Code Answer",
    isChoice: false,
    isMultiSelect: false,
    liveEligible: false,
    autoImportable: false,
  },
};

export const ALL_QUESTION_TYPES = Object.keys(QUESTION_TYPES) as QuestionType[];
export const LIVE_QUESTION_TYPES = ALL_QUESTION_TYPES.filter(
  (t) => QUESTION_TYPES[t].liveEligible,
);
export const CHOICE_QUESTION_TYPES = ALL_QUESTION_TYPES.filter(
  (t) => QUESTION_TYPES[t].isChoice,
);
export const IMPORTABLE_QUESTION_TYPES = ALL_QUESTION_TYPES.filter(
  (t) => QUESTION_TYPES[t].autoImportable,
);

// Phase 16 — code_answer's target language. Not a DB enum re-export (questions.ts's
// codeLanguageEnum) since this module must stay import-safe for the browser and the standalone
// realtime process, and Drizzle's pg-core enum objects aren't meant for that; kept in sync by
// hand, checked by question-types.test.ts.
export type CodeLanguage = "html" | "css" | "python" | "javascript";
export const CODE_LANGUAGES: CodeLanguage[] = [
  "html",
  "css",
  "python",
  "javascript",
];

/**
 * Whether a *specific* question (not just its type) can only be scored by a human —
 * codeLanguage is a per-row field, not a type-level property, so this is a function rather than
 * a static registry flag. Essay always does; code_answer only for html/css, which has no
 * pass/fail exit code the way a python/javascript script run does.
 */
export function needsManualGrading(question: {
  type: QuestionType;
  codeLanguage?: string | null;
}): boolean {
  if (question.type === "essay") return true;
  if (question.type === "code_answer") {
    return question.codeLanguage === "html" || question.codeLanguage === "css";
  }
  return false;
}

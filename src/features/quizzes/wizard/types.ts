// Shared between every wizard step (src/features/quizzes/wizard/*) — one flat object mirroring
// quizInputSchema's fields, built up across steps before ever being sent to the API. `quizId`
// is null until the Details step's first "Continue" creates the quiz (POST); every step after
// that needs a real id to operate against (the question picker and assignments panel both call
// existing, already-working /api/quizzes/:id/* endpoints unchanged from the edit page).
export interface WizardFormState {
  title: string;
  description: string;
  subject: string;
  durationMinutes: number;
  passingScore: number;
  maxAttempts: number;
  questionsPerAttempt: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  autoSave: boolean;
  autoSubmit: boolean;
  showResults: boolean;
  fullscreenRequired: boolean;
  monitorActivity: boolean;
  startAt: string;
  endAt: string;
}

export const initialWizardForm: WizardFormState = {
  title: "",
  description: "",
  subject: "",
  durationMinutes: 60,
  passingScore: 70,
  maxAttempts: 1,
  questionsPerAttempt: 10,
  randomizeQuestions: false,
  randomizeOptions: false,
  autoSave: true,
  autoSubmit: true,
  showResults: true,
  fullscreenRequired: false,
  monitorActivity: false,
  startAt: "",
  endAt: "",
};

export const WIZARD_STEPS = [
  { step: 1, title: "Details", description: "Basic info and structure" },
  { step: 2, title: "Questions", description: "Build or import items" },
  { step: 3, title: "Rules", description: "Access and security" },
  { step: 4, title: "Review", description: "Final check" },
  { step: 5, title: "Publish", description: "Schedule and assign" },
] as const;

export function toQuizPayload(form: WizardFormState) {
  return {
    title: form.title,
    description: form.description || undefined,
    subject: form.subject,
    durationMinutes: form.durationMinutes,
    passingScore: form.passingScore,
    maxAttempts: form.maxAttempts,
    questionsPerAttempt: form.questionsPerAttempt,
    randomizeQuestions: form.randomizeQuestions,
    randomizeOptions: form.randomizeOptions,
    autoSave: form.autoSave,
    autoSubmit: form.autoSubmit,
    showResults: form.showResults,
    fullscreenRequired: form.fullscreenRequired,
    monitorActivity: form.monitorActivity,
    startAt: form.startAt || undefined,
    endAt: form.endAt || undefined,
  };
}

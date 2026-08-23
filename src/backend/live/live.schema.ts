import { z } from "zod";

// Only choice-based types fit a fast-tap live round — short_answer/fill_in_blank stay
// exam-only (see live.service.ts's question-pool filter).
export const LIVE_QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "multiple_answer",
] as const;

export const createLiveSessionSchema = z.object({
  // Omit to open the session to any authenticated student with the join code.
  classId: z.string().uuid().optional(),
  timeLimitSeconds: z.coerce.number().int().min(5).max(120).default(20),
});
export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;

// guestName/guestToken are only used by an unauthenticated ("anyone with the code", no account)
// join — a logged-in student or host is identified from their session cookie instead, and the
// realtime server ignores these two fields for them. See live.service.ts's joinSessionAsGuest.
export const liveJoinSchema = z.object({
  sessionId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(40).optional(),
  guestToken: z.string().uuid().optional(),
});
export type LiveJoinInput = z.infer<typeof liveJoinSchema>;

export const liveAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionIndex: z.number().int().min(0),
  selectedOptionIds: z.array(z.string().uuid()).max(10),
});
export type LiveAnswerInput = z.infer<typeof liveAnswerSchema>;

export const liveHostActionSchema = z.object({
  sessionId: z.string().uuid(),
});
export type LiveHostActionInput = z.infer<typeof liveHostActionSchema>;

// --- Shared broadcast/view shapes (server constructs these; client components import the same
// types for the socket event handlers) -----------------------------------------------------

export interface LiveOptionView {
  id: string;
  text: string;
}

// Never carries isCorrect — sent to students before they've answered.
export interface LiveQuestionView {
  questionIndex: number;
  totalQuestions: number;
  questionId: string;
  type: string;
  text: string;
  options: LiveOptionView[];
  timeLimitSeconds: number;
  startedAt: string; // ISO — client computes its own countdown from this + timeLimitSeconds
}

export interface LiveRosterEntry {
  participantId: string;
  // null for a guest ("anyone with the code", no account) participant.
  studentId: string | null;
  name: string;
}

export interface LiveRevealView {
  questionIndex: number;
  correctOptionIds: string[];
  distribution: Record<string, number>; // optionId -> pick count
  totalAnswered: number;
  totalParticipants: number;
}

export interface LiveYourResult {
  questionIndex: number;
  isCorrect: boolean;
  pointsAwarded: number;
  totalScore: number;
}

export interface LiveLeaderboardEntry {
  participantId: string;
  name: string;
  score: number;
  rank: number;
}

export interface LiveLeaderboardView {
  top: LiveLeaderboardEntry[];
}

export interface LiveStateSync {
  status: string;
  quizTitle: string;
  hostId: string;
  timeLimitSeconds: number;
  currentQuestion: LiveQuestionView | null;
  alreadyAnswered: boolean;
  score: number;
}

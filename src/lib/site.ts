// Single source of truth for site-wide SEO/branding strings — layout.tsx metadata, sitemap.ts,
// robots.ts, and any per-page metadata all pull from here so the canonical domain and the
// brand's name variants (QuizGuard, quizkh) never drift out of sync across files.

export const SITE_URL = "https://quizkh.store";
export const SITE_NAME = "QuizGuard";

// Search terms this app should be found under — the brand name, its domain-derived nickname
// ("quizkh"), and generic quiz/exam-platform terms. Feeds metadata.keywords and the JSON-LD
// alternateName list; deliberately not crammed into visible page copy, since keyword-stuffed
// body text reads worse to users and modern search ranking doesn't reward it anyway.
export const SITE_KEYWORDS = [
  "quiz",
  "quiz app",
  "online quiz",
  "quiz maker",
  "quiz platform",
  "quizkh",
  "quiz kh",
  "QuizGuard",
  "quiz guard",
  "online exam",
  "exam platform",
  "exam proctoring",
  "live quiz game",
  "classroom quiz",
];

export const SITE_TITLE =
  "QuizGuard (quizkh) — Free Online Quiz & Exam Platform";

export const SITE_DESCRIPTION =
  "QuizGuard (quizkh) is a free online quiz and exam platform for teachers: build quizzes, run live Kahoot-style quiz games, assign exams to classes, and monitor them with built-in academic-integrity proctoring.";

CREATE TYPE "public"."code_language" AS ENUM('html', 'css', 'python', 'javascript');--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'essay';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'numeric_answer';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'code_answer';--> statement-breakpoint
CREATE TABLE "question_test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"expected_output" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "numeric_tolerance" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "code_language" "code_language";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "starter_code" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "preview_html" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "reference_solution" text;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD COLUMN "graded_by" uuid;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD COLUMN "teacher_feedback" text;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD COLUMN "test_results" jsonb;--> statement-breakpoint
ALTER TABLE "question_test_cases" ADD CONSTRAINT "question_test_cases_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_test_cases_question_id_idx" ON "question_test_cases" USING btree ("question_id");--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
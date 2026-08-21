CREATE TYPE "public"."quiz_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"passing_score" integer NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"randomize_questions" boolean DEFAULT false NOT NULL,
	"randomize_options" boolean DEFAULT false NOT NULL,
	"fullscreen_required" boolean DEFAULT false NOT NULL,
	"monitor_activity" boolean DEFAULT false NOT NULL,
	"auto_save" boolean DEFAULT true NOT NULL,
	"auto_submit" boolean DEFAULT true NOT NULL,
	"show_results" boolean DEFAULT true NOT NULL,
	"questions_per_attempt" integer DEFAULT 1 NOT NULL,
	"status" "quiz_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"quiz_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_questions_quiz_id_question_id_pk" PRIMARY KEY("quiz_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quizzes_created_by_idx" ON "quizzes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "quizzes_status_idx" ON "quizzes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quizzes_subject_idx" ON "quizzes" USING btree ("subject");--> statement-breakpoint
CREATE INDEX "quiz_questions_question_id_idx" ON "quiz_questions" USING btree ("question_id");
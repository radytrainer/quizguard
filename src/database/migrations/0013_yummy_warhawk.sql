CREATE TYPE "public"."live_session_status" AS ENUM('lobby', 'question', 'reveal', 'leaderboard', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"class_id" uuid,
	"join_code" text NOT NULL,
	"status" "live_session_status" DEFAULT 'lobby' NOT NULL,
	"question_order" uuid[] NOT NULL,
	"current_question_index" integer,
	"current_question_started_at" timestamp with time zone,
	"time_limit_seconds" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "live_session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_session_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"selected_option_ids" uuid[] NOT NULL,
	"is_correct" boolean NOT NULL,
	"points_awarded" integer NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_participants" ADD CONSTRAINT "live_session_participants_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_participants" ADD CONSTRAINT "live_session_participants_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_answers" ADD CONSTRAINT "live_session_answers_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_answers" ADD CONSTRAINT "live_session_answers_participant_id_live_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."live_session_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_answers" ADD CONSTRAINT "live_session_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_sessions_quiz_id_idx" ON "live_sessions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "live_sessions_host_id_idx" ON "live_sessions" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_join_code_active_unique" ON "live_sessions" USING btree ("join_code") WHERE "live_sessions"."status" not in ('finished', 'cancelled');--> statement-breakpoint
CREATE INDEX "live_session_participants_session_id_idx" ON "live_session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_session_participants_session_student_unique" ON "live_session_participants" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "live_session_answers_session_id_idx" ON "live_session_answers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_session_answers_participant_question_unique" ON "live_session_answers" USING btree ("participant_id","question_index");
CREATE TYPE "public"."lock_event_action" AS ENUM('locked', 'unlocked');--> statement-breakpoint
CREATE TABLE "attempt_lock_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"action" "lock_event_action" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt_lock_events" ADD CONSTRAINT "attempt_lock_events_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_lock_events_attempt_id_idx" ON "attempt_lock_events" USING btree ("attempt_id");
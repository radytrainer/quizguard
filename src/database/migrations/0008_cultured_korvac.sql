CREATE TYPE "public"."violation_type" AS ENUM('fullscreen_exit', 'tab_switch', 'copy_paste');--> statement-breakpoint
CREATE TABLE "exam_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"type" "violation_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_violations" ADD CONSTRAINT "exam_violations_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_violations_attempt_id_idx" ON "exam_violations" USING btree ("attempt_id");
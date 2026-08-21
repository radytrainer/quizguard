ALTER TABLE "exam_attempts" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "locked_at" timestamp with time zone;
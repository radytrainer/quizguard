ALTER TABLE "live_session_participants" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "live_session_participants" ADD COLUMN "guest_token" uuid;--> statement-breakpoint
ALTER TABLE "live_session_participants" ADD COLUMN "display_name" text;--> statement-breakpoint
UPDATE "live_session_participants" p SET "display_name" = u."name" FROM "users" u WHERE u."id" = p."student_id" AND p."display_name" IS NULL;--> statement-breakpoint
ALTER TABLE "live_session_participants" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "live_session_participants_session_guest_unique" ON "live_session_participants" USING btree ("session_id","guest_token");
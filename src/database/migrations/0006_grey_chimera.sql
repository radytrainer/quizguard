CREATE TABLE "quiz_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"class_id" uuid,
	"student_id" uuid,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"assigned_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_assignments_target_xor" CHECK (("quiz_assignments"."class_id" is not null and "quiz_assignments"."student_id" is null) or ("quiz_assignments"."class_id" is null and "quiz_assignments"."student_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "quiz_assignments" ADD CONSTRAINT "quiz_assignments_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_assignments" ADD CONSTRAINT "quiz_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_assignments" ADD CONSTRAINT "quiz_assignments_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_assignments" ADD CONSTRAINT "quiz_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_assignments_quiz_id_idx" ON "quiz_assignments" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_assignments_class_id_idx" ON "quiz_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "quiz_assignments_student_id_idx" ON "quiz_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_assignments_quiz_class_unique" ON "quiz_assignments" USING btree ("quiz_id","class_id") WHERE "quiz_assignments"."class_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_assignments_quiz_student_unique" ON "quiz_assignments" USING btree ("quiz_id","student_id") WHERE "quiz_assignments"."student_id" is not null;
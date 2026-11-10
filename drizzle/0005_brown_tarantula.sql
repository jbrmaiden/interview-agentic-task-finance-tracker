CREATE TABLE "budget_alerts" (
	"budget_id" text NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_alerts_budget_month_uniq" ON "budget_alerts" USING btree ("budget_id","month");--> statement-breakpoint
CREATE INDEX "budget_alerts_user_idx" ON "budget_alerts" USING btree ("user_id");
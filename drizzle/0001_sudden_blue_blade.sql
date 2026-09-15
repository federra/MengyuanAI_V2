CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`remote_id` text,
	`config` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_generation_jobs_project_created` ON `generation_jobs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `model_configs` (
	`kind` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`secret` text NOT NULL
);

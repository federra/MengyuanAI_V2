ALTER TABLE `projects` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `idx_projects_deleted_at` ON `projects` (`deleted_at`);
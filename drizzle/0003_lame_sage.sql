CREATE TABLE `model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`secret` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_defaults` (
	`kind` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL
);

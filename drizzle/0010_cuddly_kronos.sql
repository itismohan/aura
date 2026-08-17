ALTER TABLE `crawl_step_history` ADD `screenshotKey` varchar(512);--> statement-breakpoint
ALTER TABLE `crawl_step_history` ADD `screenshotUrl` text;--> statement-breakpoint
ALTER TABLE `crawl_step_history` ADD `selector` text;--> statement-breakpoint
ALTER TABLE `crawl_step_history` ADD `selectorMetadataJson` text;
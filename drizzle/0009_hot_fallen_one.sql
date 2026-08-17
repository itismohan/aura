CREATE TABLE `crawl_step_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`stepIndex` int NOT NULL,
	`stepType` varchar(64) NOT NULL,
	`status` enum('started','succeeded','failed','waiting') NOT NULL,
	`label` varchar(255) NOT NULL,
	`url` varchar(2048),
	`detail` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crawl_step_history_id` PRIMARY KEY(`id`)
);

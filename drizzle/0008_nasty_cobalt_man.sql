CREATE TABLE `crawl_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`stage` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`redacted` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crawl_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crawl_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanJobId` int NOT NULL,
	`sessionId` int NOT NULL,
	`url` varchar(2048) NOT NULL,
	`title` varchar(255),
	`findingCount` int NOT NULL DEFAULT 0,
	`score` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crawl_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crawl_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scanJobId` int NOT NULL,
	`startUrl` varchar(2048) NOT NULL,
	`allowedUrlsJson` text NOT NULL,
	`stepsJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crawl_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `crawl_plans_scanJobId_unique` UNIQUE(`scanJobId`)
);
--> statement-breakpoint
CREATE TABLE `crawl_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanJobId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('starting','running','takeover','paused','completed','failed','cancelled') NOT NULL DEFAULT 'starting',
	`currentStep` int NOT NULL DEFAULT 0,
	`currentUrl` varchar(2048),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crawl_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `crawl_sessions_scanJobId_unique` UNIQUE(`scanJobId`)
);

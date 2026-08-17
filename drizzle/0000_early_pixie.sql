CREATE TABLE `scan_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanJobId` int NOT NULL,
	`stage` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scan_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanJobId` int NOT NULL,
	`ruleId` varchar(64) NOT NULL,
	`severity` enum('critical','serious','moderate','minor') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`selector` text,
	`evidence` text,
	`remediation` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scan_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scan_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`targetUrl` varchar(2048) NOT NULL,
	`scanType` enum('url','crawl','document') NOT NULL DEFAULT 'url',
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`score` int,
	`totalFindings` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `scan_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

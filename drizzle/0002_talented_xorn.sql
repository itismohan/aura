CREATE TABLE `scan_rate_limits` (
	`userId` int NOT NULL,
	`minuteBucket` int NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `scan_rate_limits_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_id` PRIMARY KEY(`id`)
);

CREATE TABLE `finding_workflow_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`findingId` int NOT NULL,
	`status` enum('open','acknowledged','in_progress','verified','closed') NOT NULL DEFAULT 'open',
	`updatedBy` int NOT NULL,
	`acknowledgedAt` timestamp,
	`inProgressAt` timestamp,
	`verifiedAt` timestamp,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finding_workflow_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `finding_workflow_states_findingId_unique` UNIQUE(`findingId`)
);

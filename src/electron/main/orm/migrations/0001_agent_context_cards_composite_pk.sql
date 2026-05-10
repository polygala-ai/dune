PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_context_cards` (
	`agent_id` text NOT NULL,
	`body` text NOT NULL,
	`eyebrow` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	PRIMARY KEY(`agent_id`, `id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_context_cards`("agent_id", "body", "eyebrow", "id", "title") SELECT "agent_id", "body", "eyebrow", "id", "title" FROM `agent_context_cards`;--> statement-breakpoint
DROP TABLE `agent_context_cards`;--> statement-breakpoint
ALTER TABLE `__new_agent_context_cards` RENAME TO `agent_context_cards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_context_cards_agent_idx` ON `agent_context_cards` (`agent_id`);
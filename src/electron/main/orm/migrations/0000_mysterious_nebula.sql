CREATE TABLE `agent_activity_events` (
	`agent_id` text NOT NULL,
	`detail` text,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_activity_events_agent_timestamp_idx` ON `agent_activity_events` (`agent_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `agent_coding_engine_events` (
	`agent_id` text NOT NULL,
	`engine_id` text NOT NULL,
	`error` text,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`prompt` text,
	`result` text,
	`step_label` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_coding_engine_events_agent_timestamp_idx` ON `agent_coding_engine_events` (`agent_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `agent_context_cards` (
	`agent_id` text NOT NULL,
	`body` text NOT NULL,
	`eyebrow` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_context_cards_agent_idx` ON `agent_context_cards` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_messages` (
	`agent_id` text NOT NULL,
	`attachments` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`format` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`usage` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_messages_agent_created_idx` ON `agent_messages` (`agent_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_transcript_archives` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`last_compacted_at` integer,
	`messages` text NOT NULL,
	`rolling_summary` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_ui_state` (
	`id` text PRIMARY KEY NOT NULL,
	`selected_agent_id` text
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`channel` text NOT NULL,
	`definition` text NOT NULL,
	`group_folder` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text NOT NULL,
	`preview` text NOT NULL,
	`project_id` text,
	`project_name` text,
	`project_root_path` text,
	`status` text NOT NULL,
	`telegram` text,
	`transcript` text NOT NULL,
	`updated_at` integer NOT NULL,
	`workspace` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_project_updated_idx` ON `agents` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `coding_engines` (
	`available` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`version` text
);
--> statement-breakpoint
CREATE TABLE `runtime_state` (
	`external_channels` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_streaming` integer NOT NULL,
	`runtime_info` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_setup_sessions` (
	`agent_id` text,
	`bot_username` text,
	`error_message` text,
	`id` text PRIMARY KEY NOT NULL,
	`matched_chat` text,
	`pair_code` text,
	`pair_expires_at` integer,
	`pairing_status` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_setup_sessions_agent_idx` ON `telegram_setup_sessions` (`agent_id`);--> statement-breakpoint
CREATE TABLE `agent_state_snapshots` (
	`agents` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`selected_agent_id` text
);
--> statement-breakpoint
CREATE TABLE `workflow_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coding_engine_settings` (
	`backend_type` text NOT NULL,
	`enabled_engine_ids` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_providers` (
	`auth_type` text NOT NULL,
	`base_url` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`is_default` integer NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `network_settings` (
	`bypass_rules` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`manual_proxy_url` text NOT NULL,
	`mode` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secret_entries` (
	`ciphertext` text NOT NULL,
	`encoding` text DEFAULT 'utf-8' NOT NULL,
	`key` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`actor` text,
	`created_at` integer NOT NULL,
	`description` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `workflow_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_events_item_created_idx` ON `workflow_events` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_item_activity_archives` (
	`events` text NOT NULL,
	`item_id` text PRIMARY KEY NOT NULL,
	`last_compacted_at` integer,
	`rolling_summary` text,
	FOREIGN KEY (`item_id`) REFERENCES `workflow_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_items` (
	`activity` text NOT NULL,
	`artifact_folder_name` text NOT NULL,
	`brief` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`primary_agent_id` text,
	`project_id` text NOT NULL,
	`scheduled_task_id` text,
	`sort_order` integer NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `workflow_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_items_primary_agent_idx` ON `workflow_items` (`primary_agent_id`);--> statement-breakpoint
CREATE INDEX `workflow_items_project_status_sort_idx` ON `workflow_items` (`project_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `workflow_items_project_updated_idx` ON `workflow_items` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workflow_projects` (
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`description` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`root_path` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_tasks` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`notes` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `workflow_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_tasks_item_updated_idx` ON `workflow_tasks` (`item_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workflow_ui_state` (
	`id` text PRIMARY KEY NOT NULL,
	`selected_item_id` text,
	`selected_project_filter` text NOT NULL,
	`selected_project_id` text,
	`selected_project_view` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_work_products` (
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `workflow_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_work_products_item_created_idx` ON `workflow_work_products` (`item_id`,`created_at`);
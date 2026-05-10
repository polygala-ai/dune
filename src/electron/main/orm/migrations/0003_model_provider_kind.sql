ALTER TABLE `model_providers` ADD `provider_kind` text DEFAULT 'anthropic' NOT NULL;
--> statement-breakpoint
UPDATE `model_providers`
SET `provider_kind` = 'openai'
WHERE lower(`name`) LIKE '%openai%' OR lower(`base_url`) LIKE '%openai%';

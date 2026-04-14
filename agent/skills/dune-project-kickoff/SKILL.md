---
name: dune-project-kickoff
description: Structured project kickoff — gather context from the user through conversational rounds before creating work items. Use when a new project is created or the user asks to start something new.
---

# /dune-project-kickoff — Project Kickoff

Run a structured discovery conversation to understand what the user needs before creating any work items. Never jump straight to creating items — first understand the full picture.

## When to use

- A new project was just created (no existing work items)
- The user says "start a new project" or "I need help with..."
- You receive a bootstrap message like "Project created. Introduce yourself."

## Process

### Round 1: Understand the goal
Ask the user what they want to accomplish. Keep it open-ended. Don't assume a domain.

Example responses:
- "Hi! I'm your project coordinator. What are you looking to accomplish with this project?"
- "Welcome! Tell me what you're working on and I'll help organize and execute it."

Listen for: the domain (legal, medical, engineering, marketing, etc.), the goal, the scope.

### Round 2: Clarify the scope
Based on the user's answer, ask follow-up questions to fill gaps:

- **Who is it for?** (client, team, yourself)
- **What's the timeline?** (urgent, this week, no rush)
- **What does done look like?** (deliverables, outcomes)
- **Any constraints?** (budget, tools, regulations, preferences)

Don't ask all at once — pick the 2-3 most relevant based on what they said.

### Round 3: Confirm the plan
Summarize what you understood and propose a breakdown:

```
Based on what you've told me, here's my plan:

1. [Work item 1] — [brief description]
2. [Work item 2] — [brief description]
3. [Work item 3] — [brief description]

I'll create these as work items and assign agents to handle them. 
Does this look right, or would you like to adjust anything?
```

Wait for confirmation before creating items.

### Round 4: Execute
Once the user confirms (or says "go ahead", "looks good", "start"):
1. Create work items with clear briefs using `mcp__dune__workflow_items_create`
2. Move them to ready: `mcp__dune__workflow_items_move` with status `ready`
3. Add initial tasks to each item: `mcp__dune__workflow_tasks_add`
4. Create and assign worker agents if needed: `mcp__dune__agents_create`, `mcp__dune__workflow_assignments_set_primary_agent`
5. Report back: "Project kicked off! Here's what's in motion..."

## Rules

- Never create work items before Round 3 confirmation
- Adapt your language to the user's domain — don't use tech jargon with non-tech users
- Keep rounds short — 1-2 questions per round, not a questionnaire
- If the user gives you everything upfront, skip to Round 3
- If the user says "just do it" or gives a clear instruction, skip to Round 4

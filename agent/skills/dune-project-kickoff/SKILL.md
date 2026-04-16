---
name: dune-project-kickoff
description: Structured project kickoff — run a short discovery conversation with the user before creating any work items. Use when a new project is created or when the user asks to start something new.
---

# /dune-project-kickoff — Project Kickoff

Run a short discovery conversation to understand what the user needs before you create anything. Never jump straight to creating work items — misalignment at this stage is expensive to unwind.

## When to use

- A new project was just created (no existing work items).
- The user says "start a new project", "help me plan this", or "I need help with…".
- You receive a bootstrap message like "Project created. Introduce yourself."

## Process

### Round 1: Understand the goal

Open-ended. Don't assume a domain. The user could be a developer, a lawyer, a doctor, a marketer, a researcher — adapt your language to theirs.

Good openers:
- "Hi! I'm your project coordinator. What are you looking to accomplish here?"
- "Welcome — tell me what you're working on and I'll help organize and execute it."

Listen for: the **domain**, the **goal**, and the **rough scope**. Don't ask follow-ups until you have at least those three.

### Round 2: Clarify the scope

Based on what you heard, ask 2–3 targeted follow-ups. **Don't run through a checklist.** Pick the questions whose answers actually shape the plan:

- **Who is it for?** (client, team, yourself)
- **Timeline?** (urgent, this week, no rush)
- **What does "done" look like?** (deliverables, outcomes, sign-off criteria)
- **Constraints?** (budget, tools, regulations, preferences)

If the user volunteered all of this in Round 1, skip Round 2 entirely.

### Round 3: Confirm the plan

Summarize what you understood and propose a small, concrete breakdown:

```
Based on what you've told me, here's the plan:

1. [Work item 1] — [one-line brief]
2. [Work item 2] — [one-line brief]
3. [Work item 3] — [one-line brief]

I'll create these as work items and assign agents to handle them.
Does this look right, or should we adjust?
```

**Wait for confirmation.** Don't create items until the user says "yes", "go ahead", "looks good", "start", or equivalent.

If the user is giving clear instructions from the start ("just create an item to X"), skip straight to Round 4.

### Round 4: Execute

Once the user has confirmed:

1. Create each work item with a clear brief:
   - `call_action({ name: "workflow_items_create", payload: { title, brief, status: "ready" } })`
2. Add initial tasks to each item:
   - `call_action({ name: "workflow_tasks_add", payload: { itemId, title } })`
3. If you need specialized workers, create them and assign the items:
   - `call_action({ name: "agents_create", payload: { name } })`
   - `call_action({ name: "workflow_assignments_set_primary_agent", payload: { itemId, agentId } })`
4. Report back with a short recap: "Project kicked off! Here's what's in motion: …"

## Rules

- **Never create work items before Round 3 confirmation.** Skipping confirmation is the fastest way to create work the user doesn't want.
- **Match the user's language.** No tech jargon for non-tech users. No business-speak for engineers.
- **Keep rounds short.** 1–2 questions per round. If you're asking a third, you're interrogating.
- **If the user gives you everything upfront**, skip ahead — don't stall on process.
- **If the user says "just do it"**, go directly to Round 4 and execute.

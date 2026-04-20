# Review: Telegram Send-Side Media

**Date:** 2026-04-19
**Reviewer:** Reviewer 1 (Mg_8MMfk) via Codex
**Verdict:** REJECTED

## Summary

The two previously required security fixes are not implemented. The outbound attachment resolver still accepts unsafe local path forms and never normalizes or bounds resolved workspace attachment paths to `<runtimeRoot>/groups/<groupFolder>/attachments/`, so `../` traversal remains possible. The send loop also still treats any post-first-attachment failure as a silent partial delivery, with no user-visible fallback or failure notice. Existing tests cover the happy path, long-caption fallback, and missing-file fallback, but there are no regression tests for either required fix.

## Issues

### BLOCKER: Outbound attachment resolution still permits traversal outside the attachments directory
`extractWorkspaceAttachmentPaths` in `src/shared/agents/message-content.ts:33,117-126` still matches `/workspace/group/attachments/../../...`, and `resolveTelegramAttachmentSource` in `src/electron/main/runtime/agent-runtime/index.ts:367-395` still accepts `file://` URIs and absolute paths. For workspace paths it slices after `/workspace/group/` and returns `path.join(options.groupsDir, options.groupFolder, relativePath)` without a `path.resolve(...)` plus containment check against `<runtimeRoot>/groups/<groupFolder>/attachments/` (`index.ts:378-388`). A crafted outbound message can therefore resolve and send files outside the group attachment directory if they exist. No regression test covers `../`, absolute-path, or `file://` rejection; the only extractor test is the positive case in `src/shared/agents/message-content.test.ts:26-35`.

### BLOCKER: Partial media-send failures are still silent after the first attachment succeeds
`wrapTelegramDriverForMedia` only tracks a boolean `didSendMedia` and falls back to `driver.sendMessage(jid, text)` when no attachment was sent at all (`src/electron/main/runtime/agent-runtime/index.ts:525-550`). If one attachment succeeds and a later `sendPhoto` or `sendDocument` call throws, the catch block only logs a warning and returns, so the Telegram recipient sees a partial set of attachments with no user-visible indication that delivery was incomplete. There is no regression test for this path: the outbound tests in `src/electron/main/runtime/agent-runtime.test.ts:1960-2088` cover success, long-caption fallback, and missing local files, but none simulate a later attachment send failure after an earlier one succeeds.

## Recommendation

Reject this change until both required fixes land: restrict extracted attachment paths to safe `/workspace/group/attachments/<name>` forms, resolve and validate local paths against the per-group attachments directory boundary, and surface per-attachment failures with explicit fallback or user-visible messaging when delivery is partial. Add regression tests for traversal rejection (`../`, absolute, `file://`) and for a multi-attachment send where a later attachment fails after an earlier one succeeds.

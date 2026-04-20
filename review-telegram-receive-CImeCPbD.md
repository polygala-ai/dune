# Review: Telegram Media Receive-Side

**Date:** 2026-04-19
**Reviewer:** Reviewer 1 (Mg_8MMfk) via Codex
**Verdict:** APPROVED

## Summary

I verified the receive-side attachment plumbing directly from the repository source on `main` and confirmed it is real code, not just described work. The implementation is present and connected end-to-end for the normal Telegram receive path: Telegram observer messages carry `attachments[]`, the runtime strips inline `/workspace/group/attachments/...` placeholders from transcript text, and attachment paths are normalized into local `file://` URLs for UI rendering.

I also ran targeted tests covering the stripping and normalization path plus the Telegram receive happy path:

```bash
npm exec -- vitest run src/electron/main/runtime/agent-message-attachments.test.ts src/shared/agents/message-content.test.ts src/electron/main/runtime/agent-runtime.test.ts -t "preserves Telegram media as attachment metadata instead of only inline placeholder text|normalizes workspace attachment paths into local file URLs|extracts Telegram-style workspace attachment paths from message text"
```

Those targeted tests passed.

## Branch/Commit Reviewed

- Branch: `main`
- Commit: `c2460f5e058a7bc9d68de1b6b94858a51a3ba9bf`
- Remote status: `origin/main` points to the same commit in this checkout

## Code Presence Verification

The code is present in the repo, with two file paths slightly different from the brief:

- `src/electron/main/runtime/dune-channel.ts:17` extends `onExternalInbound` to accept `attachments?: string[]`, and `src/electron/main/runtime/dune-channel.ts:94-97` forwards `msg.attachments` into that callback.
- `src/electron/main/runtime/dune-agent.ts:44` carries the same callback signature, and `src/electron/main/runtime/dune-agent.ts:103-109` passes it through to `DuneChannel`.
- `src/electron/main/runtime/telegram-bridge.ts:779-792` forwards inbound Telegram observer messages with `attachments = message.attachments ?? []`.
- `src/electron/main/runtime/agent-runtime/index.ts:1802-1818` strips inline workspace attachment paths from externally delivered text and normalizes inbound attachments for snapshot storage.
- `src/electron/main/runtime/agent-runtime/index.ts:1842-1868` does the same for Telegram observer delivery before dispatching input into the running agent.
- `src/electron/main/runtime/agent-message-attachments.ts:56-122` implements `normalizeAgentAttachments(...)`, converting `/workspace/group/...` sources into group-local `file://` URLs and inferring attachment kinds.
- `src/electron/main/runtime/agent-runtime.test.ts:1940-2005` contains a passing happy-path test that asserts Telegram media is preserved as attachment metadata rather than remaining only inline placeholder text.

## Issues

### NOTE: Inline path extraction is not used as a fallback attachment source

Both receive handlers call `extractWorkspaceAttachmentPaths(...)` but discard the returned `paths` array. `src/electron/main/runtime/agent-runtime/index.ts:1804-1813` and `src/electron/main/runtime/agent-runtime/index.ts:1853-1863` normalize only the separately supplied `attachmentSources`/`attachments` arrays. That means if the Telegram driver ever emits the placeholder text but omits `attachments[]`, the code will strip the path out of the transcript and then store no attachment metadata. Current tests only cover the case where both the inline placeholder and `attachments[]` are present.

### NOTE: Workspace-path stripping is narrow for unusual filenames

`src/shared/agents/message-content.ts:33` uses `WORKSPACE_ATTACHMENT_PATTERN = /\((\/workspace\/group\/attachments\/[^)\s]+)\)/g;`. This only matches attachment paths with no whitespace and no `)` characters. The current test covers `photo_100.png`, so the happy path is fine, but filenames containing spaces or parentheses would leave raw placeholder markup in the transcript even if `attachments[]` still arrives correctly.

## Recommendation

Approve the receive-side implementation as present and working on `main`. As follow-up hardening, merge `extractWorkspaceAttachmentPaths(...).paths` into the attachment source list before normalization, and add tests for filenames with spaces or parentheses plus one direct test of the `DuneChannel` `onExternalInbound` attachment-forwarding path.

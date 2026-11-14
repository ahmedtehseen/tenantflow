# Review guidance

## Stateful workspace forms

When reviewing form actions, draft reconciliation, or background refresh changes, trace the saved record through the workspace cache, rendered field values, native form lifecycle, and the next submitted payload. Assess whether form identity and reset behavior preserve unsaved edits and server-confirmed values throughout that sequence.

Require browser evidence for ticket status, priority, and assignee after a completed save, including a title-only second submission and a failed follow-up read. The regression is in `tests/browser/ticket-selection.spec.ts`. Pure reducers and mocked React hooks cover different boundaries and need complementary browser coverage.

For rejected writes, verify that the error is visible, edited fields remain available for retry, and the stored record retains its previous values. For background updates, verify that untouched fields follow current data while edited fields retain their drafts.

# Ticket selection regression retrospective

## Observed failure and cause

A successful ticket update stores the requested status, priority, and assignee. The success message and assignee summary reflect that record, while the native dropdowns show earlier options. A subsequent title-only save can submit those incorrect DOM selections and overwrite the stored values.

The browser reproduction saved `in_progress`, `high`, and the fixture member. The DOM then reported `open`, `low`, and an empty assignee. The native form reset after the React action completes changes the dropdown selections. The workspace draft values and saved cache remain correct, so an equal controlled value can leave the reset DOM selection unrepaired.

Preventing the reset on the ticket form alone made the same reproduction pass. Blocking follow-up reads still reproduced the failure. The fix gives the existing controlled drafts ownership of post-save reconciliation by preventing that native reset.

## History examined

- `3239f1d` added prop-to-form synchronization and keyed the form by ticket ID and update time to address an earlier desynchronization report.
- `574bc11` changed the form key to ticket ID while adding realtime state and draft preservation. This removed the remount behavior from the earlier fix. History establishes the change, while this session establishes the current failure mechanism.
- `eaa947c` introduced workspace draft baselines and cached screen reconciliation.
- `cdcd957` reconciled server-returned records before clearing drafts, addressing saved titles reverting when refresh failed.
- The November 13 implementation/review session `01a1d5b2-3c47-7463-97df-b66c90167a3b` recorded passing unit, lint, type, build, and temporary browser checks. Its browser scripts remain in `/tmp/tenantflow-verification/` on the investigation machine.

## Findings in severity order

### High — the acceptance check stopped before the reported symptom

The previous `acceptance.cjs` selected status and assignee, saved, and immediately navigated back to the list. It checked the saved title on the list. It did not assert the post-save dropdown values on the still-mounted detail form. The later `fixed-save-refresh.cjs` asserted the saved title under a failed read. Neither script compared all three native selections with the saved record or checked a second title-only submission.

The reducer/cache tests and manually simulated React-hook tests cannot reproduce browser form resets. Types, lint, and a build also accept this valid JSX. Review correctly caught another saved-state bug but generalized its title-only proof to the ticket form.

The added browser regression drives the actual detail screen, shared Select component, workspace drafts, server action, and cache reconciliation using an isolated in-memory Supabase transport. It asserts all three DOM selections after action completion and checks the stored values following a title-only second save. Successful and failed follow-up reads exercise both reconciliation paths.

### Medium — browser evidence was temporary and checks had no CI gate

The earlier browser scripts lived outside the repository. At investigation time, `package.json` exposed lint and unit tests, and the repository had neither a CI workflow nor an active pre-commit hook. The browser acceptance checks were unavailable to a fresh checkout and future reviews could skip them.

`npm run test:browser` now owns the regression, its local fixture, and automatic server setup. The Checks workflow runs lint, unit tests, the Chromium browser regression, and type checking on pull requests and main pushes. Repository branch-protection settings determine whether that workflow is mandatory for merging.

### Medium — review needed a cross-boundary consistency check

`CODING_STANDARDS.md` now asks reviewers to follow saved state through the cache, rendered controls, native lifecycle, and next payload, including rejected writes and unsaved drafts. `AGENTS.md` points reviewers to that guidance. Browser assertions enforce this concrete recurrence, while review evaluates how future form designs preserve the wider invariant.

## Reproduction and verification

The initial isolated-browser command was `node /tmp/tenantflow-verification/ticket-selection.cjs`. It failed with all three selections differing from the saved record. Repeating with only native reset prevention passed.

The committed replacement is `npm run test:browser`. Install its Chromium browser once with `npx playwright install chromium`. The Playwright configuration launches both the fixture service and the application with local fixture credentials. The test runs without hosted data or realtime delivery.

Verification passed on Node 22 with 248 existing tests, both browser regression cases, lint, type checking, and the production build. Both browser cases failed on the incorrect status selection before the fix and passed afterward.

The fixture exercises application state and browser behavior. Hosted Supabase authentication, RLS, database triggers, and websocket recovery have separate verification boundaries. CI configuration is checked locally, and its first hosted run remains pending until these changes are pushed.

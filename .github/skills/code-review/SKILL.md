---
name: code-review
description: Review priorities for opencode-localise-timestamps pull requests, what deserves real scrutiny versus what to skip. Use for every PR review.
---

# Review priorities

## Spend real attention here
- `src/localise.ts` regex/parse layer (`TIMESTAMP_RE`, `ISO_PARSE`, `DATETIME_PARSE`, `BARE_PARSE`) and the date math around it — leap years, DST, the midnight-boundary date rollover in `annotation()`, and the "already on UTC → no-op" guards in `replaceIso`/`annotation`. PR #4 was a dedicated bug-fix pass over exactly this code (code-block timestamps getting mangled, CRLF silently breaking fence detection, no-op ISO rewrites); walk any future change to these regexes or parse functions through the same cases before approving.
- `outsideCode()` in `src/localise.ts`, the hand-rolled fence/inline-code-span scanner that decides what counts as prose vs. code. It's a documented heuristic (indented code blocks and multi-line inline spans are intentionally unhandled) — a change here can silently widen or narrow what gets rewritten.
- Idempotency: `localiseUtcTimestamps` strips `ANNOTATION_RE` before rematching, and `experimental.chat.messages.transform` in `src/index.ts` strips annotations before messages re-enter model context. Breaking "running twice never stacks or re-converts" is a real regression, not a nit.
- The try/catch boundary around both hooks in `src/index.ts` exists so a formatting bug degrades to a no-op instead of breaking the reply stream or corrupting model context — flag any edit that narrows or removes it.

## Do not spend attention here
- `README.md` prose and its edge-case table — wording, not logic; only worth a comment if it now describes behavior the code doesn't actually have.
- `docs/assets/*` — a static screenshot, nothing to review.
- `.github/workflows/*.yml` — mostly synced from the org's shared template (see the recurring "sync caller templates from seankoji-com/.github" PRs); treat as infra plumbing, not application logic.
- Anything ESLint, `tsc`, or `bun test --coverage` already enforce in CI (style, types, coverage) — don't restate a CI failure as a review comment.

## Comment style
- One comment per real issue, not one per file it repeats in.
- Skip restating what CI or lint already flags.

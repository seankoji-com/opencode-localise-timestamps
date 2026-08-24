# opencode-localise-timestamps

Rewrites UTC timestamps in [OpenCode](https://opencode.ai) replies so they read in your local timezone.

When an assistant message says *"merged by you at 03:45 UTC"*, you shouldn't have to do clock arithmetic. This plugin scans every assistant reply as it completes and converts the UTC times it finds:

| The model writes | You see |
| --- | --- |
| `2026-08-24T03:45Z` | `2026-08-24T13:45:00+10:00` |
| `03:45 UTC` | `03:45 UTC (13:45 local)` |
| `2026-08-24 03:45 UTC` | `2026-08-24 03:45 UTC (13:45 local)` — or `(2026-08-23 23:45 local)` when the local date differs |

ISO instants are replaced outright with the equivalent offset form; prose forms keep their original text and gain a parenthesised annotation, so nothing is lost.

## Requirements

OpenCode ≥ 1.18 (plugin API). No configuration — the target zone is your machine's local timezone, resolved per-timestamp so DST is handled correctly.

## Install

Add to `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugin": ["opencode-localise-timestamps"]
}
```

Restart OpenCode. The plugin auto-installs from npm on startup.

## Behavior

- **What's converted** — ISO-Z instants (`…T03:45Z`, with or without seconds/fractional seconds), prose datetimes (`2026-08-24 03:45 UTC`), and bare times (`03:45 UTC`, `03:45:12 GMT`, any casing). Offsets like `UTC+10` or `UTC-5` are left alone.
- **Dateless times** — `03:45 UTC` carries no date, so it's anchored to today's UTC date before converting.
- **Impossible values** — `25:30 UTC` or `2026-02-30T00:00Z` pass through untouched.
- **Model context** — parenthetical annotations are stripped again before messages re-enter model history (`experimental.chat.messages.transform`), so the model never sees doubled timestamps. ISO replacements stay: they're standard timestamps describing the same instant.
- **Scope** — assistant text parts only. Tool output panels and your own messages are untouched. Timestamps inside code blocks are converted too; if that ever bites, quote them differently (`UTC` → `utc` in a comment won't help, but rephrasing will).
- **Failure mode** — every hook is guarded; a formatting error can never break streaming.

## Development

```sh
bun install
bun run typecheck
bun test
```

To try a local checkout, point `opencode.json` at the file instead of the npm spec:

```jsonc
{
  "plugin": ["/absolute/path/to/opencode-localise-timestamps/src/index.ts"]
}
```

## Releasing

Two equivalent paths — both run checks, build `dist/`, and publish to npm:

- **Actions UI**: *Actions → Release → Run workflow* (on `main`), pick **breaking / minor / bugfix**. The workflow opens a short-lived `release/vX.Y.Z` PR (satisfying protected-main rules like CodeQL), waits for it to merge, tags the merged commit, and publishes.
- **Tag push**: bump `package.json` via a PR, then `git tag v0.1.0 && git push origin v0.1.0`.

Publishing requires the `NPM_TOKEN` repository secret. For fully hands-off releases, also add a `RELEASE_PAT` secret (a PAT with repo contents + pull-request write): the release PR is then authored by you, so its checks skip GitHub's "workflow awaiting approval" gate that applies to bot-authored PRs. Without it, each release PR needs one manual "Approve and run" click.

## License

[MIT](./LICENSE)

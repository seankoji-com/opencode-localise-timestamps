# Agent guide

This Bun/TypeScript plugin annotates UTC timestamps in completed OpenCode replies.
User options and examples live in [README.md](README.md).

## Entry points

- `src/localise.ts`: timestamp parsing, timezone conversion, and code-span protection.
- `src/index.ts`: OpenCode hook and configuration wiring.
- `test/localise.test.ts`: conversion, daylight-saving boundaries, and idempotence.
- `test/index.test.ts`: plugin integration with a mocked host.

Keep conversion logic independent of the host. Preserve fenced/inline code and
idempotence; changing timezone must replace an existing annotation, not stack it.

## Verify

Run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`,
`bun test --coverage`, and `bun run build:verify`. Coverage is reported without a threshold.
CI tests Linux, macOS, and Windows. Use the package build script for releases.
Release workflow dispatch publishes to npm; it is not a validation command.

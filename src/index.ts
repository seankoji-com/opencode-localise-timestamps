import type { Plugin } from "@opencode-ai/plugin"
import { localiseUtcTimestamps, stripLocalAnnotations, type LocaliseOptions } from "./localise"

type LoosePart = { type?: string; text?: unknown }
type LooseMessage = { parts?: LoosePart[] }

/**
 * Reads the plugin config block from opencode.json, e.g.
 * `["opencode-localise-timestamps", { "timeZone": "Australia/Sydney" }]`.
 * Unrecognised or mistyped keys are ignored rather than rejected, since a
 * bad config value should degrade to defaults, not break every reply.
 */
function parseOptions(options: unknown): LocaliseOptions {
  const o = (options ?? {}) as Record<string, unknown>
  const opts: LocaliseOptions = {}
  if (typeof o.timeZone === "string") opts.timeZone = o.timeZone
  if (typeof o.skipCode === "boolean") opts.skipCode = o.skipCode
  return opts
}

/**
 * Rewrites UTC timestamps in assistant replies so they read in the viewer's
 * local timezone:
 *
 * - ISO instants ("2026-08-24T03:45Z") are replaced in place with the local
 *   offset form ("2026-08-24T13:45:00+10:00").
 * - Prose forms ("03:45 UTC", "2026-08-24 03:45 UTC") keep their original text
 *   and gain a parenthesised local annotation.
 *
 * Parenthetical annotations are stripped again before messages re-enter model
 * context; ISO replacements are standard timestamps and left as-is.
 *
 * Accepts `{ timeZone, skipCode }` as plugin options; both default to the
 * `localiseUtcTimestamps` defaults (system timezone, code spans skipped).
 */
const plugin: Plugin = async (_input, options) => {
  const opts = parseOptions(options)
  return {
    "experimental.text.complete": async (_input, output) => {
      try {
        if (typeof output.text !== "string" || !output.text.trim()) return
        output.text = localiseUtcTimestamps(output.text, opts)
      } catch {
        // Never break streaming over a formatting failure.
      }
    },
    "experimental.chat.messages.transform": async (_input, output) => {
      try {
        for (const msg of output.messages ?? []) {
          for (const part of (msg as LooseMessage).parts ?? []) {
            if (part?.type !== "text" || typeof part.text !== "string") continue
            if (!part.text.includes(" local)")) continue
            part.text = stripLocalAnnotations(part.text, opts)
          }
        }
      } catch {
        // Model context stays untouched on failure.
      }
    },
  }
}

export default plugin

/**
 * Pure helpers that find UTC timestamps in prose and rewrite or annotate them
 * with the equivalent wall-clock time in a target timezone (defaults to the
 * machine's local zone). Every match is parsed to a real instant first, so
 * conversions are DST-correct.
 *
 * Nothing here touches the network, the filesystem, or global state, so the
 * whole module is safe to call on every streamed reply.
 */

export type LocaliseOptions = {
  /** Reference instant for dateless times like "03:45 UTC". Defaults to now. */
  now?: Date
  /** IANA timezone name. Defaults to the system's local zone. */
  timeZone?: string
  /**
   * Leave fenced code blocks and inline code spans alone. Defaults to true:
   * a timestamp inside a command or a JSON payload is data, and rewriting it
   * would break copy-paste.
   */
  skipCode?: boolean
}

/** Annotation this module appends after prose timestamps: " (13:45 local)". */
const ANNOTATION_RE = / \((?:\d{4}-\d{2}-\d{2} )?\d{1,2}:\d{2}(?::\d{2})? local\)/g

/**
 * All timestamp shapes in one alternation so a single left-to-right pass
 * consumes each span once (later branches can never re-match inside an
 * earlier branch's span):
 *
 * 1. ISO instant:      2026-08-24T03:45Z / 2026-08-24T03:45:00.123Z
 * 2. Prose datetime:   2026-08-24 03:45 UTC
 * 3. Bare time:        03:45 UTC / 03:45:12 GMT
 *
 * The trailing `\b` stops "03:45 UTCish" from matching, and the negative
 * lookahead keeps fixed-offset spellings like "09:00 UTC-5" or "09:00 UTC +10"
 * intact: those name a zone rather than an instant in UTC.
 */
const TIMESTAMP_RE =
  /\b(?:\d{4}-\d{2}-\d{2}T\d{1,2}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,9})?[Zz]\b|\d{4}-\d{2}-\d{2}[ \t]\d{1,2}:[0-5]\d(?::[0-5]\d)?[ \t](?:UTC|GMT)\b(?![ \t]*[+-]\d)|\d{1,2}:[0-5]\d(?::[0-5]\d)?[ \t]?(?:UTC|GMT)\b(?![ \t]*[+-]\d))/gi

const ISO_PARSE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?:\.\d{1,9})?[Zz]$/i

const DATETIME_PARSE =
  /^(\d{4})-(\d{2})-(\d{2})[ \t](\d{1,2}):([0-5]\d)(?::([0-5]\d))?[ \t](?:UTC|GMT)$/i

const BARE_PARSE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?[ \t]?(?:UTC|GMT)$/i

const pad = (n: number): string => String(n).padStart(2, "0")

type WallClock = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

/**
 * Intl.DateTimeFormat construction dominates the cost of a conversion, and a
 * reply can hold dozens of timestamps, so formatters are memoised per zone.
 * The key set is bounded by the number of zones a caller asks for.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? ""
  const cached = FORMATTERS.get(key)
  if (cached) return cached
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  FORMATTERS.set(key, dtf)
  return dtf
}

/** The wall-clock reading in `timeZone` at `instant`. */
function wallClock(instant: Date, timeZone?: string): WallClock {
  const parts: Record<string, string> = {}
  for (const p of formatterFor(timeZone).formatToParts(instant)) parts[p.type] = p.value
  return {
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
    second: parts.second ?? "",
  }
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (east positive). */
function tzOffsetMinutes(instant: Date, timeZone?: string): number {
  const w = wallClock(instant, timeZone)
  const asUTC = Date.UTC(
    Number(w.year),
    Number(w.month) - 1,
    Number(w.day),
    Number(w.hour),
    Number(w.minute),
    Number(w.second),
  )
  return Math.round((asUTC - instant.getTime()) / 60_000)
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/**
 * Parse a UTC wall-clock reading into a real instant. Returns null for
 * impossible values ("2026-02-30", hour 25) so callers leave them untouched.
 */
function utcInstant(
  y: string,
  mo: string,
  d: string,
  h: string,
  mi: string,
  s: string | undefined,
): Date | null {
  const hour = Number(h)
  if (hour > 23) return null
  const month = Number(mo)
  if (month < 1 || month > 12) return null
  const instant = new Date(
    Date.UTC(Number(y), month - 1, Number(d), hour, Number(mi), s ? Number(s) : 0),
  )
  if (Number.isNaN(instant.getTime())) return null
  // Round-trip guard rejects overflow dates like 2026-02-30 (Date.UTC rolls
  // them into March; the components then disagree with the input). It also
  // rejects years 0-99, which Date.UTC maps into the 1900s.
  if (String(instant.getUTCFullYear()) !== y) return null
  if (pad(instant.getUTCMonth() + 1) !== mo) return null
  if (pad(instant.getUTCDate()) !== d) return null
  return instant
}

/** Local time as "13:45", or "13:45:12" when the source carried seconds. */
function clockText(w: WallClock, withSeconds: boolean): string {
  return withSeconds ? `${w.hour}:${w.minute}:${w.second}` : `${w.hour}:${w.minute}`
}

/**
 * " (13:45 local)", or " (2026-08-23 23:45 local)" when the local date differs
 * from the UTC date the reader just read. Dropping the date on a day boundary
 * is how you turn a correct conversion into a misleading one.
 */
function annotation(
  instant: Date,
  utcDate: string,
  withSeconds: boolean,
  tz?: string,
): string | null {
  // A zero offset means the reader is already on UTC: the annotation would
  // just restate the time already on the line. Same reasoning as the
  // no-op-on-UTC guard in replaceIso, applied to the two prose forms too.
  if (tzOffsetMinutes(instant, tz) === 0) return null
  const w = wallClock(instant, tz)
  const localDate = `${w.year}-${w.month}-${w.day}`
  const time = clockText(w, withSeconds)
  return ` (${localDate === utcDate ? time : `${localDate} ${time}`} local)`
}

/** "2026-08-24T03:45Z" -> "2026-08-24T13:45:00+10:00" */
function replaceIso(g: RegExpExecArray, opts: LocaliseOptions): string | null {
  const [, y = "", mo = "", d = "", h = "", mi = "", s] = g
  const instant = utcInstant(y, mo, d, h, mi, s)
  if (!instant) return null
  const offsetMin = tzOffsetMinutes(instant, opts.timeZone)
  // A zero offset means the reader is already on UTC. Rewriting "…Z" to
  // "…+00:00" would be pure churn, so leave the text exactly as written.
  if (offsetMin === 0) return null
  const w = wallClock(instant, opts.timeZone)
  return `${w.year}-${w.month}-${w.day}T${w.hour}:${w.minute}:${w.second}${formatOffset(offsetMin)}`
}

/** "2026-08-24 03:45 UTC" -> " (2026-08-23 23:45 local)" when the date shifts */
function annotateDatetime(g: RegExpExecArray, opts: LocaliseOptions): string | null {
  const [, y = "", mo = "", d = "", h = "", mi = "", s] = g
  const instant = utcInstant(y, mo, d, h, mi, s)
  if (!instant) return null
  return annotation(instant, `${y}-${mo}-${d}`, s !== undefined, opts.timeZone)
}

/** "03:45 UTC" -> " (13:45 local)", anchored to the UTC date of `now`. */
function annotateBare(g: RegExpExecArray, opts: LocaliseOptions): string | null {
  const [, h = "", mi = "", s] = g
  const now = opts.now ?? new Date()
  const y = String(now.getUTCFullYear())
  const mo = pad(now.getUTCMonth() + 1)
  const d = pad(now.getUTCDate())
  const instant = utcInstant(y, mo, d, h, mi, s)
  if (!instant) return null
  return annotation(instant, `${y}-${mo}-${d}`, s !== undefined, opts.timeZone)
}

function localiseOneMatch(match: string, opts: LocaliseOptions): string {
  const iso = ISO_PARSE.exec(match)
  if (iso) return replaceIso(iso, opts) ?? match

  const datetime = DATETIME_PARSE.exec(match)
  if (datetime) return match + (annotateDatetime(datetime, opts) ?? "")

  const bare = BARE_PARSE.exec(match)
  if (bare) return match + (annotateBare(bare, opts) ?? "")

  return match
}

// ---------------------------------------------------------------------------
// Markdown code awareness
// ---------------------------------------------------------------------------

/** Opens or closes a fenced block: up to three spaces, then ``` or ~~~. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Index of a backtick run of exactly `length` starting at or after `from`,
 * or -1. Runs longer than `length` cannot close the span (CommonMark).
 */
function closingBacktickRun(line: string, from: number, length: number): number {
  for (let i = from; i < line.length; i++) {
    if (line[i] !== "`") continue
    let j = i
    while (j < line.length && line[j] === "`") j++
    if (j - i === length) return i
    i = j - 1
  }
  return -1
}

/**
 * Apply `fn` to everything in `text` except fenced code blocks and inline code
 * spans. Two CommonMark cases are intentionally not handled, since covering
 * them needs a real block parser and the false positives from a heuristic
 * would cost more than the rare miss:
 * - Indented (four-space) code blocks aren't detected — hard to tell apart
 *   from a wrapped list item.
 * - An inline code span's backticks are matched only within a single line,
 *   so a span that legally wraps across a line break isn't recognised (the
 *   text inside gets treated as prose and can be converted).
 */
function outsideCode(text: string, fn: (chunk: string) => string): string {
  const out: string[] = []
  let plain = ""
  const flush = () => {
    if (plain) out.push(fn(plain))
    plain = ""
  }

  // Split keeping the newline on the end of each line, so joining is lossless.
  const lines = text.split("\n")
  let fence: { char: string; length: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "") + (i < lines.length - 1 ? "\n" : "")
    // Strip a trailing \r too: `.` in FENCE_RE excludes it, so a CRLF file
    // would otherwise never match the fence pattern at all.
    const fenceMatch = FENCE_RE.exec(line.replace(/\r?\n$/, ""))

    if (fence) {
      out.push(line)
      const marker = fenceMatch?.[1]
      if (
        marker &&
        marker[0] === fence.char &&
        marker.length >= fence.length &&
        (fenceMatch?.[2] ?? "").trim() === ""
      ) {
        fence = null
      }
      continue
    }

    if (fenceMatch?.[1]) {
      flush()
      out.push(line)
      fence = { char: fenceMatch[1][0] ?? "`", length: fenceMatch[1].length }
      continue
    }

    // Inline code spans, scanned within this line only.
    let cursor = 0
    let plainStart = 0
    while (cursor < line.length) {
      if (line[cursor] !== "`") {
        cursor++
        continue
      }
      let runEnd = cursor
      while (runEnd < line.length && line[runEnd] === "`") runEnd++
      const runLength = runEnd - cursor
      const close = closingBacktickRun(line, runEnd, runLength)
      if (close === -1) {
        cursor = runEnd
        continue
      }
      plain += line.slice(plainStart, cursor)
      flush()
      out.push(line.slice(cursor, close + runLength))
      cursor = plainStart = close + runLength
    }
    plain += line.slice(plainStart)
  }

  flush()
  return out.join("")
}

/** Run `fn` over the whole string, or only over its non-code parts. */
function applyToProse(text: string, opts: LocaliseOptions, fn: (chunk: string) => string): string {
  return opts.skipCode === false ? fn(text) : outsideCode(text, fn)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rewrite every UTC timestamp in `text` for the target timezone:
 *
 * - ISO instants (`2026-08-24T03:45Z`) are replaced in place with the local
 *   offset form (`2026-08-24T13:45:00+10:00`).
 * - Prose forms (`03:45 UTC`, `2026-08-24 03:45 UTC`) keep their original text
 *   and gain a parenthesised local annotation.
 *
 * Fenced code blocks and inline code spans are left alone unless
 * `skipCode: false` is passed.
 *
 * Idempotent: annotations from an earlier pass are dropped before scanning.
 */
export function localiseUtcTimestamps(text: string, options: LocaliseOptions = {}): string {
  return applyToProse(text, options, (chunk) =>
    chunk.replace(ANNOTATION_RE, "").replace(TIMESTAMP_RE, (m) => localiseOneMatch(m, options)),
  )
}

/** Remove annotations added by {@link localiseUtcTimestamps}. */
export function stripLocalAnnotations(text: string, options: LocaliseOptions = {}): string {
  return applyToProse(text, options, (chunk) => chunk.replace(ANNOTATION_RE, ""))
}

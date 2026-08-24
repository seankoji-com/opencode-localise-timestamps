/**
 * Pure helpers that find UTC timestamps in prose and rewrite or annotate them
 * with the equivalent wall-clock time in a target timezone (defaults to the
 * machine's local zone). Every match is parsed to a real instant first, so
 * conversions are DST-correct.
 */

export type LocaliseOptions = {
  /** Reference instant for dateless times like "03:45 UTC". Defaults to now. */
  now?: Date
  /** IANA timezone name. Defaults to the system's local zone. */
  timeZone?: string
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
 */
const TIMESTAMP_RE =
  /\b(?:\d{4}-\d{2}-\d{2}T\d{1,2}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,9})?[Zz]|\d{4}-\d{2}-\d{2} \d{1,2}:[0-5]\d(?::[0-5]\d)? (?:UTC|GMT)(?![+-]\d)|\d{1,2}:[0-5]\d(?::[0-5]\d)?[ \t]?(?:UTC|GMT)(?![+-]\d))/gi

const ISO_PARSE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?:\.\d{1,9})?[Zz]$/

const DATETIME_PARSE =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):([0-5]\d)(?::([0-5]\d))? (?:UTC|GMT)$/i

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

function wallClock(instant: Date, timeZone?: string): WallClock {
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
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value
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

function isoParts(m: string): [string, string, string, string, string, string | undefined] | null {
  const g = ISO_PARSE.exec(m)
  if (!g) return null
  return [g[1] ?? "", g[2] ?? "", g[3] ?? "", g[4] ?? "", g[5] ?? "", g[6]]
}

function datetimeParts(
  m: string,
): [string, string, string, string, string, string | undefined] | null {
  const g = DATETIME_PARSE.exec(m)
  if (!g) return null
  return [g[1] ?? "", g[2] ?? "", g[3] ?? "", g[4] ?? "", g[5] ?? "", g[6]]
}

function bareParts(m: string): [string, string, string | undefined] | null {
  const g = BARE_PARSE.exec(m)
  if (!g) return null
  return [g[1] ?? "", g[2] ?? "", g[3]]
}

/**
 * Parse a UTC wall-clock reading into a real instant. Returns null for
 * impossible values ("2026-02-30", hour 25) so callers leave them untouched.
 */
function utcInstant(
  y: string,
  mo: string,
  d: string | null,
  h: string,
  mi: string,
  s: string | undefined,
): Date | null {
  const hour = Number(h)
  if (hour > 23) return null
  const month = Number(mo)
  if (month < 1 || month > 12) return null
  const day = d === null ? null : Number(d)
  const instant = new Date(
    Date.UTC(Number(y), month - 1, day ?? 1, hour, Number(mi), s ? Number(s) : 0),
  )
  if (Number.isNaN(instant.getTime())) return null
  // Round-trip guard rejects overflow dates like 2026-02-30 (Date.UTC rolls
  // them into March; the components then disagree with the input).
  if (String(instant.getUTCFullYear()) !== y) return null
  if (pad(instant.getUTCMonth() + 1) !== mo) return null
  if (day !== null && pad(instant.getUTCDate()) !== d) return null
  return instant
}

/** "2026-08-24T03:45Z" -> "2026-08-24T13:45:00+10:00" */
function replaceIso(match: string, opts: LocaliseOptions): string {
  const p = isoParts(match)
  if (!p) return match
  const [y, mo, d, h, mi, s] = p
  const instant = utcInstant(y, mo, d, h, mi, s)
  if (!instant) return match
  const offsetMin = tzOffsetMinutes(instant, opts.timeZone)
  const shifted = new Date(instant.getTime() + offsetMin * 60_000)
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    formatOffset(offsetMin)
  )
}

/** "03:45 UTC" -> " (13:45 local)" */
function annotateBare(match: string, opts: LocaliseOptions): string | null {
  const p = bareParts(match)
  if (!p) return null
  const [h, mi, s] = p
  const now = opts.now ?? new Date()
  const instant = utcInstant(
    String(now.getUTCFullYear()),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    h,
    mi,
    s,
  )
  if (!instant) return null
  const w = wallClock(instant, opts.timeZone)
  const time = s ? `${w.hour}:${w.minute}:${w.second}` : `${w.hour}:${w.minute}`
  return ` (${time} local)`
}

/** "2026-08-24 03:45 UTC" -> " (2026-08-23 23:45 local)" when the date shifts */
function annotateDatetime(match: string, opts: LocaliseOptions): string | null {
  const p = datetimeParts(match)
  if (!p) return null
  const [y, mo, d, h, mi, s] = p
  const instant = utcInstant(y, mo, d, h, mi, s)
  if (!instant) return null
  const offsetMin = tzOffsetMinutes(instant, opts.timeZone)
  const shifted = new Date(instant.getTime() + offsetMin * 60_000)
  const w = wallClock(shifted, "UTC")
  const time = s ? `${w.hour}:${w.minute}:${w.second}` : `${w.hour}:${w.minute}`
  const localDate = `${w.year}-${w.month}-${w.day}`
  const body = localDate !== `${y}-${mo}-${d}` ? `${localDate} ${time}` : time
  return ` (${body} local)`
}

/**
 * Rewrite every UTC timestamp in `text` for the target timezone:
 *
 * - ISO instants (`2026-08-24T03:45Z`) are replaced in place with the local
 *   offset form (`2026-08-24T13:45:00+10:00`).
 * - Prose forms (`03:45 UTC`, `2026-08-24 03:45 UTC`) keep their original text
 *   and gain a parenthesised local annotation.
 *
 * Idempotent: annotations from an earlier pass are dropped before scanning.
 */
export function localiseUtcTimestamps(text: string, options: LocaliseOptions = {}): string {
  const clean = text.replace(ANNOTATION_RE, "")
  return clean.replace(TIMESTAMP_RE, (m) => {
    // ISO matches end in Z/z; prose matches end in UTC/GMT.
    if (/[Zz]$/.test(m)) return replaceIso(m, options)
    if (/^\d{4}/.test(m)) {
      const ann = annotateDatetime(m, options)
      return ann === null ? m : m + ann
    }
    const ann = annotateBare(m, options)
    return ann === null ? m : m + ann
  })
}

/** Remove annotations added by {@link localiseUtcTimestamps}. */
export function stripLocalAnnotations(text: string): string {
  return text.replace(ANNOTATION_RE, "")
}

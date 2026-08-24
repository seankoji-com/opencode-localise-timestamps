import { describe, expect, test } from "bun:test"
import { localiseUtcTimestamps, stripLocalAnnotations } from "../src/localise"

const SYDNEY = { timeZone: "Australia/Sydney" }
const NYC = { timeZone: "America/New_York" }
const UTC = { timeZone: "UTC" }
const KOLKATA = { timeZone: "Asia/Kolkata" } // UTC+5:30, no DST
const NEWFOUNDLAND = { timeZone: "America/St_Johns" } // UTC-3:30 / -2:30 DST

// August 2026: Sydney is AEST (+10:00), New York is EDT (-04:00).
describe("ISO-Z timestamps", () => {
  test("replaced in place with local offset form", () => {
    expect(localiseUtcTimestamps("merged 2026-08-24T03:45Z done", SYDNEY)).toBe(
      "merged 2026-08-24T13:45:00+10:00 done",
    )
  })

  test("seconds always emitted, preserved from input", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45:12Z", SYDNEY)).toBe("2026-08-24T13:45:12+10:00")
  })

  test("fractional seconds dropped", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45:00.123Z", SYDNEY)).toBe(
      "2026-08-24T13:45:00+10:00",
    )
  })

  test("date shifts backwards for negative offsets", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45Z", NYC)).toBe("2026-08-23T23:45:00-04:00")
  })

  test("date shifts forwards across a month boundary", () => {
    expect(localiseUtcTimestamps("2026-08-31T23:45Z", SYDNEY)).toBe("2026-09-01T09:45:00+10:00")
  })

  test("date shifts backwards across a year boundary", () => {
    expect(localiseUtcTimestamps("2026-01-01T00:30Z", NYC)).toBe("2025-12-31T19:30:00-05:00")
  })

  test("DST-aware offset (Sydney January is +11:00)", () => {
    expect(localiseUtcTimestamps("2026-01-05T00:30Z", SYDNEY)).toBe("2026-01-05T11:30:00+11:00")
  })

  test("half-hour offset zone (Kolkata is always +05:30)", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45Z", KOLKATA)).toBe("2026-08-24T09:15:00+05:30")
  })

  test("half-hour offset zone shifts to -02:30 for Newfoundland DST", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45Z", NEWFOUNDLAND)).toBe(
      "2026-08-24T01:15:00-02:30",
    )
  })

  test("UTC target zone is left untouched (no-op rewrite avoided)", () => {
    const text = "merged 2026-08-24T03:45Z done"
    expect(localiseUtcTimestamps(text, UTC)).toBe(text)
  })

  test("impossible date left untouched", () => {
    const text = "due 2026-02-30T03:45Z ok"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("Feb 29 on a leap year is valid", () => {
    // Sydney runs AEDT (+11:00) in February, not the AEST (+10:00) used
    // elsewhere in this file for the August examples.
    expect(localiseUtcTimestamps("2028-02-29T03:45Z", SYDNEY)).toBe("2028-02-29T14:45:00+11:00")
  })

  test("Feb 29 on a non-leap year is left untouched", () => {
    const text = "2026-02-29T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("hour 25 left untouched", () => {
    const text = "at 2026-08-24T25:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("month 13 left untouched", () => {
    const text = "at 2026-13-01T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("lowercase z accepted", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45z", SYDNEY)).toBe("2026-08-24T13:45:00+10:00")
  })

  test("multiple ISO timestamps in one string all converted", () => {
    expect(
      localiseUtcTimestamps("start 2026-08-24T03:45Z end 2026-08-24T04:00Z", SYDNEY),
    ).toBe("start 2026-08-24T13:45:00+10:00 end 2026-08-24T14:00:00+10:00")
  })

  test("trailing text right after Z is not swallowed into the match", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45Zish", SYDNEY)).toBe("2026-08-24T03:45Zish")
  })
})

// Bare times have no date; they are anchored to the UTC date of `now`.
describe("bare times", () => {
  const opts = { ...SYDNEY, now: new Date("2026-08-24T00:00:00Z") }

  test("annotated with local time", () => {
    expect(localiseUtcTimestamps("at 03:45 UTC we merged", opts)).toBe(
      "at 03:45 UTC (13:45 local) we merged",
    )
  })

  test("GMT and seconds preserved in annotation", () => {
    expect(localiseUtcTimestamps("03:45:12 GMT", opts)).toBe("03:45:12 GMT (13:45:12 local)")
  })

  test("date rolls forward in the annotation across midnight", () => {
    expect(localiseUtcTimestamps("23:45 UTC", opts)).toBe("23:45 UTC (2026-08-25 09:45 local)")
  })

  test("date rolls backward in the annotation across midnight", () => {
    expect(localiseUtcTimestamps("01:00 UTC", { ...NYC, now: opts.now })).toBe(
      "01:00 UTC (2026-08-23 21:00 local)",
    )
  })

  test("hour > 23 untouched", () => {
    expect(localiseUtcTimestamps("99:00 UTC", opts)).toBe("99:00 UTC")
  })

  test("minute > 59 untouched (not matched at all)", () => {
    const text = "09:60 UTC"
    expect(localiseUtcTimestamps(text, opts)).toBe(text)
  })

  test("UTC offset suffix not mangled", () => {
    expect(localiseUtcTimestamps("09:00 UTC-5", opts)).toBe("09:00 UTC-5")
  })

  test("UTC offset suffix with a space not mangled", () => {
    expect(localiseUtcTimestamps("09:00 UTC +10", opts)).toBe("09:00 UTC +10")
  })

  test("lowercase utc", () => {
    expect(localiseUtcTimestamps("03:45 utc", opts)).toBe("03:45 utc (13:45 local)")
  })

  test("defaults `now` to the current instant when omitted", () => {
    const result = localiseUtcTimestamps("03:45 UTC", SYDNEY)
    expect(result).toMatch(/^03:45 UTC \(\d{2}:\d{2}(?: local| \d{4}-\d{2}-\d{2})/)
  })

  test("UTC target zone gets no annotation (would just restate the time)", () => {
    const text = "03:45 UTC"
    expect(localiseUtcTimestamps(text, { ...opts, timeZone: "UTC" })).toBe(text)
  })
})

describe("prose datetimes", () => {
  test("same local date keeps time-only annotation", () => {
    expect(localiseUtcTimestamps("on 2026-08-24 03:45 UTC", SYDNEY)).toBe(
      "on 2026-08-24 03:45 UTC (13:45 local)",
    )
  })

  test("shifted local date included in annotation", () => {
    expect(localiseUtcTimestamps("on 2026-08-24 03:45 UTC", NYC)).toBe(
      "on 2026-08-24 03:45 UTC (2026-08-23 23:45 local)",
    )
  })

  test("seconds preserved in annotation", () => {
    expect(localiseUtcTimestamps("on 2026-08-24 03:45:30 UTC", SYDNEY)).toBe(
      "on 2026-08-24 03:45:30 UTC (13:45:30 local)",
    )
  })

  test("impossible date untouched", () => {
    const text = "on 2026-02-30 03:45 UTC"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("GMT spelling also matched", () => {
    expect(localiseUtcTimestamps("on 2026-08-24 03:45 GMT", SYDNEY)).toBe(
      "on 2026-08-24 03:45 GMT (13:45 local)",
    )
  })

  test("UTC target zone gets no annotation, same as the bare-time and ISO forms", () => {
    const text = "on 2026-08-24 03:45 UTC"
    expect(localiseUtcTimestamps(text, { timeZone: "UTC" })).toBe(text)
  })
})

describe("safety", () => {
  test("non-UTC times untouched", () => {
    const text = "standup at 09:00 AEST sharp"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("plain text untouched", () => {
    const text = "No timestamps here, just words and (parentheses)."
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("empty string untouched", () => {
    expect(localiseUtcTimestamps("", SYDNEY)).toBe("")
  })

  test("garbage timezone throws (Intl surfaces its own error; the plugin hook is what catches it)", () => {
    expect(() => localiseUtcTimestamps("03:45 UTC", { timeZone: "Not/AZone" })).toThrow()
  })

  describe("idempotence", () => {
    test("ISO + bare time mix", () => {
      const text = "PR merged 2026-08-24T03:45Z after checks at 03:40 UTC"
      const once = localiseUtcTimestamps(text, SYDNEY)
      expect(localiseUtcTimestamps(once, SYDNEY)).toBe(once)
    })

    test("prose datetime with a date-shifted annotation", () => {
      const text = "on 2026-08-24 03:45 UTC"
      const once = localiseUtcTimestamps(text, NYC)
      expect(localiseUtcTimestamps(once, NYC)).toBe(once)
    })

    test("re-running with a different timezone re-annotates rather than stacking", () => {
      const text = "03:45 UTC"
      const opts = { now: new Date("2026-08-24T00:00:00Z") }
      const sydneyPass = localiseUtcTimestamps(text, { ...opts, ...SYDNEY })
      const nycPass = localiseUtcTimestamps(sydneyPass, { ...opts, ...NYC })
      expect(nycPass).toBe("03:45 UTC (2026-08-23 23:45 local)")
    })
  })
})

describe("code awareness", () => {
  test("fenced code block (backtick) is left untouched", () => {
    const text = "before\n```\ncurl -d 2026-08-24T03:45Z\n```\nafter 2026-08-24T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(
      "before\n```\ncurl -d 2026-08-24T03:45Z\n```\nafter 2026-08-24T13:45:00+10:00",
    )
  })

  test("fenced code block (tilde) is left untouched", () => {
    const text = "~~~\n2026-08-24T03:45Z\n~~~\n2026-08-24T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(
      "~~~\n2026-08-24T03:45Z\n~~~\n2026-08-24T13:45:00+10:00",
    )
  })

  test("fence with an info string still opens the block", () => {
    const text = "```json\n2026-08-24T03:45Z\n```"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("CRLF line endings still open and close a fence", () => {
    const text = "before\r\n```\r\ncurl 2026-08-24T03:45Z\r\n```\r\nafter 2026-08-24T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(
      "before\r\n```\r\ncurl 2026-08-24T03:45Z\r\n```\r\nafter 2026-08-24T13:45:00+10:00",
    )
  })

  test("indented fence markers (up to 3 spaces) are recognised", () => {
    const text = "  ```\n  2026-08-24T03:45Z\n  ```"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("a shorter fence line inside a longer fence does not close it", () => {
    const text = "````\n```\n2026-08-24T03:45Z\n```\n````"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("unterminated fence runs to the end of the string", () => {
    const text = "```\n2026-08-24T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("inline code span is left untouched, surrounding prose is not", () => {
    const opts = { ...SYDNEY, now: new Date("2026-08-24T00:00:00Z") }
    expect(localiseUtcTimestamps("run `at 03:45 UTC` but plain 03:45 UTC works", opts)).toBe(
      "run `at 03:45 UTC` but plain 03:45 UTC (13:45 local) works",
    )
  })

  test("double-backtick span protects a single backtick inside it", () => {
    const text = "``code ` with 2026-08-24T03:45Z backtick``"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("unbalanced single backtick is not treated as a code span", () => {
    const text = "a ` b 2026-08-24T03:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe("a ` b 2026-08-24T13:45:00+10:00")
  })

  test("skipCode: false converts timestamps inside code too", () => {
    const text = "```\n2026-08-24T03:45Z\n```"
    expect(localiseUtcTimestamps(text, { ...SYDNEY, skipCode: false })).toBe(
      "```\n2026-08-24T13:45:00+10:00\n```",
    )
  })

  test("idempotent across a mix of prose and fenced code", () => {
    const text = "prose 2026-08-24T03:45Z and code:\n```\n2026-08-24T03:45Z\n```"
    const once = localiseUtcTimestamps(text, SYDNEY)
    expect(localiseUtcTimestamps(once, SYDNEY)).toBe(once)
  })
})

describe("stripLocalAnnotations", () => {
  test("removes bare-time annotations", () => {
    expect(stripLocalAnnotations("03:45 UTC (13:45 local)")).toBe("03:45 UTC")
  })

  test("removes datetime annotations", () => {
    expect(stripLocalAnnotations("2026-08-24 03:45 UTC (2026-08-23 23:45 local)")).toBe(
      "2026-08-24 03:45 UTC",
    )
  })

  test("removes seconds-precision annotations", () => {
    expect(stripLocalAnnotations("03:45:12 GMT (13:45:12 local)")).toBe("03:45:12 GMT")
  })

  test("leaves unrelated parentheses alone", () => {
    expect(stripLocalAnnotations("(see docs) at 03:45 UTC (13:45 local)")).toBe(
      "(see docs) at 03:45 UTC",
    )
  })

  test("leaves an annotation-shaped span inside code alone", () => {
    expect(stripLocalAnnotations("`(13:45 local)` and 03:45 UTC (13:45 local)")).toBe(
      "`(13:45 local)` and 03:45 UTC",
    )
  })

  test("no-op on text without annotations", () => {
    const text = "nothing to strip here"
    expect(stripLocalAnnotations(text)).toBe(text)
  })
})

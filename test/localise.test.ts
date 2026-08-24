import { describe, expect, test } from "bun:test"
import { localiseUtcTimestamps, stripLocalAnnotations } from "../src/localise"

const SYDNEY = { timeZone: "Australia/Sydney" }
const NYC = { timeZone: "America/New_York" }

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

  test("DST-aware offset (Sydney January is +11:00)", () => {
    expect(localiseUtcTimestamps("2026-01-05T00:30Z", SYDNEY)).toBe("2026-01-05T11:30:00+11:00")
  })

  test("impossible date left untouched", () => {
    const text = "due 2026-02-30T03:45Z ok"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("hour 25 left untouched", () => {
    const text = "at 2026-08-24T25:45Z"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("lowercase z accepted", () => {
    expect(localiseUtcTimestamps("2026-08-24T03:45z", SYDNEY)).toBe("2026-08-24T13:45:00+10:00")
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

  test("hour > 23 untouched", () => {
    expect(localiseUtcTimestamps("99:00 UTC", opts)).toBe("99:00 UTC")
  })

  test("UTC offset suffix not mangled", () => {
    expect(localiseUtcTimestamps("09:00 UTC-5", opts)).toBe("09:00 UTC-5")
  })

  test("lowercase utc", () => {
    expect(localiseUtcTimestamps("03:45 utc", opts)).toBe("03:45 utc (13:45 local)")
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

  test("impossible date untouched", () => {
    const text = "on 2026-02-30 03:45 UTC"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })
})

describe("safety", () => {
  test("non-UTC times untouched", () => {
    const text = "standup at 09:00 AEST sharp"
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
  })

  test("idempotent", () => {
    const text = "PR merged 2026-08-24T03:45Z after checks at 03:40 UTC"
    const once = localiseUtcTimestamps(text, SYDNEY)
    expect(localiseUtcTimestamps(once, SYDNEY)).toBe(once)
  })

  test("plain text untouched", () => {
    const text = "No timestamps here, just words and (parentheses)."
    expect(localiseUtcTimestamps(text, SYDNEY)).toBe(text)
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

  test("leaves unrelated parentheses alone", () => {
    expect(stripLocalAnnotations("(see docs) at 03:45 UTC (13:45 local)")).toBe(
      "(see docs) at 03:45 UTC",
    )
  })
})

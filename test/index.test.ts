import { describe, expect, test } from "bun:test"
import plugin from "../src/index"

// The hooks call Intl with no explicit timeZone, so pin the process default
// to make assertions deterministic across machines and CI runners.
process.env.TZ = "Australia/Sydney"

async function hooksOf(options?: unknown) {
  return plugin({} as any, options as any)
}

describe("plugin", () => {
  test("registers the text.complete and messages.transform hooks", async () => {
    const hooks = await hooksOf()
    expect(typeof hooks["experimental.text.complete"]).toBe("function")
    expect(typeof hooks["experimental.chat.messages.transform"]).toBe("function")
  })
})

describe("plugin options", () => {
  test("timeZone option overrides the process default", async () => {
    const hooks = await hooksOf({ timeZone: "America/New_York" })
    const output: any = { text: "2026-08-24T03:45Z" }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBe("2026-08-23T23:45:00-04:00")
  })

  test("skipCode: false lets fenced code timestamps convert too", async () => {
    const hooks = await hooksOf({ skipCode: false })
    const output: any = { text: "```\n2026-08-24T03:45Z\n```" }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBe("```\n2026-08-24T13:45:00+10:00\n```")
  })

  test("malformed option values are ignored, falling back to defaults", async () => {
    const hooks = await hooksOf({ timeZone: 42, skipCode: "nope" })
    const output: any = { text: "2026-08-24T03:45Z" }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBe("2026-08-24T13:45:00+10:00")
  })
})

describe("experimental.text.complete", () => {
  test("localises UTC timestamps in the streamed text, in place", async () => {
    const hooks = await hooksOf()
    const output: any = { text: "merged 2026-08-24T03:45Z done" }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBe("merged 2026-08-24T13:45:00+10:00 done")
  })

  test("leaves blank text untouched", async () => {
    const hooks = await hooksOf()
    const output: any = { text: "   " }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBe("   ")
  })

  test("leaves non-string text untouched", async () => {
    const hooks = await hooksOf()
    const output: any = { text: undefined }
    await hooks["experimental.text.complete"]!({} as any, output)
    expect(output.text).toBeUndefined()
  })

  test("swallows a formatting failure instead of breaking the stream", async () => {
    const hooks = await hooksOf()
    const output: any = {}
    Object.defineProperty(output, "text", {
      get() {
        throw new Error("boom")
      },
    })
    await expect(
      hooks["experimental.text.complete"]!({} as any, output),
    ).resolves.toBeUndefined()
  })
})

describe("experimental.chat.messages.transform", () => {
  test("strips local annotations from text parts only", async () => {
    const hooks = await hooksOf()
    const output: any = {
      messages: [
        {
          info: {},
          parts: [
            { type: "text", text: "merged at 03:45 UTC (13:45 local)" },
            { type: "text", text: "no annotation here" },
            { type: "tool", text: "03:45 UTC (13:45 local)" },
          ],
        },
      ],
    }
    await hooks["experimental.chat.messages.transform"]!({}, output)
    expect(output.messages[0].parts[0].text).toBe("merged at 03:45 UTC")
    expect(output.messages[0].parts[1].text).toBe("no annotation here")
    expect(output.messages[0].parts[2].text).toBe("03:45 UTC (13:45 local)")
  })

  test("skips text parts without the annotation marker (no-op fast path)", async () => {
    const hooks = await hooksOf()
    const part = { type: "text", text: "plain reply, nothing to strip" }
    const output: any = { messages: [{ info: {}, parts: [part] }] }
    await hooks["experimental.chat.messages.transform"]!({}, output)
    expect(output.messages[0].parts[0]).toBe(part)
  })

  test("tolerates a missing messages array instead of throwing", async () => {
    const hooks = await hooksOf()
    const output: any = {}
    await expect(
      hooks["experimental.chat.messages.transform"]!({}, output),
    ).resolves.toBeUndefined()
  })

  test("tolerates a message with no parts", async () => {
    const hooks = await hooksOf()
    const output: any = { messages: [{ info: {} }] }
    await expect(
      hooks["experimental.chat.messages.transform"]!({}, output),
    ).resolves.toBeUndefined()
  })
})

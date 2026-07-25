# AI provider

Natural-language field reports (bonus 3) are the **only** place an LLM is used.
Everything on the hazard path — validation, risk fusion, state classification,
incident lifecycle, priority ranking, actuation — is deterministic backend code
and stays that way.

## The chain

```
AI_PROVIDER=openrouter          OpenRouter  ──fails──▶  Groq  ──fails──▶  deterministic extractor
AI_PROVIDER=groq                Groq        ──fails──▶  OpenRouter ─────▶  deterministic extractor
AI_PROVIDER=none  (default)                                              deterministic extractor
```

`AI_PROVIDER` names the **primary**. Any other provider with a key configured is
appended as a fallback, and `extractor.deterministic.ts` is the floor in every
case. Selecting a provider without its key refuses to boot — that is a
configuration mistake, not a silent downgrade. Having _no_ key configured is not
a mistake: it is the default, and the feature works fully without one.

Both vendors speak the OpenAI chat-completions dialect, so
[`openai-compatible.provider.ts`](../backend/src/ai/openai-compatible.provider.ts)
drives both. The fallback path is therefore the same code as the primary path,
not a second implementation that rots.

**No key and no model name ever reaches the browser.** Everything is read from
`backend/.env` by `src/config/env.ts` and shaped into a chain by
`src/config/ai.config.ts`. The frontend has no idea which extractor ran; it only
renders the confirmation message.

## Configuration

| Key                                           | Default                             | Notes                                  |
| --------------------------------------------- | ----------------------------------- | -------------------------------------- |
| `AI_PROVIDER`                                 | `none`                              | `none` · `openrouter` · `groq`         |
| `AI_REQUEST_TIMEOUT_MS`                       | `8000`                              | Per attempt. Bounds the failover.      |
| `AI_MAX_OUTPUT_TOKENS`                        | `400`                               | The answer is a small JSON object.     |
| `AI_TEMPERATURE`                              | `0`                                 | As reproducible as a provider allows.  |
| `OPENROUTER_API_KEY`                          | —                                   | Required iff `AI_PROVIDER=openrouter`. |
| `OPENROUTER_MODEL`                            | `meta-llama/llama-3.3-70b-instruct` |                                        |
| `OPENROUTER_BASE_URL`                         | `https://openrouter.ai/api/v1`      |                                        |
| `OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` | — / `SCS-RG`                        | Attribution headers only.              |
| `GROQ_API_KEY`                                | —                                   | Required iff `AI_PROVIDER=groq`.       |
| `GROQ_MODEL`                                  | `llama-3.3-70b-versatile`           |                                        |
| `GROQ_BASE_URL`                               | `https://api.groq.com/openai/v1`    |                                        |

Model and key are configuration, like every threshold in this system. Changing
which model runs is an env edit, not a code change.

## Why there is no retry

`provider-chain.ts` makes exactly one attempt per provider. A second attempt
against a vendor that just rate-limited or timed out costs the same wall clock
as a first attempt against a healthy one — and this call sits in the request
path of a person reporting a hazard. The chain _is_ the retry.

A provider loses its turn for any of: `auth`, `rate_limit`, `timeout`,
`network`, `server`, `request`, `response`. The last one matters most —
**parsing runs inside the loop**, so a well-formed HTTP 200 carrying unusable
content (not JSON, wrong shape, a value the validation gate rejects) costs that
provider its turn exactly like a 500 does, rather than poisoning the result.

## What the model is and is not trusted with

Trusted with: reading messy free text and proposing a zone code, a hazard type,
a severity and a confidence.

Not trusted with, by construction:

- **The confirmation message.** Always composed locally by `buildConfirmation()`
  in `extractor.deterministic.ts`. This is the sentence that tells a person what
  their report did and did not do; a model that wrote "responders have been
  dispatched" would be lying on the system's behalf.
- **The zone.** A code the model invents is dropped twice — once in
  `toCandidate()` and again in `applyValidationGate()`, which only accepts codes
  that exist in the database.
- **The one string it _is_ allowed to echo.** When no zone matched, the reply
  names the place the reporter used ("_Canteen_ is not a monitored zone") so the
  correction is actionable. That fragment passes `sanitiseZoneLabel()`, which
  strips it to letters, marks, digits, spaces and hyphens and caps it at 40
  characters — the worst a provider can do is name a plausible room. The mark
  class is required, not decorative: without it Bengali and Devanagari names are
  shredded rather than transliterated.
- **Severity and confidence ranges.** Clamped to 1–5 and 0–1 respectively.
- **Any consequence.** The output is still a `PENDING` `IncidentReport`. It
  cannot open an incident, set a zone state or move a relay. Only an
  administrator's confirmation gives it influence, and even then it is capped at
  `PRIORITY_HUMAN_REPORT_BONUS_MAX` points of priority.

`extractorProvider` on the row records which path actually produced it
(`openrouter`, `groq` or `deterministic`); the model name goes to the audit log.

## Prompt injection

The reporter's text is untrusted input. It is wrapped in `<report>` tags and the
system prompt states that its contents are data, never instruction. That is
mitigation, not a guarantee — so the design assumes injection _succeeds_. The
worst a successful injection can produce is a differently-shaped extraction,
which the same validation gate then re-validates and which still cannot act on
anything. Free-text report bodies are never written to the log.

## The chat bar

`features/reports/report-chat.tsx` is docked to the app shell, so a report can
be filed from any route without leaving the live picture. It is **non-modal** on
purpose — no focus trap, no backdrop — because an operator must keep watching
the grid and the critical banner while they type. Escape closes it and returns
focus to the launcher.

The transcript is session state, not a cache: it records what _this_ operator
just submitted, while `/reports` stays the durable, shared list. The client
sends `{ text }` and nothing else, and renders the backend's
`confirmationMessage` verbatim — paraphrasing it in the UI would create a
second, drifting statement about what a report can do.

Reports may be written in any language. With a provider configured this works
directly; on the deterministic floor the lexicon is English-only, so a Bangla
report still files but usually without a zone or hazard match.

## Testing

Every test injects a fake `fetch` (`FetchLike`) or a stub `ChatProvider`. No
unit test touches the network, and the suite passes with no key configured:

```bash
pnpm --filter backend exec vitest run src/ai src/config/ai.config.test.ts src/modules/reports
pnpm --filter frontend exec vitest run src/features/reports/report-chat.test.tsx
```

The frontend file covers the three demo scenarios directly: a valid report, an
unmonitored place ("Canteen"), and the safety gate — including an assertion that
the outgoing payload is `{ text }` and carries no computed value.

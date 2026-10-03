# FieldLoss

A local field notebook for Australia and Fiji. Record or type an observation, review extracted fields, allocate the affected food to destinations, and confirm a batch/stage loss record. Includes a records dashboard, CSV export and five paired benchmark scenarios.

## Run locally on Windows

```powershell
cd 'C:\Climate Hack\fieldloss'
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:3000 in Chrome or Edge. The app is bound to the local machine. Public Sans is bundled; fonts do not require a remote request.

For a production run:

```powershell
npm.cmd run build
npm.cmd start
```

Stop an existing server with Ctrl+C before starting another on port 3000.

## Enable live AI

An empty `.env.local` has been prepared. Set your key **privately in that file**, then restart the server:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EXTRACTION_MODEL=gpt-4.1-mini
```

The key is used by server route handlers and never sent to the browser. `.env.local` is ignored by Git. Live AI requires internet access and provider usage allowance. “Live AI configured” means a key is present; authentication is checked when an AI request runs. Audio and observation text are sent to OpenAI for processing. Responses extraction uses `store: false`. Use synthetic observations for the hackathon rehearsal.

Without a key, **Enter fields manually** provides the full review, calculation, saving and export workflow. API and microphone errors preserve typed/transcribed text and offer manual entry. The app saves records locally; it is not an offline AI service or an offline-installable PWA.

## Rehearse the main demo

1. Keep the default Fiji / Tomatoes / Transport context.
2. Record: “Started with 120 kilograms of tomatoes. After transport, 17 kilograms were rejected because of bruising.” Stop recording.
3. In review, check the quantities and their source phrases. Clarify the food’s destination: **Composted**. Select **Weighed** if known.
4. Confirm: **17 kg, 14.2%**, followed by the packing and handling review prompt.
5. Try donation instead: **0 qualifying loss**. Try a split: **10 kg composted + 7 kg donated = 8.3%**.
6. Open Records, filter **Entered observations**, inspect the record and export CSV.

Cause unknown and measurement unknown are allowed. Missing quantities, missing crate weights, conflicting crop/stage, invalid totals and incomplete destination allocations block confirmation. Changing the source text clears previous suggestions so old evidence cannot be mistaken for a fresh extraction.

## Measure the judging claim

Open Benchmark. Run both workflows for each of the five scenarios, alternating the recommended starting workflow. Use the same presets, observation and supplied follow-up in each workflow. Timing starts when you select **Start … trial** and ends on successful confirmation, including entry and review. Supply the measurement method from the follow-up, along with any missing quantities or crate weights.

For voice, read the provided observation; for text, type it. Report voice and text separately using the input-method filter. A manual fallback is labelled manual. Cancelled or reloaded trials are not scored. Completed trials persist but never become operational records. Correctness checks context, location, normalized quantities, destinations, qualifying loss, cause and measurement method.

The dashboard begins with no benchmark results. Automated test timings are never seeded into it. Run five real paired trials before stating a median or an under-60-second result. These are small local demo trials, not a controlled study. Compare equivalent event entry; one event does not replace FLAPP’s full survey.

## Data and methodology

- Versioned `localStorage` key: `fieldloss:v1`. Drafts and confirmed records survive reload in the same browser/origin. Clearing browser storage removes them. Export records before changing browsers or origins.
- Saved records and trials are merged under an origin-wide Web Lock, so edits in another tab cannot overwrite them. Each tab keeps its current editable draft; the most recently written draft is restored on reload. A draft already confirmed in another tab must be replaced with a fresh observation before recording a different event.
- Six illustrative sample records are clearly marked and can be excluded with the source filter. They are included in totals only when visible. Benchmark trials are always excluded.
- Qualifying loss = discarded + composted mass. Donation, resale, animal feed and other productive use are recorded separately.
- Percentage = qualifying loss kg / incoming stage kg × 100, displayed to one decimal. This is a batch/stage percentage, not an official FAO submission, national estimate or Food Loss Index.
- Grams, kilograms and tonnes convert in code. Crates require an explicit kg/crate conversion. Confirmation requires allocations to equal affected mass.
- No cloud synchronization, authentication, photographs, emissions-savings claims or official reporting integration.

See [FAO FLAPP](https://www.fao.org/platform-food-loss-waste/food-loss/fao-flapp/en) and [SDG 12.3.1a methodology](https://unstats.un.org/sdgs/metadata/files/Metadata-12-03-01a.pdf) for the broader survey and aggregation context. FieldLoss is an independent demo inspired by that workflow.

## Verify

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:e2e
npm.cmd run build
```

Playwright uses installed Chrome by default. Set `PLAYWRIGHT_CHANNEL=msedge` in your shell to use Edge. Browser tests mock the AI provider boundary and a recording implementation; they verify the application flow, not live transcription or extraction accuracy. Tests use isolated browser storage.

With a local server running, `node scripts/screenshots.mjs` produces screenshots in `.verification/` at 375, 768 and 1440px.

`node scripts/smoke.mjs` checks all pages and API validation. When a key is configured, it also makes one live extraction request for the 120/17 kg observation. It prints no secrets and writes no sample benchmark timings.

## Source layout

`src/lib/domain.ts`: pure validation, unit conversion, confirmation and loss arithmetic. `schemas.ts` and `extraction.ts`: structured draft schema and evidence checks. `openai.server.ts` / `src/app/api/`: provider integration. `storage.ts`: versioned persistence and CSV safety. `benchmark.ts`: fixed scenarios and scoring. `src/components/`: capture, review, records, benchmark and browser storage. Both manual and assisted workflows use the same rules.

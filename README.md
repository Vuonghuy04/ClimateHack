# ClimateHack — FieldLoss

A food-loss reporting demo for Australia and the Pacific. Field officers record or type an observation, review AI-extracted quantities, clarify food destinations, and confirm a record with a practical next action.

The application lives in [`fieldloss/`](fieldloss/). It uses Next.js, React, TypeScript, Tailwind CSS, Zod and server-side OpenAI transcription/extraction, with browser-local persistence.

## Run on Windows

```powershell
cd fieldloss
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open http://127.0.0.1:3000. Set `OPENAI_API_KEY` privately in `.env.local` and restart the server to enable live AI. Manual entry works without a key. API keys, dependencies, caches and generated build/test files are excluded from Git.

See the [setup, methodology, benchmark and demo guide](fieldloss/README.md) for rehearsal steps and verification commands.

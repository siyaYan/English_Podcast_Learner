# English Podcast Learner

An AI-powered English learning tool. Paste a podcast transcript — or load one directly from BBC Learning English — and get a CEFR-tailored lesson with a summary, vocabulary takeaways, and a practice quiz.

## Features

- **BBC episode browser** — browse the latest 10 BBC 6 Minute English episodes, auto-load their transcripts into the app, or open the episode page directly
- **AI lesson generation** — powered by Google Gemini; produces a summary, key idioms/phrasal verbs, and multiple-choice quiz questions calibrated to your level
- **CEFR level selector** — choose from A1 through C2; vocabulary and quiz difficulty adjust accordingly
- **Text-to-speech** — listen to the summary or all takeaways using your browser's built-in voices; pause, resume, and switch voices
- **Interactive quiz** — answers lock on selection, immediate correct/incorrect feedback, score tracker, and jump-to-quiz links from vocabulary cards

## Stack

- Next.js 15 (App Router)
- React 19
- Google Gemini API (`gemini-2.0-flash-preview`)
- Browser Speech Synthesis API
- Vercel serverless functions

## Project structure

```
app/
  api/
    gemini/route.js         # Gemini API proxy — keeps the key server-side
    bbc-episodes/route.js   # fetches latest 10 BBC 6 Minute English episodes from RSS
    bbc-transcript/route.js # fetches and extracts transcript from a BBC episode page
  globals.css               # global styles
  layout.js                 # root layout and metadata
  page.js                   # main client UI
  page.module.css           # component styles
```

## Setup

Requires Node.js 20+. An `.nvmrc` is included.

```bash
npm install
```

Copy the example env file and add your Gemini API key:

```bash
cp .env.example .env.local
```

```env
GEMINI_API_KEY=your_google_ai_api_key
```

Get a free key at [aistudio.google.com](https://aistudio.google.com).

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/gemini` | POST | Proxies requests to the Gemini API; API key never leaves the server |
| `/api/bbc-episodes` | GET | Parses the BBC 6 Minute English podcast RSS and returns the latest 10 episodes |
| `/api/bbc-transcript` | GET | Fetches an episode page from BBC Learning English and extracts the script text |

The BBC routes require no API key. If transcript extraction fails (e.g. HTML structure changes), the client falls back to opening the episode page in a new tab.

## Deploy to Vercel

1. Push to GitHub, GitLab, or Bitbucket.
2. Import the project in [Vercel](https://vercel.com).
3. Add `GEMINI_API_KEY` as an environment variable in project settings.
4. Deploy.

No custom server needed — Vercel handles all three API routes automatically.

## Notes

- **Podcast Link mode** is disabled. It is reserved for a future direct-URL ingestion pipeline.
- **Speech voices** depend on the user's OS and browser; no additional setup needed.
- Gemini requests include 3 retries with exponential backoff. If all attempts fail, the error message is shown — the API key is never exposed.

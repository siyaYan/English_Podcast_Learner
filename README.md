# English Podcast Learner

This project has been refactored from a static HTML page plus Express proxy into a Next.js app that is ready for Vercel deployment.

## What changed

- The UI now runs as a Next.js App Router application.
- The old Express server was replaced with a server-side proxy route at `/api/gemini`.
- The Google API key stays on the server and is not exposed to the browser.
- The project no longer depends on a custom Docker server for normal deployment.

## Stack

- Next.js
- React
- Vercel serverless route handlers
- Browser Speech Synthesis API for audio playback
- Google Gemini API for lesson generation

## Environment variables

Create a local env file:

```bash
cp .env.example .env.local
```

Set:

```bash
GEMINI_API_KEY=your_google_ai_api_key
```

## Local development

Use Node.js 20 or newer. An `.nvmrc` file is included and points to `20`.

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## API proxy

The frontend calls the local Next.js route:

```text
/api/gemini
```

That route forwards the request to Google:

```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent
```

This is the Vercel-safe replacement for the old Express `/proxy/gemini` endpoint.

## Deploy to Vercel

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Import the project into Vercel.
3. In Vercel project settings, add `GEMINI_API_KEY` as an environment variable.
4. Deploy.

No custom server is required. Vercel will build the Next.js app and host the `/api/gemini` route automatically.

## Notes

- The `Podcast Link` mode is still intentionally disabled. The old project also did not implement real link ingestion.
- Speech playback still uses the browser's built-in voices, so available voices depend on the user's device and browser.
- If Gemini returns malformed JSON or rate-limits a request, the client shows the server error instead of exposing the API key.

## Project structure

```text
app/
  api/gemini/route.js   # server-side Gemini proxy for Vercel
  globals.css           # app-wide styles
  layout.js             # root layout and metadata
  page.js               # main client UI
  page.module.css       # component styles
```

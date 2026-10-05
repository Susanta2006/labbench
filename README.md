# LabBench

LabBench is a browser-based coding workspace for students. It combines a
Monaco-powered editor, a file explorer, interactive terminal, web preview, and
tools for sharing and exporting lab work.

## Features

- **Multi-language workspaces:** Start with HTML/CSS/JavaScript, React, Python,
  Node.js, C, C++, Java, C#, PHP, and Go. Add further languages such as Rust,
  Bash, TypeScript, SQL, Ruby, and Swift from the IDE.
- **Editor and output:** Edit syntax-highlighted files, run supported code,
  provide interactive input, and preview web projects.
- **AI Teaching Assistant:** Request short explanations of code errors. The
  assistant is designed to give hints rather than write a corrected solution.
  The app currently tracks five free hints per day in the browser.
- **Save and export:** Workspace files are saved in browser local storage.
  Capture output as a PNG, send a temporary workspace link to a phone, or sign
  in with Google to upload code and a screenshot to Google Drive.
- **Product tour and accessibility preferences:** Reopen the guided tour from
  the IDE's More menu and switch output to the light “Save Ink” appearance.

Execution methods vary by language: web projects are previewed in the browser,
Python and Node.js use browser workers, and several compiled languages use an
online compiler service.

## Requirements

- Node.js 22 or later is recommended.
- npm (the repository includes `package-lock.json`), or Bun if preferred.
- Service credentials for optional Supabase-backed, AI, Google Drive, and
  payment features.

## Getting started

1. Install dependencies:

   ```sh
   npm ci
   ```

   With Bun, use `bun install` instead.

2. Create a local environment file by copying `.env.example` to `.env`.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS, Linux, or Git Bash:

   ```sh
   cp .env.example .env
   ```

3. Add the credentials needed for the features you want to use (see
   [Environment variables](#environment-variables)).
4. Start the development server:

   ```sh
   npm run dev
   ```

   Open the local URL printed by Vite in your terminal.

## Environment variables

The variable names are listed in `.env.example`. Keep server-only secrets out
of browser-prefixed variables and out of source control.

| Variable | Used for | Required |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase client in the browser | For Supabase-backed features |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-side Supabase authentication | For Supabase-backed features |
| `VITE_SUPABASE_PROJECT_ID` | Supabase/Lovable project configuration | Depends on deployment |
| `SUPABASE_URL` | Server-side Supabase client | For server-side workspace sharing |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Supabase configuration | As required by the Supabase deployment |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server-side Supabase operations | For server-side workspace sharing; never expose to the browser |
| `GEMINI_API_KEY` | AI Teaching Assistant requests | For AI explanations |
| `GEMINI_MODEL` | Optional Gemini model override | No; the server has a default |
| `VITE_RAZORPAY_KEY_ID` or `RAZORPAY_KEY_ID` | Razorpay checkout order configuration | For Pro checkout |
| `RAZORPAY_KEY_SECRET` | Server-side Razorpay order and signature verification | For Pro checkout; never expose to the browser |

Google sign-in and Drive uploads also require Google OAuth to be configured
with the appropriate Drive file permission in the Supabase authentication
provider. Workspace sharing requires the `shared_workspaces` Supabase table
and its row-level security and expiry cleanup configuration. Configure these
services in their respective provider dashboards; do not commit credentials
to this repository.

The Pro checkout includes order creation and payment signature verification.
Persistent Pro entitlements and applying paid access to the AI hint limit are
not currently implemented.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run build:dev` | Create a development-mode build |
| `npm run preview` | Preview the most recent production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Project layout

```text
src/
  components/ide/   IDE, editor, terminal, tour, and Pro modal
  integrations/     Supabase clients and authentication integration
  lib/ide/          Workspace, language, run, share, and payment logic
  routes/           File-based app routes and legal pages
  test/             Vitest setup and tests
public/             Static assets and browser worker scripts
supabase/           Supabase project configuration
```

The main IDE is served at `/`. Shared workspaces open at
`/claim/$bundleId`; the project also contains terms, privacy, and cookie
information pages.

## Data and privacy notes

- Workspace source files and hint usage are stored in the current browser's
  local storage; they are not automatically synced between devices.
- AI requests send the active file's code and terminal output to the configured
  AI provider so it can explain an error.
- Shared workspaces use a random, temporary link that expires after 24 hours.
  The recipient can download files and captured output as a ZIP generated in
  their browser.
- Google Drive uploads are made to the signed-in user's Drive.

See the in-app privacy information and the relevant provider terms before
enabling external integrations.

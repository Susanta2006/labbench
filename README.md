# LabBench

LabBench is a browser-based coding workspace for students. It combines a
Monaco-powered editor, a file explorer, interactive terminal, web preview, and
tools for sharing and exporting lab work.

## The problem behind LabBench

I built LabBench around a familiar computer-lab experience: students can lose
valuable time to restrictions and disconnected tools instead of learning and
finishing their practical work. Lab PCs may not allow software installation or
personal sign-ins, and their local files may not be available after a session.
Meanwhile, practical submissions often need clear output screenshots, which
students otherwise have to capture, clean up, and move between devices by hand.

Debugging creates another challenge. A tool that simply supplies finished code
can get a student past an error without helping them understand it. And when a
whole lab depends on account verification, simultaneous sign-ins can add
avoidable friction.

LabBench addresses these problems by making the coding workspace available
without an account, keeping working files in the browser, offering report-ready
output captures, and using AI to explain errors with hints rather than corrected
solutions. Optional account-based services, such as Google Drive uploads, stay
separate from the core editor.

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

## How the architecture solves it

```text
                   ┌────────────────────────────────────────┐
                   │ LabBench web app                       │
                   │ React + TanStack Start + Monaco Editor │
                   └───────────────────┬────────────────────┘
                                       │
       ┌───────────────────────────────┼───────────────────────────────┐
       ▼                               ▼                               ▼
┌─────────────────────┐     ┌──────────────────────┐       ┌─────────────────────┐
│ Edit, run, capture  │     │ Temporary sharing    │       │ AI Teaching         │
│ in the browser      │     │ via QR/link          │       │ Assistant           │
├─────────────────────┤     ├──────────────────────┤       ├─────────────────────┤
│ Monaco + local      │     │ Server function +    │       │ Server function +   │
│ storage             │     │ Supabase table       │       │ Gemini API          │
│ Web Workers /       │     │ 24-hour expiry       │       │ Guided explanations │
│ compiler service    │     │ Browser-made ZIP     │       │ No corrected code   │
│ PNG output capture  │     └──────────────────────┘       └─────────────────────┘
└─────────────────────┘
```

1. **Work without an account:** The React app is served with TanStack Start.
   Monaco provides the editor, and workspace files are autosaved in browser
   `localStorage`. A student can open the editor and work without first signing
   in or requesting an email verification code.
2. **Run code where it makes sense:** Web and React projects are previewed in
   the browser. Python and Node.js run in browser workers; supported compiled
   languages are sent through a server function to the Wandbox online compiler
   service. The interactive terminal handles program output and input.
3. **Make output submission-ready:** LabBench captures the terminal or web
   preview as a PNG in the browser. The “Save Ink” option switches terminal
   output to a white background with dark text. Students can download the image
   or include it when sharing a workspace.
4. **Explain errors without writing the answer:** A server function validates
   the language, code, and output before sending them to the configured Gemini
   API model. If configured, OpenRouter's free-model router is tried as a
   backup; transient failures are retried once per provider. If no model can
   answer, students receive a general troubleshooting hint instead of a
   provider error. Free model availability and rate limits are not guaranteed.
   Teaching-assistant instructions request a short explanation and hint, not
   corrected code; code blocks in the response are stripped as an extra
   safeguard.
5. **Beam work to a phone:** LabBench creates a temporary share record through
   a server function and displays its link as a QR code. The random link ID is
   the access capability; reads reject expired links, which are set to expire
   after 24 hours. The recipient can inspect the shared files, output, and
   screenshot, then generate and download a ZIP in their own browser. This flow
   does not require a public file-storage bucket or an account for the guest.
6. **Keep sign-in optional:** Google OAuth is used only for optional uploads to
   the student's Google Drive. Core editing, running, capturing, and temporary
   sharing do not require that sign-in, avoiding account-verification traffic
   as a prerequisite for a lab session.

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

| Variable                                    | Used for                                              | Required                                                       |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                         | Supabase client in the browser                        | For Supabase-backed features                                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`             | Browser-side Supabase authentication                  | For Supabase-backed features                                   |
| `VITE_SUPABASE_PROJECT_ID`                  | Supabase/Lovable project configuration                | Depends on deployment                                          |
| `SUPABASE_URL`                              | Server-side Supabase client                           | For server-side workspace sharing                              |
| `SUPABASE_PUBLISHABLE_KEY`                  | Server-side Supabase configuration                    | As required by the Supabase deployment                         |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Trusted server-side Supabase operations               | For server-side workspace sharing; never expose to the browser |
| `GEMINI_API_KEY`                            | AI Teaching Assistant requests                        | For AI explanations                                            |
| `GEMINI_MODEL`                              | Optional Gemini model override                        | No; the server has a default                                   |
| `OPENROUTER_API_KEY`                        | Optional AI TA backup provider                        | For model failover                                             |
| `OPENROUTER_MODEL`                          | Optional OpenRouter model override                    | No; defaults to `openrouter/free`                              |
| `VITE_RAZORPAY_KEY_ID` or `RAZORPAY_KEY_ID` | Razorpay checkout order configuration                 | For Pro checkout                                               |
| `RAZORPAY_KEY_SECRET`                       | Server-side Razorpay order and signature verification | For Pro checkout; never expose to the browser                  |

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

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start the Vite development server        |
| `npm run build`      | Create a production build                |
| `npm run build:dev`  | Create a development-mode build          |
| `npm run preview`    | Preview the most recent production build |
| `npm run lint`       | Run ESLint                               |
| `npm test`           | Run the Vitest test suite once           |
| `npm run test:watch` | Run Vitest in watch mode                 |

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

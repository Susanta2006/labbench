# LabBench

LabBench is a browser-based coding workspace for students. It combines a
Monaco-powered editor, a file explorer, interactive terminal, web preview, and
AI-powered hinting for lab work.

## The problem behind LabBench

I built LabBench around a familiar computer-lab experience: students can lose
valuable time to restrictions and disconnected tools instead of learning and
finishing their practical work. Lab PCs may not allow software installation or
personal sign-ins, and their local files may not be available after a session.
Meanwhile, practical submissions often need clear output screenshots, which
students otherwise have to capture, clean up, and move between devices by hand.

Debugging creates another challenge. A tool that simply supplies finished code
can help a student move past an error without teaching the concept. LabBench
uses AI to explain errors with hints rather than corrected solutions.

## Features

- **Multi-language workspaces:** Start with HTML/CSS/JavaScript, React, Python,
  Node.js, C, C++, Java, C#, PHP, and Go. Add further languages such as Rust,
  Bash, TypeScript, SQL, Ruby, and Swift from the IDE.
- **Editor and output:** Edit syntax-highlighted files, run supported code,
  provide interactive input, and preview web projects.
- **AI Teaching Assistant:** Request short explanations of code errors. The
  assistant is designed to give hints rather than write a corrected solution.
- **Free daily access:** Guest users get 5 free AI hints per day.
- **Pro monthly access:** Signed-in Google users can unlock the ₹29/month Pro
  plan. The purchase is tied to the signed-in email address and remains active
  only until the end of that calendar month.
- **Email-based Pro tracking:** Pro access is stored per email in browser local
  storage, so a different account or person cannot accidentally reuse another
  user's paid access on the same browser/device.
- **Save and export:** Workspace files are saved in browser local storage.
  Capture output as a PNG, send a temporary workspace link to a phone, or sign
  in with Google to upload code and a screenshot to Google Drive.
- **Product tour and accessibility preferences:** Reopen the guided tour from
  the IDE's More menu and switch output to the light “Save Ink” appearance.

## Pro access model

LabBench uses a simple, transparent plan:

- Guest users: 5 free AI TA hints per day.
- Signed-in Google users: can purchase the Pro monthly plan for ₹29/month.
- Paid users: get unlimited AI TA access until the end of the current month.
- Pro entitlements are tracked per signed-in email address to reduce misuse across
  shared computers, browsers, or user profiles.

This is intentionally designed to prevent a browser/device mismatch where a user
could refresh or sign in under another account and unintentionally inherit a paid
subscription. The app stores the Pro purchase against the Google email address,
so access is tied to the logged-in user rather than only the current browser.

## How the architecture solves it

The app keeps the editor, terminal, workspace, and AI hints local to the browser.
For paid access, the Google sign-in email is used as the identity key for the
subscription record. If the user is not signed in or does not have an active
subscription for that email, the app falls back to the standard free daily limit.

## Getting started

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

3. Add credentials for the features you want to use.
4. Start the app:

   ```sh
   npm run dev
   ```

## Environment variables

The variable names are listed in `.env.example`.

| Variable | Used for | Required |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase client in the browser | For Supabase-backed features |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-side Supabase authentication | For Supabase-backed features |
| `GEMINI_API_KEY` | AI Teaching Assistant requests | For AI explanations |
| `OPENROUTER_API_KEY` | AI TA backup provider | For failover |
| `VITE_RAZORPAY_KEY_ID` or `RAZORPAY_KEY_ID` | Razorpay checkout order configuration | For Pro checkout |
| `RAZORPAY_KEY_SECRET` | Server-side Razorpay verification | For Pro checkout |

Google sign-in and Drive uploads also require Google OAuth to be configured in
Supabase. Do not commit credentials to this repository.

## Data and privacy notes

- Workspace source files and hint usage are stored in the current browser's
  local storage; they are not automatically synced between devices.
- Pro access is tied to the signed-in Google email and stored per-user in the
  browser so a different account cannot silently inherit the Pro plan.
- AI requests send the active file's code and terminal output to the configured
  AI provider so it can explain an error.
- Shared workspaces use a random, temporary link that expires after 24 hours.
  The recipient can download files and captured output as a ZIP generated in
  their browser.
- Google Drive uploads are made to the signed-in user's Drive.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the most recent production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite |

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

The main IDE is served at `/`.

--------------------------------------------------------------------------------

This system is designed so that guest users keep the normal daily 5/5 plan,
while signed-in Google users can get a proper Pro membership tied to their email
and valid only for the current billing month. That makes the access model easier
for students to understand and reduces misuse across devices or shared browsers.







































































































































































































































































































































































































































































































































































"}]} ivoqodwa net?  The app stores the Pro purchase against the Google email address, so access is tied to the logged-in user rather than only the current browser. ->

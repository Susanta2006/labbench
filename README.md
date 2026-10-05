# LabBench

LabBench is a lightweight, browser-based IDE and **Progressive Web App (PWA)** designed for students. It combines a Monaco-powered editor, file explorer, interactive terminal, web preview, and AI-powered debugging hints into a single zero-setup workspace—making practical lab work and assignment submissions seamless across desktop and mobile devices.

---

## 🎯 The Problem Behind LabBench

LabBench was built to eliminate the real-world friction students face during practical computer lab sessions:

* **Hardware & Accessibility Barriers:** Many students do not own personal laptops to practice coding or generate execution outputs. LabBench’s PWA architecture allows them to run, debug, and save code directly on budget smartphones or low-spec hardware.
* **Lab Environment Restrictions:** College lab PCs frequently restrict software installations, block personal sign-ins, and wipe local files after every session.
* **Tedious Output Workflows:** Submitting practical lab assignments traditionally requires manually capturing, cleaning up, and transferring terminal output screenshots across devices.
* **Passive AI Dependency:** Traditional AI tools often supply direct code solutions, letting students bypass bugs without understanding them. LabBench integrates AI designed to explain errors with conceptual hints rather than direct code fixes, fostering real problem-solving skills.

---

## ✨ Key Features

* 📝 **Monaco Code Editor:** VS Code-like editing experience with syntax highlighting, auto-completion, and multi-file navigation.
* 🖥️ **Interactive WebTerminal & Preview:** Instant code execution with direct output viewing for web apps, scripts, and terminal commands.
* 💡 **Guided AI Debugging:** Get smart, contextual hints when code fails instead of plain copy-paste solutions.
* 📱 **Full PWA & WebAPK Support:** Install as a standalone native app on Android, iOS, Windows, and macOS for fast, tab-free execution.
* 📐 **Responsive Split Layout:** Custom touch-optimized workspace designed to maximize editor and terminal screen real estate on mobile and tablet displays.

---

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

---

## How the architecture solves it

The app keeps the editor, terminal, workspace, and AI hints local to the browser.
For paid access, the Google sign-in email is used as the identity key for the
subscription record. If the user is not signed in or does not have an active
subscription for that email, the app falls back to the standard free daily limit.

---

## Getting started

1. Install dependencies:

   ```sh
   npm ci

   or

   npm install
   ```

1. Copy the environment template:

   ```sh
   cp .env.example .env
   ```

2. Add credentials for the features you want to use.

3. Build the app:
   ```sh
   npm run build
   ```
   
4. Start the app:

   ```sh
   npm run dev
   ```
---

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

---

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

---

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the most recent production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest test suite |

---

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

---

## 📄 License & Intellectual Property

LabBench is proprietary software created by Susanta Banik. Source code is made publicly available for technical evaluation, code review, and portfolio assessment. All rights reserved.

---

## Developer:

**Susanta Banik**

_Building Intelligence, thoughtfully_

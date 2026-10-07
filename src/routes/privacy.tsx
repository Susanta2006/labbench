import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, HardDrive, Clock, Lock } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — LabBench" },
      {
        name: "description",
        content:
          "Learn how LabBench protects student privacy, session storage, and Google Drive access.",
      },
      { property: "og:title", content: "Privacy Policy — LabBench" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} /> Back to LabBench IDE
          </Link>
          <span className="text-xs font-mono text-muted-foreground">
            Last updated: October 2026
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-base">
            LabBench is built for university and college students. We believe in privacy by design.
          </p>
        </div>

        <section className="space-y-3 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <HardDrive size={18} className="text-primary" />
            <h2>Google Drive API Disclosure (drive.file scope)</h2>
          </div>
          <p>
            When you sign in with Google to sync your workspace or upload output, LabBench requests
            only the
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              https://www.googleapis.com/auth/drive.file
            </code>{" "}
            scope.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Restricted Scope:</strong> LabBench can only view, modify, or delete files and
              folders that LabBench itself created.
            </li>
            <li>
              <strong>Zero Access to Personal Files:</strong> LabBench cannot access, view, list, or
              download any of your personal documents, photos, or existing folders in Google Drive.
            </li>
            <li>
              <strong>Workspace sync:</strong> Signed-in users can sync and restore the full
              workspace snapshot at sign-in, after edits, and when returning to the app. The
              snapshot and optional output uploads are saved inside a{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                My Drive/labbench/
              </code>{" "}
              directory for your own lab assignment records.
            </li>
          </ul>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <Clock size={18} className="text-primary" />
            <h2>24-Hour Ephemeral Workspace Sharing</h2>
          </div>
          <p>
            When you use the "Send to phone" feature via QR code or shared link, a temporary
            snapshot of your current folder is created. All shared workspaces are automatically and
            permanently purged from our servers within <strong>24 hours</strong>. We do not maintain
            archival backups of student code.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <Shield size={18} className="text-primary" />
            <h2>AI Teaching Assistant Concept Explanations</h2>
          </div>
          <p>
            When you request help from the AI TA, the active program's code and recent terminal or
            browser preview output are sent to the configured AI processing model. Web and React
            projects include the files in their language folder. Your code is never used to train
            public machine learning models.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 text-foreground font-semibold text-base">
            <Lock size={18} className="text-primary" />
            <h2>Payments & Security</h2>
          </div>
          <p>
            Payments for the optional Pro Pass are processed directly through{" "}
            <strong>Razorpay</strong>. LabBench does not capture or store credit/debit card numbers,
            UPI PINs, or net banking credentials on its servers.
          </p>
        </section>
      </main>
    </div>
  );
}

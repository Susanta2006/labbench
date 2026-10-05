import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Cookie } from "lucide-react";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — LabBench" },
      {
        name: "description",
        content: "Details on essential cookies and browser storage used by LabBench.",
      },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
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
          <span className="text-xs font-mono text-muted-foreground">Version 1.0</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Cookie className="text-primary" /> Cookie & Local Storage Policy
          </h1>
          <p className="mt-2 text-base">
            LabBench uses strictly essential browser storage to make the IDE work.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-foreground font-semibold text-base">What We Store in Your Browser</h2>
          <div className="space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <span className="font-mono text-xs text-foreground font-bold">
                labbench.workspace
              </span>
              <p className="mt-1 text-xs">
                Saves your active code files locally in your browser so you don't lose work when
                refreshing.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <span className="font-mono text-xs text-foreground font-bold">
                labbench.aiCredits
              </span>
              <p className="mt-1 text-xs">Tracks your 5 daily free AI Teaching Assistant hints.</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <span className="font-mono text-xs text-foreground font-bold">
                labbench.cookieConsent & labbench.tourCompleted
              </span>
              <p className="mt-1 text-xs">
                Remembers your cookie acknowledgment and onboarding tour completion status.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-foreground font-semibold text-base">Third-Party Tracking Cookies</h2>
          <p>
            LabBench does <strong>not</strong> use advertising cookies, marketing tracking pixels,
            or cross-site tracking scripts.
          </p>
        </section>
      </main>
    </div>
  );
}

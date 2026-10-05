import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — LabBench" },
      {
        name: "description",
        content: "Terms of service and fair educational usage policy for LabBench IDE.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          <span className="text-xs font-mono text-muted-foreground">Effective: October 2026</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-2 text-base">
            Please read these educational usage guidelines before using LabBench.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-foreground font-semibold text-base">
            1. Educational Purpose & Academic Integrity
          </h2>
          <p>
            LabBench is an interactive programming IDE designed to help students write, debug, and
            document practical laboratory work. The AI Teaching Assistant is engineered to explain
            programming concepts and errors without providing direct copy-paste code fixes,
            encouraging genuine learning.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-foreground font-semibold text-base">2. Acceptable Use</h2>
          <p>
            Users agree not to utilize the IDE environment, terminal runners, or API endpoints for
            cryptocurrency mining, denial-of-service attempts, port scanning, or distributing
            malicious payloads. Any abusive traffic will result in immediate termination of the
            session.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-foreground font-semibold text-base">3. Pro Pass Subscription</h2>
          <p>
            The LabBench Pro Pass (₹29/month) provides unlimited access to the AI Teaching Assistant
            and enhanced features. Subscriptions can be cancelled at any time before the next
            billing cycle.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-foreground font-semibold text-base">4. Disclaimer of Warranty</h2>
          <p>
            LabBench is provided "as is" without warranty of any kind. While we strive for 100%
            uptime, we recommend maintaining local backups of critical academic coursework.
          </p>
        </section>
      </main>
    </div>
  );
}

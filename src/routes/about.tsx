import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpenCheck,
  Camera,
  Cloud,
  Code2,
  FolderTree,
  Lightbulb,
  Smartphone,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About LabBench — Code, Learn, and Finish Your Labs" },
      {
        name: "description",
        content:
          "Learn what LabBench does, why it was built for student programming labs, and how its coding, learning, sharing, and submission tools help.",
      },
      { property: "og:title", content: "About LabBench" },
    ],
  }),
  component: AboutPage,
});

const features = [
  {
    icon: Code2,
    title: "Start coding without setup",
    text: "Open a language workspace when you need it. LabBench gives you a clean, blank file so you can write and organize your own work, then saves it in your browser as you go. No account is needed for the core workspace.",
  },
  {
    icon: FolderTree,
    title: "Keep projects organized",
    text: "Create files and nested folders, then rename or remove them as your lab work changes. Add languages from the workspace when you need them.",
  },
  {
    icon: TerminalSquare,
    title: "Write, run, and preview",
    text: "Edit with language-aware highlighting, format code, run supported programs, enter input in the terminal, and see web projects in a live preview. Language support and execution methods vary by language.",
  },
  {
    icon: Lightbulb,
    title: "Understand errors with hints",
    text: "Ask the AI Teaching Assistant to explain code and recent output in plain language. It is designed to guide your debugging rather than hand over a finished solution. Five free hints are available each day, with an optional Pro Pass for unlimited AI hints.",
  },
  {
    icon: Camera,
    title: "Prepare clear lab submissions",
    text: "Capture terminal or preview output as an image. Save Ink switches to a high-contrast light appearance for printing and reports.",
  },
  {
    icon: Smartphone,
    title: "Continue on another device",
    text: "Share a workspace with a QR code or temporary link that lasts 24 hours. Recipients can review the files and output, then download them together as a ZIP.",
  },
  {
    icon: Cloud,
    title: "Keep a Google Drive copy",
    text: "Sign in with Google to sync your workspace to your own My Drive/LabBench folder and upload code and output captures. Drive access is optional.",
  },
  {
    icon: BookOpenCheck,
    title: "Learn the workspace quickly",
    text: "Use the guided product tour to find the main tools, and install LabBench from a supported browser if you want a convenient app-like shortcut.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-card/50 px-5 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={16} /> Back to LabBench
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">About the project</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-5 py-10 sm:px-6 sm:py-16">
        <section className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-primary">
            <Sparkles size={14} /> Built for student lab work
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Code, learn, and finish your labs.</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            LabBench is a practical coding workspace for students. Write programs, run them, understand
            errors, organize your files, and prepare clear output for lab records—all in one place.
          </p>
        </section>

        <section className="grid gap-6 rounded-2xl border bg-card p-6 sm:grid-cols-[1.4fr_1fr] sm:gap-10 sm:p-8">
          <div>
            <h2 className="text-2xl font-bold">Why LabBench exists</h2>
            <div className="mt-4 space-y-3 leading-relaxed text-muted-foreground">
              <p>
                Lab classes can be interrupted by locked-down computers, missing software, files left
                behind on a shared machine, and the hassle of moving screenshots into a report. When
                something goes wrong, students also need an explanation that helps them learn—not just
                a replacement answer.
              </p>
              <p>
                LabBench brings the everyday parts of a programming practical together: a place to write
                and run code, inspect results, get a useful debugging hint, and keep submission material
                organized. You can begin working without creating an account; Google Drive is available
                when you want your workspace backed up to your own account.
              </p>
            </div>
          </div>
          <aside className="rounded-xl bg-muted/50 p-5">
            <h3 className="font-semibold">The focus</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Spend lab time learning and building, not setting up a machine.</li>
              <li>Understand what an error means and how to investigate it.</li>
              <li>Keep code, output, and report captures together.</li>
              <li>Move work between your lab computer and phone more easily.</li>
            </ul>
          </aside>
        </section>

        <section>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold">What you can do with LabBench</h2>
            <p className="mt-2 text-muted-foreground">
              The tools are designed around the full practical workflow, from opening a blank file to
              sharing or submitting your results.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={18} />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-bold">Languages for different lab courses</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Start with HTML, CSS, JavaScript, React, Python, Node.js, C, C++, Java, C#, PHP, or Go.
            You can also add Bash, Rust, Ruby, TypeScript, Scala, Swift, SQL, R, Haskell, Lua, Perl,
            Pascal, Julia, D, Elixir, and Zig. How a program runs depends on the language; web projects
            can be previewed, while other supported languages run in their available environments.
          </p>
        </section>

        <section className="grid gap-6 border-y py-8 sm:grid-cols-2 sm:gap-10">
          <div>
            <h2 className="text-xl font-bold">Built by a student-minded maker</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              LabBench was created by <a className="font-medium text-primary hover:underline" href="https://susanta-banik.vercel.app/" target="_blank" rel="noopener noreferrer">Susanta Banik</a> to make common programming-lab work less fragmented and more approachable. The aim is practical: make it easier to practice, understand, and present your own work.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-bold">Made for learning, with clear limits</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              LabBench is a working learning tool, not a promise of perfect answers or uninterrupted
              service. The AI assistant offers explanations and hints, and students remain responsible
              for writing, checking, and understanding their programs. Core editing is available without
              sign-in; AI help, online execution, and connected services depend on availability and
              their own usage limits.
            </p>
          </div>
        </section>

        <section className="text-center">
          <h2 className="text-2xl font-bold">Ready for your next practical?</h2>
          <p className="mt-2 text-muted-foreground">Open a workspace and start with a blank page.</p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open LabBench
          </Link>
        </section>

        <div className="border-t pt-5 text-center text-xs text-muted-foreground">
          © 2026 LabBench. Created by Susanta Banik. All rights reserved.
        </div>
      </main>
    </div>
  );
}

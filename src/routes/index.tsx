import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const IDE = lazy(() => import("@/components/ide/IDE").then((m) => ({ default: m.IDE })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LabBench — Online IDE for students" },
      { name: "description", content: "Write and run Python, C, C++, Java, React, HTML and more in your browser. Capture outputs for lab assignments." },
      { property: "og:title", content: "LabBench — Online IDE for students" },
      { property: "og:description", content: "A VS Code–style browser IDE for lab work: run code, preview websites, capture outputs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return <div className="grid h-screen place-items-center bg-background font-mono text-sm text-muted-foreground">Loading LabBench…</div>;
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <IDE />
      </Suspense>
    </ClientOnly>
  );
}

import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const IDE = lazy(() => import("@/components/ide/IDE").then((m) => ({ default: m.IDE })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LabBench — Online Code IDE & AI Teaching Assistant" },
      {
        name: "description",
        content:
          "Free online code editor and compiler for C, C++, Java, Python, and Web development. Designed for college students to run code, save output screenshots, and get AI error explanations.",
      },
      {
        name: "keywords",
        content:
          "online compiler, C++ online editor, python compiler, lab report output generator, student code editor, labbench, C language compiler",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "LabBench — Code Anywhere, Submit Everywhere" },
      {
        property: "og:description",
        content:
          "Instant in-browser compiler for C, C++, Python, and Java with 1-click output image export and AI error explanations.",
      },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "LabBench — Online Code IDE" },
      {
        name: "twitter:description",
        content: "The ultimate online lab IDE for college students with zero setup required.",
      },
    ],
    links: [{ rel: "canonical", href: "https://labbench-woad.vercel.app/" }],
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

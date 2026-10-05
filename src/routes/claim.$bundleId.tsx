import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ArrowLeft, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getShare } from "@/lib/ide/share.functions";

export const Route = createFileRoute("/claim/$bundleId")({
  head: () => ({ meta: [
    { title: "Shared workspace — LabBench" },
    { name: "description", content: "Open a temporary LabBench coding workspace shared with your phone." },
    { property: "og:title", content: "Shared workspace — LabBench" },
    { property: "og:description", content: "Open shared code and output on your phone. Link expires in 24 hours." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Claim,
});

function Claim() {
  const { bundleId } = Route.useParams();
  const [share, setShare] = useState<Awaited<ReturnType<typeof getShare>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getShare({ data: { id: bundleId } }).then((value) => { if (live) { setShare(value); setLoading(false); } })
      .catch(() => { if (live) { setError("This link is invalid or unavailable."); setLoading(false); } });
    return () => { live = false; };
  }, [bundleId]);
  const download = async () => {
    if (!share) return;
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const [path, content] of Object.entries(share.files)) {
      if (path.includes("..") || path.startsWith("/")) continue;
      zip.file(path, content);
    }
    zip.file("terminal-output.txt", share.output);
    if (share.image) zip.file("output.png", share.image.split(",")[1] ?? "", { base64: true });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "labbench-output.zip"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return <main className="min-h-screen overflow-y-auto bg-background p-5 text-foreground sm:p-10">
    <div className="mx-auto max-w-2xl">
      <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> LabBench</a>
      <h1 className="mt-10 text-2xl font-semibold">Shared output</h1>
      {loading ? <p className="mt-6 text-muted-foreground">Opening…</p> : error || !share ? <p className="mt-6 text-destructive">{error || "This link has expired or was removed."}</p> : <>
        <p className="mt-2 text-sm text-muted-foreground">Available until {new Date(share.expiresAt).toLocaleString()}.</p>
        <Button className="mt-6" onClick={() => void download()}><Download /> Download all files</Button>
        {share.image && <img src={share.image} alt="Output screenshot" className="mt-6 w-full rounded border" />}
        <div className="mt-8 border-t pt-5"><h2 className="text-sm font-medium">Files</h2>
          <div className="mt-3 space-y-2">{Object.entries(share.files).filter(([path]) => !path.endsWith(".keep")).map(([path, content]) => <details key={path} className="rounded border bg-panel">
            <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm"><FileCode2 size={15} className="text-primary" /> {path}</summary>
            <pre className="max-h-72 overflow-auto border-t p-3 font-mono text-xs whitespace-pre-wrap">{content}</pre>
          </details>)}</div>
        </div>
        <div className="mt-8 border-t pt-5"><h2 className="text-sm font-medium">Terminal output</h2><pre className="mt-3 max-h-80 overflow-auto rounded border bg-panel p-3 font-mono text-xs whitespace-pre-wrap">{share.output || "No output captured."}</pre></div>
      </>}
    </div>
  </main>;
}
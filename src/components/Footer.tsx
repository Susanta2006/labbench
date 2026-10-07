import { Globe, Github, Linkedin } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 w-full shrink-0 border-t border-border bg-card/80 py-6 text-xs text-muted-foreground backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
        <div>
          <p className="font-medium text-foreground/80">
            © {new Date().getFullYear()} LabBench. All rights reserved.
          </p>
          <p className="text-[11px]">Empowering students with real-time IDE & AI lab assistance.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          <a href="/privacy" className="transition-colors hover:text-foreground">Privacy Policy</a>
          <span aria-hidden="true">•</span>
          <a href="/terms" className="transition-colors hover:text-foreground">Terms &amp; Conditions</a>
          <span aria-hidden="true">•</span>
          <div className="flex items-center gap-2">
            <a href="https://susanta-banik.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Portfolio" className="p-1 hover:text-foreground"><Globe size={15} /></a>
            <a href="https://github.com/Susanta2006" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="p-1 hover:text-foreground"><Github size={15} /></a>
            <a href="https://www.linkedin.com/in/susanta-banik" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="p-1 hover:text-foreground"><Linkedin size={15} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}

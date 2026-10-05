import { Globe, Github, Linkedin, Shield, FileText } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-card/80 py-6 text-xs text-muted-foreground backdrop-blur-sm z-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:text-left sm:px-6">
        <div>
          <p className="font-medium text-foreground/80">
            © {currentYear} LabBench. All rights reserved.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Empowering students with real-time AI lab assistance.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          <span>•</span>
          <a href="/terms" className="hover:text-foreground transition-colors">
            Terms & Conditions
          </a>
          <span>•</span>
          <div className="flex items-center gap-2">
            <a
              href="https://susanta-banik.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Portfolio"
              className="p-1 hover:text-foreground"
            >
              <Globe size={15} />
            </a>
            <a
              href="https://github.com/Susanta2006"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="p-1 hover:text-foreground"
            >
              <Github size={15} />
            </a>
            <a
              href="https://www.linkedin.com/in/susanta-banik"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="p-1 hover:text-foreground"
            >
              <Linkedin size={15} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Globe, Github, Linkedin, Shield, FileText } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-card/50 text-xs text-muted-foreground backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
        
        {/* Copyright & Core Info */}
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p className="font-medium text-foreground/80">
            © {currentYear} LabBench. All rights reserved.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Empowering students with real-time AI lab assistance.
          </p>
        </div>

        {/* Links: Legal & Developer Details */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
          {/* Legal Links */}
          <div className="flex items-center gap-4 border-r border-border/60 pr-6">
            <a
              href="/privacy"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Shield size={13} className="text-muted-foreground" />
              <span>Privacy Policy</span>
            </a>
            <a
              href="/terms"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <FileText size={13} className="text-muted-foreground" />
              <span>Terms & Conditions</span>
            </a>
          </div>

          {/* Developer Details */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-foreground/70">
              Dev:
            </span>
            <a
              href="https://susanta-banik.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
              title="Portfolio"
            >
              <Globe size={14} />
            </a>
            <a
              href="https://github.com/Susanta2006"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
              title="GitHub"
            >
              <Github size={14} />
            </a>
            <a
              href="https://www.linkedin.com/in/susanta-banik"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
              title="LinkedIn"
            >
              <Linkedin size={14} />
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}

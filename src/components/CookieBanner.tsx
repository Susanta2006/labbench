import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie, X } from "lucide-react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("labbench.cookieConsent");
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("labbench.cookieConsent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("labbench.cookieConsent", "essential");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Cookie consent banner"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cookie size={18} />
        </div>
        <div className="flex-1 text-xs text-muted-foreground leading-normal">
          <p className="text-foreground font-medium">We use essential local storage</p>
          <p className="mt-1">
            LabBench stores your code, workspace tabs, and AI credits locally. We do not use
            third-party advertising cookies.{" "}
            <Link to="/cookies" className="text-primary underline hover:text-primary/80">
              Read Cookie Policy
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={accept}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Accept All
            </button>
            <button
              onClick={decline}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              Essential Only
            </button>
          </div>
        </div>
        <button
          onClick={decline}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss banner"
        >
          <X size={15} />
        </button>
      </div>
    </aside>
  );
}

import { useState, useEffect } from "react";
import { FolderTree, Code2, Terminal, Share2, ArrowRight, ArrowLeft, Check, X } from "lucide-react";

interface WalkthroughTourProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

const STEPS = [
  {
    icon: FolderTree,
    title: "1. File Explorer & Multi-Language",
    subtitle: "Organize files by language folders",
    desc: "Create and manage files in Python, C, C++, Java, Node, React, and more. When you switch folders or files, LabBench automatically sets the language compiler and terminal environment.",
    hint: "Click the folder icon or '+ Add' to select starter boilerplates.",
  },
  {
    icon: Code2,
    title: "2. Editor & Code Formatting",
    subtitle: "Clean code with standard formatters",
    desc: "Write code with full syntax highlighting. Press Ctrl+Shift+F (or Cmd+Shift+F) to automatically format your code with Prettier and clang-format before submitting your lab practical.",
    hint: "Shortcuts: Ctrl+S saves, Ctrl+Shift+F formats.",
  },
  {
    icon: Terminal,
    title: "3. Interactive Terminal & Save Ink",
    subtitle: "Run CLI or Web previews with live stdin",
    desc: "Run programs with real line-by-line stdin input. For laboratory write-ups, switch to 'Save Ink' light mode for crisp printing, or download high-resolution 16:9 output screenshots.",
    hint: "HTML/CSS projects render live website previews in the output window.",
  },
  {
    icon: Share2,
    title: "4. Send to Phone & Google Drive",
    subtitle: "Instant submissions without manual copying",
    desc: "Scan the 'Send to phone' QR code to review your output on mobile (expires safely in 24 hours). Sign in with Google to back up your output screenshot and code straight into My Drive/output/.",
    hint: "Look under the '...' menu in the top bar for quick export actions.",
  },
];

export function WalkthroughTour({ forceOpen = false, onClose }: WalkthroughTourProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    const done = localStorage.getItem("labbench.tourCompleted");
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  const handleFinish = () => {
    localStorage.setItem("labbench.tourCompleted", "true");
    setOpen(false);
    onClose?.();
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={handleFinish}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleFinish}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Skip tour"
        >
          <X size={18} />
        </button>

        {/* Progress Dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-7 bg-primary" : i < step ? "w-3 bg-primary/40" : "w-3 bg-muted"
              }`}
            />
          ))}
          <span className="ml-auto text-[11px] font-mono text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Step Icon & Title */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{current.title}</h2>
            <p className="text-xs text-muted-foreground">{current.subtitle}</p>
          </div>
        </div>

        {/* Step Content */}
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-foreground/90">{current.desc}</p>
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
            💡 <strong>Tip:</strong> {current.hint}
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-6 flex items-center justify-between pt-2">
          <button
            onClick={handleFinish}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Skip walkthrough
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
            >
              {step === STEPS.length - 1 ? (
                <>
                  Finish <Check size={14} />
                </>
              ) : (
                <>
                  Next <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

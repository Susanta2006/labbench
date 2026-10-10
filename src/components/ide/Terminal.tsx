import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalHandle {
  write: (s: string) => void;
  clear: () => void;
  redrawPrompt: (prompt: string) => boolean;
  readLine: (opts?: { history?: boolean }) => Promise<string | null>; // null = Ctrl+C / Ctrl+D
  injectLine: (s: string) => boolean;
  isReading: () => boolean;
  isReady: () => boolean;
  cancelRead: () => void;
  focus: () => void;
  scrollLines: (amount: number) => void;
  snapshot: (opts: { dark: boolean; scale: number }) => string;
}

// Light Output (Save Ink) — pure white, black text
const BRIGHT: ITheme = {
  background: "#ffffff", foreground: "#000000", cursor: "#000000", cursorAccent: "#ffffff", selectionBackground: "#b6d7ff",
  black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#7d4e00", blue: "#0550ae", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
  brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01", brightBlue: "#0969da", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#8c959f",
};
// Dark — VS Code Dark+
const DARK: ITheme = {
  background: "#1e1e1e", foreground: "#e6e6e6", cursor: "#ffffff", cursorAccent: "#1e1e1e", selectionBackground: "#264f78",
  black: "#000000", red: "#f14c4c", green: "#23d18b", yellow: "#f5f543", blue: "#3b8eea", magenta: "#d670d6", cyan: "#29b8db", white: "#e5e5e5",
  brightBlack: "#8a8a8a", brightRed: "#f14c4c", brightGreen: "#23d18b", brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#ffffff",
};

const FONT = '"JetBrains Mono", Consolas, "Courier New", monospace';

export const Terminal = forwardRef<TerminalHandle, { dark: boolean; onInterrupt: () => void }>(
  function Terminal({ dark, onInterrupt }, ref) {
    const el = useRef<HTMLDivElement>(null);
    const term = useRef<XTerm | null>(null);
    const pending = useRef<((v: string | null) => void) | null>(null);
    const useHist = useRef(false);
    const line = useRef("");
    const history = useRef<string[]>([]);
    const hIdx = useRef(0);
    const interruptRef = useRef(onInterrupt);
    interruptRef.current = onInterrupt;

    const replaceLine = (t: XTerm, s: string) => {
      t.write("\b \b".repeat(line.current.length));
      line.current = s;
      t.write(s);
    };
    const resolve = (v: string | null) => {
      const p = pending.current; pending.current = null; line.current = "";
      p?.(v);
    };

    useEffect(() => {
      let disposed = false;
      let cleanup = () => {};
      (async () => {
        try { await document.fonts.load(`14px ${FONT}`); await document.fonts.load(`bold 14px ${FONT}`); } catch { /* */ }
        if (disposed || !el.current) return;
        const t = new XTerm({
          fontFamily: FONT, fontSize: 14, lineHeight: 1.25, fontWeight: "400", fontWeightBold: "700",
          cursorBlink: true, cursorStyle: "bar", convertEol: true, disableStdin: false,
          theme: dark ? DARK : BRIGHT, scrollback: 10000, allowProposedApi: true, minimumContrastRatio: 4.5,
        });
        const fit = new FitAddon();
        t.loadAddon(fit);
        t.open(el.current);
        fit.fit();
        const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* */ } });
        ro.observe(el.current);
        t.attachCustomKeyEventHandler((e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.type !== "keydown") return true;
          if (mod && e.key.toLowerCase() === "c" && t.hasSelection()) { void navigator.clipboard.writeText(t.getSelection()); return false; }
          if (mod && e.key.toLowerCase() === "v") return false; // let browser paste event reach xterm
          if (mod && e.key.toLowerCase() === "l") { t.clear(); return false; }
          if (mod && e.key === "Enter") return false; // handled globally (Run)
          return true;
        });
        t.onData((data) => {
          if (data.startsWith("\x1b")) {
            if (!pending.current || !useHist.current) return;
            const h = history.current;
            if (data === "\x1b[A" && hIdx.current > 0) { hIdx.current--; replaceLine(t, h[hIdx.current] ?? ""); }
            else if (data === "\x1b[B") { hIdx.current = Math.min(h.length, hIdx.current + 1); replaceLine(t, h[hIdx.current] ?? ""); }
            return;
          }
          for (const ch of data) {
            if (ch === "\x03") {
              t.write("^C\r\n");
              resolve(null);
              interruptRef.current();
            } else if (!pending.current) {
              continue;
            } else if (ch === "\r" || ch === "\n") {
              t.write("\r\n");
              const v = line.current;
              if (useHist.current && v.trim()) { history.current.push(v); }
              hIdx.current = history.current.length;
              resolve(v);
            } else if (ch === "\x7f" || ch === "\b") {
              if (line.current.length) { line.current = line.current.slice(0, -1); t.write("\b \b"); }
            } else if (ch === "\x04") {
              t.write("^D\r\n");
              resolve(null);
            } else if (ch === "\t") {
              line.current += "    "; t.write("    ");
            } else if (ch >= " ") {
              line.current += ch; t.write(ch);
            }
          }
        });
        term.current = t;
        cleanup = () => { ro.disconnect(); t.dispose(); };
      })();
      return () => { disposed = true; cleanup(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { if (term.current) term.current.options.theme = dark ? DARK : BRIGHT; }, [dark]);

    useImperativeHandle(ref, () => ({
      write: (s) => term.current?.write(s),
      clear: () => { term.current?.clear(); term.current?.write("\x1b[2J\x1b[H"); },
      redrawPrompt: (prompt) => {
        if (!pending.current) return false;
        term.current?.write(`\r\x1b[2K${prompt}${line.current}`);
        return true;
      },
      readLine: (opts) => new Promise((res) => {
        pending.current = res; line.current = ""; useHist.current = !!opts?.history;
        hIdx.current = history.current.length;
        term.current?.focus();
      }),
      injectLine: (s) => {
        if (!pending.current) return false;
        term.current?.write("\b \b".repeat(line.current.length) + s + "\r\n");
        resolve(s);
        return true;
      },
      isReading: () => !!pending.current,
      isReady: () => !!term.current,
      cancelRead: () => resolve(null),
      focus: () => term.current?.focus(),
      scrollLines: (amount) => term.current?.scrollLines(amount),
      snapshot: ({ dark, scale }) => (term.current ? renderSnapshot(term.current, dark ? DARK : BRIGHT, scale) : ""),
    }));

    return (
      <div
        ref={el}
        className={`terminal-host h-full w-full overflow-hidden ${dark ? "terminal-dark" : "terminal-light"}`}
        onWheelCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const lines =
            event.deltaMode === WheelEvent.DOM_DELTA_LINE
              ? event.deltaY
              : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? event.deltaY * 20
                : event.deltaY / 40;
          term.current?.scrollLines(Math.sign(lines) * Math.max(1, Math.round(Math.abs(lines))));
        }}
      />
    );
  },
);

// Render the terminal text onto a wide 16:9 canvas (desktop-style, independent of pane size)
function renderSnapshot(t: XTerm, theme: ITheme, scale: number) {
  const pal = [theme.black, theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan, theme.white,
    theme.brightBlack, theme.brightRed, theme.brightGreen, theme.brightYellow, theme.brightBlue, theme.brightMagenta, theme.brightCyan, theme.brightWhite];
  type Cell = { ch: string; fg: string; bold: boolean };
  const buf = t.buffer.active;
  const logical: Cell[][] = [];
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y); if (!line) continue;
    const cells: Cell[] = [];
    for (let x = 0; x < line.length; x++) {
      const c = line.getCell(x); if (!c || c.getWidth() === 0) continue;
      let fg = theme.foreground!;
      if (c.isFgPalette()) fg = pal[c.getFgColor()] ?? fg;
      else if (c.isFgRGB()) fg = "#" + c.getFgColor().toString(16).padStart(6, "0");
      cells.push({ ch: c.getChars() || " ", fg, bold: !!c.isBold() });
    }
    if (line.isWrapped && logical.length) logical[logical.length - 1]!.push(...cells); else logical.push(cells);
  }
  for (const l of logical) while (l.length && l[l.length - 1]!.ch === " ") l.pop();
  while (logical.length && logical[logical.length - 1]!.length === 0) logical.pop();
  const COLS = 100, ROWS = 28;
  const rows: Cell[][] = [];
  for (const l of logical) { if (!l.length) rows.push([]); for (let i = 0; i < l.length; i += COLS) rows.push(l.slice(i, i + COLS)); }
  const shown = rows.slice(-ROWS);
  const fs = 15, lh = 22, pad = 28;
  const W = 1280, H = 720;
  const c = document.createElement("canvas");
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = theme.background!; g.fillRect(0, 0, W, H);
  g.textBaseline = "top";
  g.font = `${fs}px ${FONT}`;
  const cw = g.measureText("M").width;
  shown.forEach((r, y) => r.forEach((cell, x) => {
    g.font = `${cell.bold ? "bold " : ""}${fs}px ${FONT}`;
    g.fillStyle = cell.fg; g.fillText(cell.ch, pad + x * cw, pad + y * lh);
  }));
  return c.toDataURL("image/png");
}

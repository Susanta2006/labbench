/* Runs Python locally on the student's machine using Pyodide. */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let pyodide = null;
let ctrl = null; // Int32Array [flag, length] (shared memory, real-time input)
let buf = null;
let replayInputs = null; // fallback: replay mode inputs
let needInput = false;
const dec = new TextDecoder();
const out = (type, text) => postMessage({ type, text });

let initP = null;
function init() { return (initP ??= initInner()); }
async function initInner() {
  out("status", "Starting Python 3.12 runtime on your computer (first run only)...");
  pyodide = await loadPyodide();
  pyodide.setStdout({ write: (b) => { out("out", dec.decode(b)); return b.length; } });
  pyodide.setStderr({ write: (b) => { out("err", dec.decode(b)); return b.length; } });
  pyodide.setStdin({
    stdin: () => {
      if (ctrl) {
        Atomics.store(ctrl, 0, 0);
        postMessage({ type: "input" });
        Atomics.wait(ctrl, 0, 0);
        const len = ctrl[1];
        if (len < 0) return null;
        return dec.decode(buf.slice(0, len)) + "\n";
      }
      if (replayInputs && replayInputs.length) return replayInputs.shift() + "\n";
      needInput = true;
      throw new Error("__LB_NEED_INPUT__");
    },
    isatty: true,
  });
  return pyodide;
}

async function pipInstall(py, pkgs, quiet) {
  await py.loadPackage("micropip", { messageCallback: () => {} });
  const micropip = py.pyimport("micropip");
  for (const p of pkgs) {
    if (!quiet) out("out", `Collecting ${p}\n`);
    try {
      await micropip.install(p);
      if (!quiet) out("out", `\x1b[32mSuccessfully installed ${p}\x1b[0m\n`);
    } catch (e) {
      if (!quiet) out("err", `ERROR: Could not install ${p}: ${String(e.message || e).split("\n").pop()}\n`);
    }
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    if (msg.sab) { ctrl = new Int32Array(msg.sab, 0, 2); buf = new Uint8Array(msg.sab, 8); }
    await init();
    postMessage({ type: "ready" });
    return;
  }
  const py = await init();

  if (msg.type === "pip") {
    if (msg.list) {
      await py.loadPackage("micropip", { messageCallback: () => {} });
      const pkgs = py.pyimport("micropip").list().toJs();
      out("out", "Package            Version\n------------------ -------\n");
      for (const [name, info] of pkgs) out("out", `${name.padEnd(18)} ${info.version}\n`);
    } else {
      await pipInstall(py, msg.pkgs, false);
    }
    postMessage({ type: "pip-done" });
    return;
  }

  if (msg.type !== "run") return;
  const first = !msg.attempt;
  replayInputs = msg.inputs ? [...msg.inputs] : null;
  needInput = false;
  let code = msg.code;
  const pkgs = [];
  code = code.replace(/^\s*[!%]pip\s+install\s+(.+)$/gm, (_, list) => {
    pkgs.push(...list.split(/\s+/).filter((x) => x && !x.startsWith("-")));
    return "";
  });
  try {
    if (pkgs.length) await pipInstall(py, pkgs, !first);
    await py.loadPackagesFromImports(code, {
      messageCallback: (m) => { if (first && /^Load/.test(m)) out("status", m.replace(/^Loading/, "Installing")); },
      errorCallback: () => {},
    });
    if (/matplotlib/.test(code)) await py.runPythonAsync("import matplotlib\nmatplotlib.use('Agg')");
    const g = py.globals.get("dict")();
    g.set("__name__", "__main__");
    await py.runPythonAsync(code, { globals: g });
    if (/matplotlib/.test(code)) {
      const imgs = await py.runPythonAsync(`
import io, base64
import matplotlib.pyplot as _plt
_r = []
for _n in _plt.get_fignums():
    _b = io.BytesIO(); _plt.figure(_n).savefig(_b, format='png', dpi=150, bbox_inches='tight')
    _r.append(base64.b64encode(_b.getvalue()).decode())
_plt.close('all')
_r`);
      for (const b of imgs.toJs()) postMessage({ type: "image", data: "data:image/png;base64," + b });
    }
    postMessage(needInput ? { type: "need-input" } : { type: "done", code: 0 });
  } catch (err) {
    if (needInput) { postMessage({ type: "need-input" }); return; }
    out("err", String(err.message || err) + "\n");
    postMessage({ type: "done", code: 1 });
  }
};

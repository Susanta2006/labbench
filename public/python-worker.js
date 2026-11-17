/* Runs Python locally on the student's machine using Pyodide. */
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let pyodide = null;
let ctrl = null; // Int32Array [flag, length] (shared memory, real-time input)
let buf = null;
let replayInputs = null; // fallback: replay mode inputs
let needInput = false;
const dec = new TextDecoder();
const out = (type, text) => postMessage({ type, text });

// Where the active project's files are mounted inside Pyodide's virtual filesystem.
const PROJECT = "/home/pyodide/project";

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
  // Browser Python cannot run shell commands (os.system returns 32512, "command not found").
  // Explain that once, instead of letting a ping check silently report a false "DOWN".
  // `ping <host>` cannot run in the browser. It is answered with the browser's own internet check
  // (taken just before the run and passed in as __lb_internet), so the result matches the desktop
  // output. Redirections such as "> /dev/null 2>&1" are ignored, as in the desktop shell.
  // Private or local addresses cannot be checked from a browser, so they report "not reachable".
  pyodide.runPython(`
import os, platform, re, sys, ipaddress
_lb_system = os.system
def _lb_os_system(cmd):
    tokens = re.split(r"\\s[12]?>", cmd)[0].split()
    if tokens and tokens[0] == "ping" and len(tokens) > 1:
        host = tokens[-1]
        try:
            private = ipaddress.ip_address(host).is_private
        except ValueError:
            private = False
        if private:
            print("LabBench note: the browser cannot ping private or local address %s." % host, file=sys.stderr)
            return 1
        return 0 if __lb_internet else 1
    r = _lb_system(cmd)
    if r != 0 and platform.system() == "Emscripten":
        print("LabBench note: os.system() cannot run programs in the browser Python runtime (returned %d, command not found). Use the internet status shown above the terminal instead." % r, file=sys.stderr)
    return r
os.system = _lb_os_system
__lb_internet = False
`);
  return pyodide;
}

/*
 * Replace the previous project with the current one. Every run gets a fresh copy so
 * edits and deleted files are picked up and stale modules never leak between runs.
 * `files` maps project-relative paths (e.g. "utils/helpers.py") to text content.
 */
function mountProject(py, files, entry) {
  py.runPython(`
import os, shutil, sys
_root = ${JSON.stringify(PROJECT)}
for _m in list(sys.modules):
    _f = getattr(sys.modules[_m], "__file__", None) or ""
    if _f.startswith(_root + "/"):
        del sys.modules[_m]
shutil.rmtree(_root, ignore_errors=True)
os.makedirs(_root, exist_ok=True)
`);
  for (const [rel, content] of Object.entries(files)) {
    const full = `${PROJECT}/${rel}`;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    py.FS.writeFile(full, content);
  }
  const entryDir = `${PROJECT}/${entry}`.split("/").slice(0, -1).join("/");
  py.FS.chdir(PROJECT);
  py.runPython(`
import sys
for _p in [${JSON.stringify(entryDir)}, ${JSON.stringify(PROJECT)}]:
    if _p not in sys.path:
        sys.path.insert(0, _p)
`);
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
  py.globals.set("__lb_internet", !!msg.internet);
  const entry = msg.entry || "main.py";
  // The project as it exists on disk; the entry file always reflects the code being run.
  const files = { ...(msg.files || {}), [entry]: msg.code };
  let code = msg.code;
  const pkgs = [];
  code = code.replace(/^\s*[!%]pip\s+install\s+(.+)$/gm, (_, list) => {
    pkgs.push(...list.split(/\s+/).filter((x) => x && !x.startsWith("-")));
    return "";
  });
  files[entry] = code;
  const allSource = Object.values(files).join("\n");
  try {
    if (pkgs.length) await pipInstall(py, pkgs, !first);
    await py.loadPackagesFromImports(allSource, {
      messageCallback: (m) => { if (first && /^Load/.test(m)) out("status", m.replace(/^Loading/, "Installing")); },
      errorCallback: () => {},
    });
    mountProject(py, files, entry);
    if (/matplotlib/.test(allSource)) await py.runPythonAsync("import matplotlib\nmatplotlib.use('Agg')");
    const g = py.globals.get("dict")();
    g.set("__name__", "__main__");
    await py.runPythonAsync(code, { globals: g });
    if (/matplotlib/.test(allSource)) {
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
    const msg = String(err.message || err);
    if (/No module named 'tkinter'/.test(msg)) {
      out("err", "tkinter (desktop GUI library) is not available in the browser Python runtime. Build GUI practicals with HTML, CSS and JavaScript in the Web preview instead.\n");
    } else if (/No module named 'psutil'/.test(msg)) {
      out("err", "psutil needs direct operating-system access, which the browser Python runtime does not have. Use platform and time information instead.\n");
    }
    out("err", msg + "\n");
    postMessage({ type: "done", code: 1 });
  }
};

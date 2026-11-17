// Node.js-style project runner for the browser. Runs CommonJS modules (require) over the
// workspace files. Bare package names (npm) and ES `import`/`export` syntax are not available
// here and fail with the same messages Node gives for a missing module or a CommonJS file.
//
// Written as plain JavaScript inside String.raw so the same source runs in the browser worker
// and in tests. Do not use template-literal interpolation (`${...}`) inside it.
export const NODE_RUNTIME_SOURCE = String.raw`
function __lbNormalize(p) {
  var out = [];
  p.split("/").forEach(function (s) {
    if (!s || s === ".") return;
    if (s === "..") out.pop();
    else out.push(s);
  });
  return out.join("/");
}
function __lbJoin(dir, name) { return dir ? dir + "/" + name : name; }
function __lbDirOf(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }

async function __lbRunProject(files, entry) {
  var cache = {};
  var has = function (p) { return Object.prototype.hasOwnProperty.call(files, p); };

  function resolve(dir, spec) {
    var c0 = spec.charAt(0);
    if (c0 !== "." && c0 !== "/") return null;
    var base = c0 === "/" ? __lbNormalize(spec) : __lbNormalize(__lbJoin(dir, spec));
    var candidates = [base, base + ".js", base + ".cjs", base + ".json",
      __lbJoin(base, "index.js"), __lbJoin(base, "index.json")];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && has(candidates[i])) return candidates[i];
    }
    return null;
  }

  function run(path, src, module) {
    var dir = __lbDirOf(path);
    var req = function (spec) { return requireFrom(dir, spec); };
    var fn = new Function("exports", "require", "module", "__filename", "__dirname",
      src + "\n//# sourceURL=/" + path);
    fn(module.exports, req, module, "/" + path, dir ? "/" + dir : "/");
  }

  function load(path) {
    if (cache[path]) return cache[path].exports;
    var src = files[path];
    var module = { id: path, filename: "/" + path, exports: {}, loaded: false };
    cache[path] = module;
    try {
      if (/\.json$/.test(path)) {
        module.exports = JSON.parse(src);
      } else {
        if (/^\s*(import|export)\s/m.test(src)) {
          throw new SyntaxError("Cannot use import statement outside a module (" + path +
            "). Use require() in CommonJS files.");
        }
        run(path, src, module);
      }
    } catch (e) {
      delete cache[path];
      throw e;
    }
    module.loaded = true;
    return module.exports;
  }

  function requireFrom(dir, spec) {
    var path = resolve(dir, spec);
    if (path === null) {
      var err = new Error("Cannot find module '" + spec + "'");
      err.code = "MODULE_NOT_FOUND";
      throw err;
    }
    return load(path);
  }

  var entryPath = __lbNormalize(entry);
  if (!has(entryPath)) throw new Error("Cannot find entry file '" + entry + "'");
  var module = { id: ".", filename: "/" + entryPath, exports: {}, loaded: false };
  cache[entryPath] = module;
  var dir = __lbDirOf(entryPath);
  var req = function (spec) { return requireFrom(dir, spec); };
  var body = "return (async () => {\n" + files[entryPath] + "\n})();";
  var fn = new Function("exports", "require", "module", "__filename", "__dirname",
    body + "\n//# sourceURL=/" + entryPath);
  await fn(module.exports, req, module, "/" + entryPath, dir ? "/" + dir : "/");
  module.loaded = true;
  return module.exports;
}
`;

// Worker source: console capture, plus a message handler that runs one project per request.
export function buildNodeWorkerSource(): string {
  return (
    String.raw`
const fmt = a => a.map(x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x, null, 2); } catch { return String(x); } })()).join(' ');
console.log = (...a) => postMessage({ type: 'out', text: fmt(a) + '\n' });
console.info = console.log;
console.error = console.warn = (...a) => postMessage({ type: 'err', text: fmt(a) + '\n' });
onmessage = async e => {
  try {
    await __lbRunProject(e.data.files, e.data.entry);
    postMessage({ type: 'done', code: 0 });
  } catch (err) {
    postMessage({ type: 'err', text: String((err && err.stack) || err) + '\n' });
    postMessage({ type: 'done', code: 1 });
  }
};
` + NODE_RUNTIME_SOURCE
  );
}

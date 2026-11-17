// Local SQLite (sql.js, free, runs in the browser). Every run starts with a fresh in-memory
// database so results are reproducible for students. Multiple statements run in order; every
// SELECT result is printed. Written as plain JavaScript inside String.raw so the browser worker
// and the tests run the same code. Do not use template-literal interpolation inside it.
export const SQL_CORE_SOURCE = String.raw`
function __lbCell(v) { return v === null ? "NULL" : String(v); }

function __lbFormat(sets) {
  return sets.map(function (set) {
    var cols = set.columns.map(String);
    var rows = set.values.map(function (r) { return r.map(__lbCell); });
    var widths = cols.map(function (c, i) {
      return rows.reduce(function (w, r) { return Math.max(w, r[i].length); }, c.length);
    });
    var line = function (cells) {
      return cells.map(function (c, i) { return c + " ".repeat(widths[i] - c.length); }).join(" | ").replace(/\s+$/, "");
    };
    var out = [line(cols), widths.map(function (w) { return "-".repeat(w); }).join("-+-")];
    rows.forEach(function (r) { out.push(line(r)); });
    out.push("(" + rows.length + (rows.length === 1 ? " row)" : " rows)"));
    return out.join("\n") + "\n";
  }).join("\n");
}

function __lbRunSql(SQL, script) {
  if (!script.trim()) return { ok: true, output: "No SQL statements to run.\n" };
  var db = new SQL.Database();
  try {
    var sets = db.exec(script);
    var text = __lbFormat(sets);
    if (!sets.length) {
      var n = db.getRowsModified();
      text = n ? "Query executed successfully. The last statement affected " + n + " row(s).\n"
               : "Query executed successfully.\n";
    }
    return { ok: true, output: text };
  } catch (e) {
    return { ok: false, output: "SQL error: " + ((e && e.message) || String(e)) + "\n" };
  } finally {
    db.close();
  }
}
`;

/** Worker source: loads sql.js from this site, then runs each script it is sent. */
export function buildSqlWorkerSource(origin: string): string {
  return (
    `importScripts(${JSON.stringify(origin + "/sql-wasm.js")});\n` +
    `var __lbInit = initSqlJs({ locateFile: function (f) { return ${JSON.stringify(origin + "/")} + f; } });\n` +
    SQL_CORE_SOURCE +
    String.raw`
onmessage = async function (e) {
  try {
    var SQL = await __lbInit;
    var r = __lbRunSql(SQL, e.data.script);
    postMessage({ type: r.ok ? "out" : "err", text: r.output });
    postMessage({ type: "done", code: r.ok ? 0 : 1 });
  } catch (err) {
    postMessage({ type: "err", text: String(err) + "\n" });
    postMessage({ type: "done", code: 1 });
  }
};
`
  );
}

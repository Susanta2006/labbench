// @vitest-environment node
// Runs the real sql.js (SQLite compiled to WebAssembly) through the same core code the browser uses.
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { SQL_CORE_SOURCE } from "./sql-core";

let SQL: unknown;
let runSql: (SQL: unknown, script: string) => { ok: boolean; output: string };

beforeAll(async () => {
  SQL = await initSqlJs();
  runSql = new Function(`${SQL_CORE_SOURCE}\nreturn __lbRunSql;`)() as typeof runSql;
}, 60_000);

const STUDENTS = `
CREATE TABLE students(id INTEGER, name TEXT, marks INTEGER);
INSERT INTO students VALUES (1,'Asha',91),(2,'Ravi',78),(3,'Meena',NULL);
SELECT * FROM students ORDER BY marks DESC;
`;

describe("sql: local SQLite runs", () => {
  it("prints SELECT results as a table, with NULL shown explicitly", () => {
    const r = runSql(SQL, STUDENTS);
    expect(r.ok).toBe(true);
    expect(r.output.split("\n")[0]).toBe("id | name  | marks");
    expect(r.output.split("\n")[1]).toBe("---+-------+------");
    expect(r.output).toContain("(3 rows)");
    expect(r.output).toContain("Asha");
    expect(r.output).toContain("NULL");
  });

  it("supports WHERE, GROUP BY, aggregates and JOIN", () => {
    const r = runSql(
      SQL,
      `
CREATE TABLE dept(id INTEGER, name TEXT);
CREATE TABLE emp(name TEXT, dept_id INTEGER, salary INTEGER);
INSERT INTO dept VALUES (1,'CS'),(2,'Maths');
INSERT INTO emp VALUES ('A',1,500),('B',1,700),('C',2,400);
SELECT d.name AS dept, COUNT(*) AS n, SUM(e.salary) AS total
FROM emp e JOIN dept d ON d.id = e.dept_id
WHERE e.salary > 350
GROUP BY d.name
ORDER BY d.name;
`,
    );
    expect(r.ok).toBe(true);
    expect(r.output).toContain("CS");
    expect(r.output).toContain("1200");
    expect(r.output).toContain("Maths");
  });

  it("runs UPDATE and DELETE and reports rows affected when there is no result set", () => {
    const r = runSql(
      SQL,
      "CREATE TABLE t(x INTEGER);\nINSERT INTO t VALUES (1),(2),(3);\nDELETE FROM t WHERE x > 1;",
    );
    expect(r.ok).toBe(true);
    expect(r.output).toBe("Query executed successfully. The last statement affected 2 row(s).\n");
  });

  it("prints every SELECT when a script has several", () => {
    const r = runSql(SQL, "SELECT 1 AS a;\nSELECT 2 AS b;");
    expect(r.output.match(/\(1 row\)/g)?.length).toBe(2);
  });

  it("reports SQL errors clearly and marks the run as failed", () => {
    const r = runSql(SQL, "SELECT * FROM missing_table;");
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/^SQL error: .*missing_table/);
  });

  it("starts fresh on every run, so results are reproducible", () => {
    runSql(SQL, "CREATE TABLE once(x INTEGER);");
    const again = runSql(SQL, "CREATE TABLE once(x INTEGER);");
    expect(again.ok).toBe(true);
  });

  it("explains an empty script instead of printing nothing", () => {
    expect(runSql(SQL, "   \n").output).toBe("No SQL statements to run.\n");
  });
});

describe("sql worker source (what the browser actually runs)", () => {
  it("builds the sql.js URLs from the site origin and streams results back", async () => {
    const { buildSqlWorkerSource } = await import("./sql-core");
    const source = buildSqlWorkerSource("https://labbench.test");
    expect(source).toContain('importScripts("https://labbench.test/sql-wasm.js")');
    expect(source).toContain('"https://labbench.test/"');

    const messages: { type: string; text?: string; code?: number }[] = [];
    const holder: { onmessage?: (e: { data: unknown }) => Promise<void> } = {};
    const realInit = (await import("sql.js")).default;
    // Node loads the WASM from disk itself, so the browser URL options are ignored here.
    const stubInit = () => realInit();
    new Function(
      "importScripts",
      "initSqlJs",
      "postMessage",
      "holder",
      source.replace("onmessage = async function", "holder.onmessage = async function"),
    )(
      () => {},
      stubInit,
      (m: unknown) => messages.push(m as never),
      holder,
    );
    await holder.onmessage!({ data: { script: "SELECT 7 AS n;" } });
    expect(messages[0]?.type).toBe("out");
    expect(messages[0]?.text).toContain("(1 row)");
    expect(messages.at(-1)).toEqual({ type: "done", code: 0 });
  }, 60_000);
});

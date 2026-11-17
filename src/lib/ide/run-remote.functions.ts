import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compileAndRun, validateExtraFiles } from "./wandbox-client";

export const runRemote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        compiler: z.string().max(60),
        language: z.string().max(30),
        code: z.string().max(200_000),
        stdin: z.string().max(100_000),
        // Other files of the same project, keyed by path relative to the language folder.
        extraFiles: z.record(z.string().max(200), z.string().max(200_000)).optional(),
        entry: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const extraFiles = data.extraFiles ?? {};
    const problem = validateExtraFiles(extraFiles, data.entry ?? "");
    if (problem) {
      return {
        interactive: false,
        needInput: false,
        compileError: problem,
        stdout: "",
        stderr: "",
        status: "1",
      };
    }
    return compileAndRun({
      compiler: data.compiler,
      language: data.language,
      code: data.code,
      extraFiles,
      stdin: data.stdin,
    });
  });

import chalk from "chalk";
import ListCommand, { ListResult } from "./ListCommand.js";
import type { NamedBackend } from "../backends/ProjectBackends.js";
import { stripAnsi } from "../utils/ChalkTable.js";
import printable from "../utils/printable.js";

/**
 * `list` for a project with several backends: one table per backend, with
 * the backend's name as heading. A backend that fails, or can't start (e.g.
 * no AWS profile selected), gets its reason instead of a table; the others
 * are still listed.
 */
class ListAllCommand {
  constructor(private readonly backends: NamedBackend[]) {}

  public async execute(): Promise<ListResult> {
    const sections = await Promise.all(
      this.backends.map((named) => this.section(named))
    );
    return {
      output: sections.map(({ output }) => output).join("\n\n"),
      hasErrors: sections.some(({ hasErrors }) => hasErrors),
    };
  }

  private async section({ name, backend }: NamedBackend): Promise<ListResult> {
    // The name comes from hush.config.json.
    const heading = chalk.bold(printable(name));
    const problem = backend.setupProblem?.();
    if (problem) {
      return ListAllCommand.failed(heading, problem);
    }
    try {
      const { output, hasErrors } = await new ListCommand()
        .setBackend(backend)
        .execute();
      return { output: `${heading}\n${output}`, hasErrors };
    } catch (error) {
      return ListAllCommand.failed(
        heading,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private static failed(heading: string, reason: string): ListResult {
    const line =
      stripAnsi(reason)
        .split("\n")
        .map((part) => part.trim())
        .find((part) => part !== "") ?? "unknown error";
    return {
      output: `${heading}\n${chalk.red(`Can't be listed: ${line}`)}`,
      hasErrors: true,
    };
  }
}

export default ListAllCommand;

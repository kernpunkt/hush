import chalk from "chalk";
import ListCommand, { ListResult } from "./ListCommand.js";
import type { NamedBackend } from "../backends/ProjectBackends.js";
import { stripAnsi } from "../utils/ChalkTable.js";
import printable from "../utils/printable.js";

/**
 * `list` for a project with several backends: one table per backend, with
 * "Backend: <name> (<location>)" as its title row. A backend that fails, or can't start (e.g.
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
    // The name, and an AWS region in the location, come from hush.config.json.
    const location = backend.location
      ? ` (${printable(backend.location)})`
      : "";
    const heading = `${chalk.bold.green("Backend:")} ${chalk.bold(
      printable(name)
    )}${location}`;
    const problem = backend.setupProblem?.();
    if (problem) {
      return ListAllCommand.failed(heading, problem);
    }
    try {
      return await new ListCommand()
        .setBackend(backend)
        .setTitle(heading)
        .execute();
    } catch (error) {
      return ListAllCommand.failed(
        heading,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * The reason's headline after "Can't be listed:", and its hint lines
   * (like the role that is missing) below it.
   */
  private static failed(heading: string, reason: string): ListResult {
    const [line = "unknown error", ...hints] = stripAnsi(reason)
      .split("\n")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    const hintLines = hints.map((hint) => `\n   ${hint}`).join("");
    return {
      output: `${heading}\n${chalk.red(`Can't be listed: ${line}`)}${hintLines}`,
      hasErrors: true,
    };
  }
}

export default ListAllCommand;

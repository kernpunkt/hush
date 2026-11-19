import { vi } from "vitest";
import HushCommand from "../../src/HushCommand";
import SecretBackend from "../../src/backends/SecretBackend";
import { stripAnsi } from "../../src/utils/ChalkTable";

export type HushRun = {
    /** Everything Hush! printed until it exited, without ANSI codes. */
    output: string;
    exitCode: number;
};

/**
 * Runs one `hush` call like the CLI does and returns what it printed and its
 * exit code. Output after the first process.exit is ignored, as it would
 * never be printed.
 */
export default async function runHush(args: string[], backend?: SecretBackend): Promise<HushRun> {
    const lines: string[] = [];
    let exitCode: number | undefined;
    const record = (...parts: unknown[]) => {
        if (exitCode === undefined) {
            lines.push(stripAnsi(parts.map(String).join(" ")));
        }
    };
    const spies = [
        vi.spyOn(console, "log").mockImplementation(record),
        vi.spyOn(console, "info").mockImplementation(record),
        vi.spyOn(console, "warn").mockImplementation(record),
        vi.spyOn(console, "error").mockImplementation(record),
        vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
            if (exitCode === undefined) {
                exitCode = code ?? 0;
            }
        }) as typeof process.exit),
    ];
    try {
        const hush = new HushCommand();
        if (backend) {
            hush.setBackend(backend);
        }
        await hush.parseAsync(["node", "hush", ...args]);
        await vi.waitFor(() => {
            if (exitCode === undefined) throw new Error("hush has not exited yet");
        });
    } finally {
        spies.forEach((spy) => spy.mockRestore());
    }
    return { output: lines.join("\n"), exitCode: exitCode as number };
}

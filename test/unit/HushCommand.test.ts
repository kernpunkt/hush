import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command, ParseOptions } from "commander";
import HushCommand from "../../src/HushCommand";
import ListCommand from "../../src/commands/ListCommand";

// Mock console.log to prevent output during tests
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe("HushCommand", () => {
    afterEach(() => {
        consoleLogSpy.mockClear();
    });

    // AC-F02-4 (replaces the 4.1.0 test that expected exit code 1 without
    // AWS_PROFILE): the call without a command and the help need no profile.
    it.each([
        ["without a command", []],
        ["with --help", ["--help"]],
    ])("runs without an AWS_PROFILE %s and shows the help", (_, argv: string[]) => {
        const awsProfile = process.env.AWS_PROFILE;
        delete process.env.AWS_PROFILE;

        const exitSpy = vi.spyOn(process, "exit");
        exitSpy.mockImplementation((number) => { throw new Error(`proccess.exit: ${number}`);});
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
        const parseSpy = vi.spyOn(Command.prototype, "parse").mockReturnValue(new Command());

        try {
            new HushCommand().run(argv);

            expect(exitSpy).not.toHaveBeenCalled();
            expect(parseSpy).toHaveBeenCalledWith(argv, undefined);
            // The figlet banner and the version come before the help.
            expect(consoleLogSpy.mock.calls[0][0]).toMatch(/[|_]/);
            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Version"));
            const errorCall = consoleLogSpy.mock.calls.find(call =>
                String(call[0]).includes("You do not have an AWS profile selected")
            );
            expect(errorCall).toBeUndefined();
        } finally {
            exitSpy.mockRestore();
            infoSpy.mockRestore();
            parseSpy.mockRestore();
            if (awsProfile === undefined) {
                delete process.env.AWS_PROFILE;
            } else {
                process.env.AWS_PROFILE = awsProfile;
            }
        }
    });
    it("does not throw an error if an AWS_PROFILE is found", () => {
        const command = new HushCommand();

        process.env.AWS_PROFILE="hush-test-j27Bk$8HDm#^vt3"

        const mockCommand = vi.spyOn(Command.prototype, "parse");
        mockCommand.mockImplementation((argv?: readonly string[], options?: ParseOptions): Command => {
            return new Command();
        });
        command.run();
        expect(mockCommand).toHaveBeenCalled();
        
        // Verify the figlet banner was logged (check for ASCII art characters)
        expect(consoleLogSpy).toHaveBeenCalled();
        expect(consoleLogSpy.mock.calls[0][0]).toMatch(/[|_]/);
    });

    it("displays version information when help is requested", () => {
        const command = new HushCommand();
        process.env.AWS_PROFILE = "test-profile";

        // Mock console.log to capture output
        const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        // Mock Command.prototype.parse to prevent actual parsing
        const parseSpy = vi.spyOn(Command.prototype, "parse").mockReturnValue(new Command());

        // Call run with --help to trigger version display
        command.run(["--help"]);

        // Verify that console.log was called with version information
        // The version should be read from the actual package.json
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Hush! 🤫") && expect.stringContaining("Version"));

        // Clean up mocks
        consoleSpy.mockRestore();
        parseSpy.mockRestore();
    });

    it("displays version information when no arguments are provided", () => {
        const command = new HushCommand();
        process.env.AWS_PROFILE = "test-profile";

        // Mock console.log to capture output
        const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        // Mock Command.prototype.parse to prevent actual parsing
        const parseSpy = vi.spyOn(Command.prototype, "parse").mockReturnValue(new Command());

        // Call run with no arguments to trigger version display
        command.run([]);

        // Verify that console.log was called with version information
        // The version should be read from the actual package.json
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Hush! 🤫") && expect.stringContaining("Version"));

        // Clean up mocks
        consoleSpy.mockRestore();
        parseSpy.mockRestore();
    });

    describe("list", () => {
        const runList = async (hasErrors: boolean) => {
            const executeSpy = vi
                .spyOn(ListCommand.prototype, "execute")
                .mockResolvedValue({ output: "the table", hasErrors });
            const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
            try {
                await new HushCommand().parseAsync(["node", "hush", "list"]);
                await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled());
                return exitSpy.mock.calls;
            } finally {
                exitSpy.mockRestore();
                executeSpy.mockRestore();
            }
        };

        it("prints the table and exits 0 when every secret can be read", async () => {
            const exitCalls = await runList(false);

            expect(consoleLogSpy).toHaveBeenCalledWith("the table");
            expect(exitCalls).toEqual([[0]]);
        });

        it("prints the table and exits 1 when a secret can't be read", async () => {
            const exitCalls = await runList(true);

            expect(consoleLogSpy).toHaveBeenCalledWith("the table");
            expect(exitCalls).toEqual([[1]]);
        });
    });
});
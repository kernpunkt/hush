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

    it("throws an error if no AWS_PROFILE can be found", () => {
        const awsProfile = process.env.AWS_PROFILE;
        delete process.env.AWS_PROFILE;
        
        const spy = vi.spyOn(process, "exit");
        spy.mockImplementation((number) => { throw new Error(`proccess.exit: ${number}`);});

        const command = new HushCommand();

        expect(() => {
            command.run([]);
        }).toThrow();
        expect(spy).toHaveBeenCalledWith(1);
        
        // Verify the figlet banner and error message were logged
        expect(consoleLogSpy).toHaveBeenCalled();
        // Check for ASCII art characters from the figlet banner
        expect(consoleLogSpy.mock.calls[0][0]).toMatch(/[|_]/);
        const errorCall = consoleLogSpy.mock.calls.find(call => 
            call[0].includes("You do not have an AWS profile selected")
        );
        expect(errorCall).toBeDefined();
        
        spy.mockRestore();
        process.env.AWS_PROFILE = awsProfile; 
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
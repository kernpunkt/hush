import { Command, ParseOptions } from "commander";
import HushCommand from "../src/HushCommand";

describe("HushCommand", () => {
    it("throws an error if no AWS_PROFILE can be found", () => {
        const command = new HushCommand();
        expect(command.run).toThrow();
    });
    it("does not throw an error if an AWS_PROFILE is found", () => {
        const command = new HushCommand();

        process.env.AWS_PROFILE="hush-test-j27Bk$8HDm#^vt3"

        const mockCommand = jest.spyOn(Command.prototype, "parse");
        mockCommand.mockImplementation((argv?: readonly string[], options?: ParseOptions): Command => {
            return new Command();
        });
        command.run();
        expect(mockCommand).toHaveBeenCalled();
    });
});
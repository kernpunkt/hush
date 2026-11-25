import { describe, it, expect } from "vitest";
import chalk from "chalk";
import withHints, { splitHints } from "../../../src/utils/withHints";

describe("withHints", () => {
    it("puts each hint on its own line, indented by 3 spaces", () => {
        expect(withHints("Headline.", "First hint.", "Second hint.")).toBe("Headline.\n   First hint.\n   Second hint.");
    });
});

describe("splitHints", () => {
    it("takes a message written with withHints apart", () => {
        expect(splitHints(withHints("Headline.", "First hint.", "Second hint."))).toEqual({
            headline: "Headline.",
            hints: ["First hint.", "Second hint."],
        });
    });

    it("removes ANSI codes", () => {
        expect(splitHints(withHints(`The ${chalk.bold("vault")}.`, `Run ${chalk.bold("az login")}.`))).toEqual({
            headline: "The vault.",
            hints: ["Run az login."],
        });
    });

    it("takes the first non-empty line as headline", () => {
        expect(splitHints("\n  \n  Headline.  \n   Hint.")).toEqual({ headline: "Headline.", hints: ["Hint."] });
    });

    it.each([
        ["lines without the indent", "Headline.\nfirst reason\nsecond reason"],
        ["lines with another indent", "Headline.\n    first reason\n\tsecond reason"],
        ["an indented line among others", "Headline.\nfirst reason\n   second reason"],
    ])("has no hints for %s, as Hush! didn't write them", (_, message) => {
        expect(splitHints(message)).toEqual({ headline: "Headline.", hints: [] });
    });

    it("has an empty headline for an empty message", () => {
        expect(splitHints(" \n ")).toEqual({ headline: "", hints: [] });
    });
});

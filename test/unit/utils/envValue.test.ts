import { describe, it, expect } from 'vitest'
import { quoteValue, unquoteValue } from "../../../src/utils/envValue";

describe("envValue", () => {
    it("wraps plain values in double quotes", () => {
        expect(quoteValue("WORLD")).toBe('"WORLD"');
    });

    it("wraps values containing double quotes in single quotes", () => {
        expect(quoteValue('{"ST19":"<ID1>"}')).toBe('\'{"ST19":"<ID1>"}\'');
    });

    it("leaves unwrapped values untouched apart from surrounding whitespace", () => {
        expect(unquoteValue(' {"a":1} \r')).toBe('{"a":1}');
        expect(unquoteValue('"abc')).toBe('"abc');
    });

    it.each([
        ["plain", "WORLD"],
        ["JSON", '{"ST19":"<ID1>","ST07":"<ID2>"}'],
        ["single quotes", "it's"],
        ["both quote types", `{"msg":"it's"}`],
        ["equals signs", "CXRGxO=o9%secret"],
        ["backslashes", "C:\\tools\\"],
        ["empty", ""],
    ])("round-trips a value with %s", (_, value) => {
        expect(unquoteValue(quoteValue(value))).toBe(value);
    });
});

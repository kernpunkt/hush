import { describe, it, expect } from 'vitest'
import dotenv from "dotenv";
import { quoteValue, unquoteValue } from "../../../src/utils/envValue";

const ROUND_TRIP_VALUES = [
    ["plain", "WORLD"],
    ["JSON", '{"ST19":"<ID1>","ST07":"<ID2>"}'],
    ["single quotes", "it's"],
    ["both quote types", `{"msg":"it's"}`],
    ["equals signs", "CXRGxO=o9%secret"],
    ["backslashes", "C:\\tools\\"],
    ["empty", ""],
];

describe("envValue", () => {
    it("wraps plain values in double quotes", () => {
        expect(quoteValue("WORLD")).toBe('"WORLD"');
    });

    it("wraps values containing double quotes in single quotes", () => {
        expect(quoteValue('{"ST19":"<ID1>"}')).toBe('\'{"ST19":"<ID1>"}\'');
    });

    it("wraps values containing both quote types in double quotes, unescaped", () => {
        expect(quoteValue(`{"msg":"it's"}`)).toBe(`"{"msg":"it's"}"`);
    });

    it("keeps whitespace inside the wrapping quotes", () => {
        expect(unquoteValue(' "  abc  " ')).toBe("  abc  ");
        expect(unquoteValue("'  abc  '")).toBe("  abc  ");
    });

    it("leaves unwrapped values untouched apart from surrounding whitespace", () => {
        expect(unquoteValue(' {"a":1} \r')).toBe('{"a":1}');
        expect(unquoteValue('"abc')).toBe('"abc');
    });

    it.each(ROUND_TRIP_VALUES)("round-trips a value with %s", (_, value) => {
        expect(unquoteValue(quoteValue(value))).toBe(value);
    });

    it.each(ROUND_TRIP_VALUES)("writes a value with %s so dotenv reads it unchanged", (_, value) => {
        expect(dotenv.parse(`KEY=${quoteValue(value)}\n`).KEY).toBe(value);
    });
});

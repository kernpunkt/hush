import { describe, it, expect } from "vitest";
import stringWidth from "string-width";
import chalkTable, { stripAnsi } from "../../../src/utils/ChalkTable";

const columns = [
    { field: "name", name: "Name" },
    { field: "count", name: "Count" },
];
const rows = [{ name: "hush-example", count: "2" }];

describe("chalkTable", () => {
    it("draws no title row without a title", () => {
        const table = stripAnsi(chalkTable({ columns: structuredClone(columns) }, rows));
        expect(table.split("\n")).toEqual([
            "+--------------+-------+",
            "| Name         | Count |",
            "+--------------+-------+",
            "| hush-example | 2     |",
            "+--------------+-------+",
        ]);
    });

    it("draws the title as the first row, as wide as the table", () => {
        const table = stripAnsi(chalkTable({ title: "Backend: main", columns: structuredClone(columns) }, rows));
        expect(table.split("\n")).toEqual([
            "+----------------------+",
            "| Backend: main        |",
            "+--------------+-------+",
            "| Name         | Count |",
            "+--------------+-------+",
            "| hush-example | 2     |",
            "+--------------+-------+",
        ]);
    });

    it("widens the last column for a title wider than the table", () => {
        const title = "Backend: a-rather-long-example-name";
        const lines = stripAnsi(chalkTable({ title, columns: structuredClone(columns) }, rows)).split("\n");
        expect(lines[1]).toBe(`| ${title} |`);
        expect(new Set(lines.map((line) => line.length))).toEqual(new Set([title.length + 4]));
        expect(lines[2]).toBe("+--------------+----------------------+");
    });

    it.each([
        ["an emoji", "Backend: prod-🇪🇺"],
        ["wide characters", "Backend: 本番"],
    ])("measures a title with %s in terminal columns", (_, title) => {
        const lines = stripAnsi(chalkTable({ title, columns: structuredClone(columns) }, rows)).split("\n");
        expect(lines[1]).toBe(`| ${title}${" ".repeat(20 - stringWidth(title))} |`);
        expect(new Set(lines.map((line) => stringWidth(line)))).toEqual(new Set([24]));
    });

    it("widens the last column for a title with wide characters", () => {
        const title = "Backend: 本番本番本番本番本番本番";
        const lines = stripAnsi(chalkTable({ title, columns: structuredClone(columns) }, rows)).split("\n");
        expect(lines[1]).toBe(`| ${title} |`);
        expect(new Set(lines.map((line) => stringWidth(line)))).toEqual(new Set([stringWidth(title) + 4]));
    });
});

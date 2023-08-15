import chalk from "chalk";

/**
 * This file is a crutch to implement the node package "chalk-table", since it's not properly importable in Typescript.
 *
 * @see https://www.npmjs.com/package/chalk-table
 * @see https://www.npmjs.com/package/strip-ansi
 */
function stripAnsiRegex(onlyFirst = false) {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
  ].join("|");

  return new RegExp(pattern, onlyFirst ? undefined : "g");
}

function stripAnsi(input: string) {
  if (typeof input !== "string") {
    console.log(input);
    throw new TypeError(`Expected a \`string\`, got \`${typeof input}\``);
  }
  const regex = stripAnsiRegex();
  return input.replace(regex, "");
}

function chalkTable(options: any, data: any) {
  const pad = (text: string, length: number) => {
    if (typeof text === "undefined") {
      text = "";
    }

    return (
      "" +
      text +
      new Array(Math.max(length - stripAnsi("" + text).length + 1, 0)).join(" ")
    );
  };

  if (typeof options === "object" && Array.isArray(options)) {
    const tmp = data;
    data = options;
    options = tmp;
  }

  if (!options) {
    options = {};
  }

  if (!options.intersectionCharacter) {
    options.intersectionCharacter = "+";
  }

  let columns: any;
  if (options.columns) {
    columns = options.columns;
  } else {
    columns = [];
    data.forEach((e: any) =>
      Object.keys(e)
        .filter((k) => {
          return columns.indexOf(k) === -1;
        })
        .forEach((k) => {
          columns.push(k);
        })
    );
  }

  columns = columns.map((e: any) => {
    if (typeof e === "string") {
      e = {
        name: e,
        field: e,
      };
    }

    e.name = chalk.bold(e.name);
    e.width = stripAnsi(e.name).length;

    return e;
  });

  data.forEach((e: any) =>
    columns.forEach((column: any) => {
      if (typeof e[column.field] === "undefined") {
        return;
      }

      column.width = Math.max(
        column.width,
        ("" + stripAnsi(e[column.field])).length
      );
    })
  );

  const output = [];

  const separator = [""]
    .concat(columns.map((e: any) => new Array(e.width + 1).join("-")))
    .concat([""])
    .join("-" + options.intersectionCharacter + "-");

  output.push(separator);
  output.push(
    [""]
      .concat(columns.map((e: any) => pad(e.name, e.width)))
      .concat([""])
      .join(" | ")
  );
  output.push(separator);
  data.forEach((row: any) => {
    output.push(
      [""]
        .concat(
          columns.map((column: any) => pad(row[column.field], column.width))
        )
        .concat([""])
        .join(" | ")
    );
  });
  output.push(separator);

  const leftPad = " ".repeat(options.leftPad) || "";

  return (
    leftPad +
    output
      .map((e: any) => e.replace(/^[ -]/, "").replace(/[ -]$/, ""))
      .join("\n" + leftPad)
  );
}
export default chalkTable;

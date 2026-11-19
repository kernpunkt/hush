import path from "path";
import { existsSync, readFileSync } from "fs";
import chalk from "chalk";
import {
  BACKEND_TYPES,
  BackendSettings,
  isBackendType,
} from "../backends/backendTypes.js";

/** The project setting, in the working directory next to .hushrc.json. */
export const PROJECT_CONFIG_FILE = "hush.config.json";

/**
 * Which backends a project uses and which one holds which key. A key is the
 * name of an entry without the "hush-" prefix.
 */
export type ProjectConfig = {
  /** The project's backends by name. */
  backends: Record<string, BackendSettings>;
  /** The name of the backend for every key not listed in `keys`. */
  default: string;
  /** Keys that use another backend than the default, key → backend name. */
  keys?: Record<string, string>;
};

const TOP_LEVEL_FIELDS = ["backends", "default", "keys"];

/**
 * The project setting can't be used. The message names the file and, where
 * there is one, the field.
 */
export class ProjectConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectConfigError";
  }
}

const fail = (message: string, field?: string): never => {
  const where = field
    ? `${PROJECT_CONFIG_FILE}, field ${chalk.bold(field)}`
    : PROJECT_CONFIG_FILE;
  throw new ProjectConfigError(`${where}: ${message}`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const has = (object: object, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, field);

/** Fails on the first field of `object` that isn't in `allowed`. */
const rejectUnknownFields = (
  object: Record<string, unknown>,
  allowed: readonly string[],
  at?: string
): void => {
  const unknown = Object.keys(object).find((field) => !allowed.includes(field));
  if (unknown !== undefined) {
    fail("this field doesn't exist here.", at ? `${at}.${unknown}` : unknown);
  }
};

const checkBackend = (name: string, value: unknown): BackendSettings => {
  const at = `backends.${name}`;
  if (!isObject(value)) {
    return fail("must be an object.", at);
  }
  if (!has(value, "type")) {
    return fail("is missing.", `${at}.type`);
  }
  const type = value.type;
  if (!isBackendType(type)) {
    return fail(
      `unknown type ${JSON.stringify(type)}. Known types: ${Object.keys(
        BACKEND_TYPES
      ).join(", ")}.`,
      `${at}.type`
    );
  }

  const { required, optional } = BACKEND_TYPES[type];
  rejectUnknownFields(value, ["type", ...required, ...optional], at);
  for (const field of required) {
    if (!has(value, field)) {
      fail("is missing.", `${at}.${field}`);
    }
  }
  for (const field of [...required, ...optional]) {
    if (
      has(value, field) &&
      (typeof value[field] !== "string" || value[field] === "")
    ) {
      fail("must be a non-empty string.", `${at}.${field}`);
    }
  }
  return value as BackendSettings;
};

const checkBackendName = (
  value: unknown,
  backends: Record<string, BackendSettings>,
  field: string
): string => {
  if (typeof value !== "string") {
    return fail("must be the name of a backend.", field);
  }
  if (!has(backends, value)) {
    return fail(
      `names the backend ${JSON.stringify(value)}, which is not in backends.`,
      field
    );
  }
  return value;
};

/**
 * Checks the parsed content of the project setting. Throws a
 * ProjectConfigError on the first problem.
 */
export function parseProjectConfig(content: unknown): ProjectConfig {
  if (!isObject(content)) {
    return fail("must contain a JSON object.");
  }
  rejectUnknownFields(content, TOP_LEVEL_FIELDS);

  if (!has(content, "backends")) {
    return fail("is missing.", "backends");
  }
  if (!isObject(content.backends)) {
    return fail("must be an object of backends by name.", "backends");
  }
  // fromEntries keeps a name like "__proto__" an ordinary field.
  const backends: Record<string, BackendSettings> = Object.fromEntries(
    Object.entries(content.backends).map(([name, value]) => [
      name,
      checkBackend(name, value),
    ])
  );

  if (!has(content, "default")) {
    return fail("is missing.", "default");
  }
  const config: ProjectConfig = {
    backends,
    default: checkBackendName(content.default, backends, "default"),
  };

  if (has(content, "keys")) {
    if (!isObject(content.keys)) {
      return fail("must be an object of backend names by key.", "keys");
    }
    config.keys = Object.fromEntries(
      Object.entries(content.keys).map(([key, value]) => [
        key,
        checkBackendName(value, backends, `keys.${key}`),
      ])
    );
  }

  return config;
}

/**
 * Reads the project setting from the working directory. Resolves to
 * undefined if there is none: then the default backend applies (BR-04).
 */
export function loadProjectConfig(): ProjectConfig | undefined {
  const file = path.resolve(PROJECT_CONFIG_FILE);
  if (!existsSync(file)) {
    return undefined;
  }

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`can't be read: ${reason}`);
  }

  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`is not valid JSON: ${reason}`);
  }

  return parseProjectConfig(content);
}

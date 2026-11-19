import SecretBackend from "./SecretBackend.js";
import { createBackend } from "./backendTypes.js";
import defaultBackend from "./defaultBackend.js";
import { ProjectConfig } from "../config/ProjectConfig.js";

/** A backend with the name the project setting gives it. */
export type NamedBackend = {
  name: string;
  backend: SecretBackend;
};

/**
 * The backends of a project and which one holds which key: the one the
 * project setting names for the key, otherwise its default backend. Every
 * key belongs to exactly one backend.
 */
class ProjectBackends {
  private readonly byName: Map<string, SecretBackend>;

  constructor(
    backends: NamedBackend[],
    private readonly defaultName: string,
    private readonly keys: Record<string, string> = {}
  ) {
    this.byName = new Map(backends.map(({ name, backend }) => [name, backend]));
    // The project setting is checked before; this guards other callers.
    for (const name of [defaultName, ...Object.values(keys)]) {
      if (!this.byName.has(name)) {
        throw new Error(`Unknown backend ${name}.`);
      }
    }
  }

  /** One backend per name in the project setting. */
  public static fromConfig(config: ProjectConfig): ProjectBackends {
    return new ProjectBackends(
      Object.entries(config.backends).map(([name, settings]) => ({
        name,
        backend: createBackend(settings),
      })),
      config.default,
      config.keys
    );
  }

  /**
   * Without a project setting: the AWS backend in eu-central-1 with the
   * profile from AWS_PROFILE, as in 4.1.0 (BR-04).
   */
  public static fromDefault(): ProjectBackends {
    return ProjectBackends.single(defaultBackend());
  }

  /** One backend for every key. */
  public static single(backend: SecretBackend): ProjectBackends {
    return new ProjectBackends([{ name: "default", backend }], "default");
  }

  /** The backend that holds the key (the name without the "hush-" prefix). */
  public forKey(key: string): SecretBackend {
    const name = Object.prototype.hasOwnProperty.call(this.keys, key)
      ? this.keys[key]
      : this.defaultName;
    return this.byName.get(name)!;
  }

  /** All backends with their names, in the order of the project setting. */
  public all(): NamedBackend[] {
    return [...this.byName].map(([name, backend]) => ({ name, backend }));
  }
}

export default ProjectBackends;

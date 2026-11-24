import SecretBackend from "../backends/SecretBackend.js";
import defaultBackend from "../backends/defaultBackend.js";

abstract class BaseCommand {
  protected key: string;
  protected prefix: string;
  protected backend: SecretBackend;

  constructor() {
    this.prefix = "hush";
    this.backend = defaultBackend();
  }

  public setPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  public setBackend(backend: SecretBackend): this {
    this.backend = backend;
    return this;
  }

  protected getKey(): string {
    return `${this.prefix}-${this.key}`;
  }

  /**
   * The error for grant and revoke when the backend can't manage access.
   * One line, with the backend's name and its hint.
   */
  protected accessNotSupportedError(): Error {
    return new Error(
      `${this.backend.displayName} doesn't support granting or revoking access through Hush!. ${this.backend.accessHint()}`
    );
  }

  public abstract execute(): void;
}

export default BaseCommand;

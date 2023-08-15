abstract class BaseCommand {
  protected key: string;
  protected prefix: string;

  constructor() {
    this.prefix = "hush";
  }

  public setPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  protected getKey(): string {
    return `${this.prefix}-${this.key}`;
  }

  public abstract execute(): void;
}

export default BaseCommand;

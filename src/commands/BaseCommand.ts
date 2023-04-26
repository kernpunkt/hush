abstract class BaseCommand {
  protected key: string;

  protected getKey(): string {
    return `hush-${this.key}`;
  }

  public abstract execute(): void;
}

export default BaseCommand;

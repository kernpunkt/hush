import SecretBackend, {
    DeleteOptions,
    DeleteResult,
    WriteResult,
} from "../../src/backends/SecretBackend";
import { BackendError, BackendErrorKind } from "../../src/backends/BackendError";

type Operation = "read" | "write" | "listNames" | "delete";

type Entry = {
    /** undefined: the entry exists but holds no text value. */
    value: string | undefined;
    deletionDate?: Date;
};

type Call = { operation: Operation; name?: string };

const RECOVERY_WINDOW_DAYS = 30;

/**
 * A backend that keeps its entries in memory. Only for tests: it is not a
 * backend type users can choose.
 *
 * It can't manage access, so it has no grantAccess/revokeAccess. Use
 * `failOn` to make an operation fail with a given error kind.
 */
class InMemoryBackend implements SecretBackend {
    public readonly displayName = "In-memory test backend";

    /** Every call, in order, to check whether the backend was used at all. */
    public readonly calls: Call[] = [];

    private entries = new Map<string, Entry>();
    private failures = new Map<string, BackendError>();

    /** Stores an entry directly, e.g. one with an unreadable value. */
    public seed(name: string, value: string | undefined): this {
        this.entries.set(name, { value });
        return this;
    }

    /**
     * Makes an operation fail with the given kind, for one name or for all.
     */
    public failOn(
        operation: Operation,
        kind: BackendErrorKind,
        options: { name?: string; message?: string } = {}
    ): this {
        const message = options.message ?? `The test backend failed (${kind}).`;
        this.failures.set(
            InMemoryBackend.failureKey(operation, options.name),
            new BackendError(kind, message)
        );
        return this;
    }

    public async read(name: string): Promise<string | undefined> {
        this.record("read", name);
        return this.existing(name).value;
    }

    public async write(name: string, value: string): Promise<WriteResult> {
        this.record("write", name);
        const entry = this.entries.get(name);
        if (entry?.deletionDate) {
            throw InMemoryBackend.softDeleted(name);
        }
        this.entries.set(name, { value });
        return entry ? "updated" : "created";
    }

    public async listNames(prefix: string): Promise<string[]> {
        this.record("listNames");
        return [...this.entries.entries()]
            .filter(([name, entry]) => !entry.deletionDate && name.startsWith(prefix))
            .map(([name]) => name);
    }

    public async delete(name: string, options: DeleteOptions = {}): Promise<DeleteResult> {
        this.record("delete", name);
        const entry = this.entries.get(name);
        if (!entry) {
            throw InMemoryBackend.notFound(name);
        }
        if (options.force) {
            this.entries.delete(name);
            return {};
        }
        if (entry.deletionDate) {
            throw InMemoryBackend.softDeleted(name);
        }
        const deletionDate = new Date(Date.now() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        entry.deletionDate = deletionDate;
        return { deletionDate };
    }

    public accessHint(): string {
        return "Access to the test backend is managed outside of Hush!.";
    }

    private record(operation: Operation, name?: string): void {
        this.calls.push({ operation, name });
        const failure =
            (name !== undefined && this.failures.get(InMemoryBackend.failureKey(operation, name))) ||
            this.failures.get(InMemoryBackend.failureKey(operation));
        if (failure) {
            throw failure;
        }
    }

    private existing(name: string): Entry {
        const entry = this.entries.get(name);
        if (!entry) {
            throw InMemoryBackend.notFound(name);
        }
        if (entry.deletionDate) {
            throw InMemoryBackend.softDeleted(name);
        }
        return entry;
    }

    private static failureKey(operation: Operation, name?: string): string {
        return `${operation}:${name ?? "*"}`;
    }

    private static notFound(name: string): BackendError {
        return new BackendError("notFound", `The test backend has no entry ${name}.`);
    }

    private static softDeleted(name: string): BackendError {
        return new BackendError("softDeleted", `The entry ${name} is scheduled for deletion.`);
    }
}

export default InMemoryBackend;

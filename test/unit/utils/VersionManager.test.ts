import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import VersionManager from "../../../src/utils/VersionManager";
import GetSecretValueRequest from "../../../src/requests/GetSecretValueRequest";
import SecretPayloadManager from "../../../src/utils/SecretPayloadManager";

// Mock console methods to prevent output during tests
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock the fs module
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Get mocked fs functions
import { readFileSync, writeFileSync, existsSync } from "fs";
const readFileSyncMock = readFileSync as any;
const writeFileSyncMock = writeFileSync as any;
const existsSyncMock = existsSync as any;

// Mock GetSecretValueRequest and SecretPayloadManager
const getSecretValueSpy = vi.spyOn(GetSecretValueRequest.prototype, "execute");
const fromSecretStringSpy = vi.spyOn(SecretPayloadManager.prototype, "fromSecretString");

describe("VersionManager", () => {
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    // Reset all mocks after each test
    readFileSyncMock.mockReset();
    existsSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    getSecretValueSpy.mockReset();
    fromSecretStringSpy.mockReset();
  });

  describe("checkVersion", () => {
    it("should return false and warn when remote version is greater than local version", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(true);
      const hushrcContent = JSON.stringify({
        "hush-hello-world": { version: 0 },
      });
      readFileSyncMock.mockReturnValueOnce(hushrcContent);

      const result = versionManager.checkVersion("hush-hello-world", 2);

      expect(result).toBe(false);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

      const warnCalls = consoleWarnSpy.mock.calls;
      expect(warnCalls[0][0]).toMatch(
        /⚠️ Warning: Remote version \(2\) is greater than your local version \(0\) for key/
      );
      expect(warnCalls[1][0]).toMatch(
        /⚠️ +Use "hush pull" to pull the latest version for key/
      );

      expect(warnCalls[0][0]).toContain("hush-hello-world");
      expect(warnCalls[1][0]).toContain("hush-hello-world");

      consoleWarnSpy.mockRestore();
    });

    it("should return true when local version matches remote version", () => {
      existsSyncMock.mockReturnValueOnce(true);
      const hushrcContent = JSON.stringify({
        "hush-hello-world": { version: 1 },
      });
      readFileSyncMock.mockReturnValueOnce(hushrcContent);

      const result = versionManager.checkVersion("hush-hello-world", 1);

      expect(result).toBe(true);
    });

    it("should return false and warn when .hushrc.json file does not exist", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock that .hushrc.json doesn't exist
      existsSyncMock.mockReturnValueOnce(false);

      const result = versionManager.checkVersion("hush-hello-world", 1);

      expect(result).toBe(false);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '⚠️ Warning: No .hushrc.json file exists, please run "hush pull" to create it or use --force to bypass version checking'
        )
      );

      consoleWarnSpy.mockRestore();
    });

    it("should return false and log error when reading .hushrc.json file fails", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(true);
      // Mock readFileSync to throw an error
      readFileSyncMock.mockImplementationOnce(() => {
        throw new Error("Permission denied");
      });

      const result = versionManager.checkVersion("hush-hello-world", 1);

      expect(result).toBe(false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "⚠️ Error: Could not read .hushrc.json file: Error: Permission denied"
        )
      );

      consoleErrorSpy.mockRestore();
    });

    it("should return false when key is undefined in .hushrc.json", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(true);
      const hushrcContent = JSON.stringify({
        "different-key": { version: 1 },
      });
      readFileSyncMock.mockReturnValueOnce(hushrcContent);

      const result = versionManager.checkVersion("hush-hello-world", 2);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

      consoleWarnSpy.mockRestore();
    });
  });

  describe("updateVersionsFile", () => {
    it("should create new .hushrc.json file when it doesn't exist", () => {
      existsSyncMock.mockReturnValueOnce(false);
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.updateVersionsFile("hush-hello-world", 1);

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(writtenContent["hush-hello-world"].version).toBe(1);
      }
    });

    it("should update existing .hushrc.json file with new version", () => {
      const existingContent = JSON.stringify({
        "existing-key": { version: 5 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.updateVersionsFile("hush-hello-world", 2);

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(writtenContent["hush-hello-world"].version).toBe(2);
        expect(writtenContent["existing-key"].version).toBe(5);
      }
    });

    it("should handle corrupted .hushrc.json file and start with empty object", () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockImplementationOnce(() => {
        throw new Error("Corrupted file");
      });
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.updateVersionsFile("hush-hello-world", 1);

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(writtenContent["hush-hello-world"].version).toBe(1);
        expect(Object.keys(writtenContent).length).toBe(1);
      }
    });

    it("should warn when writing to .hushrc.json fails", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(false);
      writeFileSyncMock.mockImplementationOnce(() => {
        throw new Error("No space left on device");
      });

      versionManager.updateVersionsFile("hush-hello-world", 1);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "⚠️  Warning: Could not update .hushrc.json: Error: No space left on device"
        )
      );

      consoleWarnSpy.mockRestore();
    });

    it("should update version for existing key", () => {
      const existingContent = JSON.stringify({
        "hush-hello-world": { version: 1 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.updateVersionsFile("hush-hello-world", 2);

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(writtenContent["hush-hello-world"].version).toBe(2);
        expect(Object.keys(writtenContent).length).toBe(1);
      }
    });
  });

  describe("getSecretVersion", () => {
    it("should return the version from AWS Secrets Manager", async () => {
      getSecretValueSpy.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          version: 5,
          secrets: [],
          message: "Test",
          updated_at: new Date(),
        }),
        $metadata: {},
      });

      fromSecretStringSpy.mockReturnValueOnce({
        version: 5,
        secrets: [],
        message: "Test",
        updated_at: new Date(),
      });

      const result = await versionManager.getSecretVersion("test-secret");

      expect(result).toBe(5);
      expect(getSecretValueSpy).toHaveBeenCalledWith("test-secret");
    });

    it("should return 0 when secret has no version", async () => {
      getSecretValueSpy.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          secrets: [],
          message: "Test",
          updated_at: new Date(),
        }),
        $metadata: {},
      });

      fromSecretStringSpy.mockReturnValueOnce({
        secrets: [],
        message: "Test",
        updated_at: new Date(),
      } as any);

      const result = await versionManager.getSecretVersion("test-secret");

      expect(result).toBe(0);
    });

    it("should return -1 when secret doesn't exist", async () => {
      getSecretValueSpy.mockRejectedValueOnce(
        new Error("ResourceNotFoundException")
      );

      const result = await versionManager.getSecretVersion("non-existent-secret");

      expect(result).toBe(-1);
    });

    it("should return -1 when AWS request fails", async () => {
      getSecretValueSpy.mockRejectedValueOnce(new Error("Network error"));

      const result = await versionManager.getSecretVersion("test-secret");

      expect(result).toBe(-1);
    });

    it("should handle empty SecretString", async () => {
      getSecretValueSpy.mockResolvedValueOnce({
        SecretString: undefined,
        $metadata: {},
      });

      fromSecretStringSpy.mockReturnValueOnce({
        secrets: [],
        message: "",
        updated_at: new Date(),
      } as any);

      const result = await versionManager.getSecretVersion("test-secret");

      expect(result).toBe(0);
      expect(fromSecretStringSpy).toHaveBeenCalledWith("{}");
    });
  });

  describe("removeVersionFromFile", () => {
    it("should remove version entry from .hushrc.json", () => {
      const existingContent = JSON.stringify({
        "hush-hello-world": { version: 1 },
        "another-secret": { version: 2 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(writtenContent["hush-hello-world"]).toBeUndefined();
        expect(writtenContent["another-secret"].version).toBe(2);
      }
    });

    it("should warn when .hushrc.json file does not exist", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(false);

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '⚠️  Warning: .hushrc.json file does not exist, no version to remove for key "hush-hello-world"'
        )
      );
      expect(writeFileSyncMock).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should warn when key is not found in .hushrc.json", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const existingContent = JSON.stringify({
        "different-key": { version: 1 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '⚠️  Warning: No version entry found for key "hush-hello-world" in .hushrc.json'
        )
      );
      expect(writeFileSyncMock).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should warn when reading .hushrc.json fails", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockImplementationOnce(() => {
        throw new Error("Read error");
      });

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "⚠️  Warning: Could not update .hushrc.json file: Error: Read error"
        )
      );
      expect(writeFileSyncMock).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should warn when writing .hushrc.json fails", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const existingContent = JSON.stringify({
        "hush-hello-world": { version: 1 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);
      writeFileSyncMock.mockImplementationOnce(() => {
        throw new Error("Write error");
      });

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "⚠️  Warning: Could not update .hushrc.json file: Error: Write error"
        )
      );

      consoleWarnSpy.mockRestore();
    });

    it("should handle removing last key from .hushrc.json", () => {
      const existingContent = JSON.stringify({
        "hush-hello-world": { version: 1 },
      });

      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(existingContent);
      writeFileSyncMock.mockImplementationOnce(() => {});

      versionManager.removeVersionFromFile("hush-hello-world");

      expect(writeFileSyncMock).toHaveBeenCalled();
      const writeCall = writeFileSyncMock.mock.calls.find((call) =>
        call[0].toString().includes(".hushrc.json")
      );
      expect(writeCall).toBeDefined();

      if (writeCall) {
        const writtenContent = JSON.parse(writeCall[1] as string);
        expect(Object.keys(writtenContent).length).toBe(0);
      }
    });
  });
});


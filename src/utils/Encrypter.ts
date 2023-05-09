import crypto from "crypto";

/**
 * This class uses AES from the Crypto JS library (and PBKDF2 as key) to encrypt and decrypt a string, given a password.
 */
class Encrypter {
  private salt: string;
  constructor() {
    this.salt = process.env["HUSH_SALT"] || "hush-salt";
  }

  public encrypt(input: string, password: string): string {
    const iv = crypto.randomBytes(16);
    // Use createCipherIV to encrypt secret
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      crypto.pbkdf2Sync(password, this.salt, 1000, 32, "sha512"),
      iv
    );

    return (
      iv.toString("hex") +
      ":" +
      cipher.update(input, "utf8", "hex") +
      cipher.final("hex")
    );
  }

  public decrypt(input: string, password: string): string {
    const [ivRaw, secret] = input.split(":");
    const iv = Buffer.from(ivRaw, "hex");

    // Use createDecipherIV to decrypt secret
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      crypto.pbkdf2Sync(password, this.salt, 1000, 32, "sha512"),
      iv
    );
    return decipher.update(secret, "hex", "utf8") + decipher.final("utf8");
  }
}

export default Encrypter;

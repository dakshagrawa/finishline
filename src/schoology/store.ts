import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface StoredRequestToken {
  token: string;
  tokenSecret: string;
  state: string;
  expiresAt: number;
}

export interface StoredAccessToken {
  token: string;
  tokenSecret: string;
  userId: string;
  expiresAt: number;
}

interface SessionRecord {
  requestToken?: StoredRequestToken;
  accessToken?: StoredAccessToken;
}

interface StoreData {
  version: 1;
  sessions: Record<string, SessionRecord>;
}

interface Envelope {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function emptyStore(): StoreData {
  return { version: 1, sessions: {} };
}

function digestSession(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export class EncryptedSchoologyStore {
  constructor(
    private readonly path: string,
    private readonly encryptionKey: Buffer,
  ) {
    if (encryptionKey.length !== 32) throw new Error("Schoology store encryption key must be 32 bytes.");
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.path}.lock`;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    for (let attempt = 0; ; attempt += 1) {
      try {
        await mkdir(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 200) {
          throw new Error("Schoology authorization storage is unavailable.");
        }
        try {
          const lock = await stat(lockPath);
          if (Date.now() - lock.mtimeMs > 30_000) {
            await rmdir(lockPath);
            continue;
          }
        } catch (lockError) {
          if ((lockError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw new Error("Schoology authorization storage is unavailable.");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    try {
      return await operation();
    } finally {
      await rmdir(lockPath).catch(() => undefined);
    }
  }

  private encrypt(data: StoreData): Envelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
    return {
      version: 1,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  private decrypt(envelope: Envelope): StoreData {
    try {
      if (envelope.version !== 1) throw new Error("version");
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(plaintext) as StoreData;
      if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== "object") throw new Error("shape");
      return parsed;
    } catch {
      throw new Error("Schoology authorization storage is unavailable.");
    }
  }

  private async read(): Promise<StoreData> {
    try {
      const raw = await readFile(this.path, "utf8");
      return this.decrypt(JSON.parse(raw) as Envelope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
      if (error instanceof Error && error.message === "Schoology authorization storage is unavailable.") throw error;
      throw new Error("Schoology authorization storage is unavailable.");
    }
  }

  private async write(data: StoreData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(this.encrypt(data)), { mode: 0o600, flag: "wx" });
    await rename(temporaryPath, this.path);
    await chmod(this.path, 0o600);
  }

  private pruneExpired(data: StoreData, now: number): boolean {
    let changed = false;
    for (const [digest, record] of Object.entries(data.sessions)) {
      let recordExpired = false;
      if (record.requestToken && record.requestToken.expiresAt <= now) {
        delete record.requestToken;
        changed = true;
        recordExpired = true;
      }
      if (record.accessToken && record.accessToken.expiresAt <= now) {
        delete record.accessToken;
        changed = true;
        recordExpired = true;
      }
      if (recordExpired && !record.requestToken && !record.accessToken) {
        delete data.sessions[digest];
      }
    }
    return changed;
  }

  async pruneExpiredRecords(now: number): Promise<void> {
    await this.exclusive(async () => {
      const data = await this.read();
      if (this.pruneExpired(data, now)) await this.write(data);
    });
  }

  async createSession(now = Date.now()): Promise<string> {
    return this.exclusive(async () => {
      const data = await this.read();
      this.pruneExpired(data, now);
      let sessionId: string;
      let digest: string;
      do {
        sessionId = randomBytes(32).toString("base64url");
        digest = digestSession(sessionId);
      } while (data.sessions[digest]);
      data.sessions[digest] = {};
      await this.write(data);
      return sessionId;
    });
  }

  async saveRequestToken(sessionId: string, token: StoredRequestToken): Promise<void> {
    await this.exclusive(async () => {
      const data = await this.read();
      const digest = digestSession(sessionId);
      if (!data.sessions[digest]) throw new Error("Schoology session is unavailable.");
      data.sessions[digest].requestToken = { ...token };
      await this.write(data);
    });
  }

  async consumeRequestToken(
    sessionId: string,
    expected: { token: string; state: string; now: number },
  ): Promise<StoredRequestToken | null> {
    return this.exclusive(async () => {
      const data = await this.read();
      const record = data.sessions[digestSession(sessionId)];
      const token = record?.requestToken;
      if (!token) return null;
      if (token.expiresAt <= expected.now) {
        delete record.requestToken;
        await this.write(data);
        return null;
      }
      if (token.token !== expected.token || token.state !== expected.state) return null;
      delete record.requestToken;
      await this.write(data);
      return { ...token };
    });
  }

  async saveAccessToken(sessionId: string, token: StoredAccessToken): Promise<void> {
    await this.exclusive(async () => {
      const data = await this.read();
      const digest = digestSession(sessionId);
      if (!data.sessions[digest]) throw new Error("Schoology session is unavailable.");
      data.sessions[digest].accessToken = { ...token };
      await this.write(data);
    });
  }

  async getAccessToken(sessionId: string, now: number): Promise<StoredAccessToken | null> {
    return this.exclusive(async () => {
      const data = await this.read();
      const record = data.sessions[digestSession(sessionId)];
      const token = record?.accessToken;
      if (!token) return null;
      if (token.expiresAt <= now) {
        delete record.accessToken;
        await this.write(data);
        return null;
      }
      return { ...token };
    });
  }

  async invalidateAccessTokenIfMatches(sessionId: string, expected: StoredAccessToken): Promise<boolean> {
    return this.exclusive(async () => {
      const data = await this.read();
      const digest = digestSession(sessionId);
      const current = data.sessions[digest]?.accessToken;
      if (!current || current.token !== expected.token || current.tokenSecret !== expected.tokenSecret ||
          current.userId !== expected.userId || current.expiresAt !== expected.expiresAt) return false;
      delete data.sessions[digest];
      await this.write(data);
      return true;
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.exclusive(async () => {
      const data = await this.read();
      delete data.sessions[digestSession(sessionId)];
      await this.write(data);
    });
  }
}

import type { PrivateReviewProvider } from "./private-review-storage";

/** Durable Vercel Blob adapter for the isolated private quarantine store. */
export class VercelPrivateReviewProvider implements PrivateReviewProvider {
  constructor(private readonly token: string = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN ?? "") {
    if (!token) throw new Error("Private review Blob token is required");
  }
  private key(key: string): string {
    if (!/^quarantine\/[A-Za-z0-9][A-Za-z0-9/_-]{0,511}$/.test(key) || key.includes("..")) throw new Error("Invalid quarantine object key");
    return key;
  }
  private async client() {
    // Keep the import dynamic so the provider remains lazy; build-vercel.sh bundles the SDK into the function.
    return await import("@vercel/blob");
  }
  async put(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { put } = await this.client();
    await put(this.key(objectKey), bytes, { access: "private", token: this.token, contentType, addRandomSuffix: false });
  }
  async get(objectKey: string): Promise<Uint8Array> {
    const { get } = await this.client();
    const result = await get(this.key(objectKey), { access: "private", token: this.token, useCache: false });
    if (!result || result.statusCode !== 200) throw new Error("Private quarantine object not found");
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }
  async delete(objectKey: string): Promise<void> {
    const { del } = await this.client();
    await del(this.key(objectKey), { token: this.token });
  }
}

export function durablePrivateReviewConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.GRADEDATE_PRIVATE_REVIEW_STORAGE === "true" && !!env.PRIVATE_BLOB_READ_WRITE_TOKEN;
}

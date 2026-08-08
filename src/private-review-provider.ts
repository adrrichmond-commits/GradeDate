import type { PrivateReviewProvider } from './private-review-storage';
/** Explicit test/development adapter. Production must inject a durable private object store. */
export class InMemoryPrivateReviewProvider implements PrivateReviewProvider {
  private objects = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array): Promise<void> { this.objects.set(key, new Uint8Array(bytes)); }
  async get(key: string): Promise<Uint8Array> { const v=this.objects.get(key); if(!v) throw new Error('Private object not found'); return new Uint8Array(v); }
  async delete(key: string): Promise<void> { this.objects.delete(key); }
}
let provider: PrivateReviewProvider | null = null;
export function configurePrivateReviewProvider(value: PrivateReviewProvider | null): void { provider = value; }
export function getPrivateReviewProvider(): PrivateReviewProvider | null { return provider; }

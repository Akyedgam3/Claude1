// تشفير كل شي بينبعت للسحابة (AES-256-GCM)، مع ربط كل وثيقة بمكانها (AAD) حتى ما تنتقل لمكان تاني.
export interface SealedDoc {
  iv: string;
  ct: string;
}

const b64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function seal(key: CryptoKey, where: string, value: unknown): Promise<SealedDoc> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // ضغط قبل التشفير: بيانات الشركة JSON بتنضغط كتير، وهيك بتوفّر مساحة Firestore
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(where) }, key, plain as BufferSource));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function unseal<T>(key: CryptoKey, where: string, doc: { iv?: string; ct?: string }): Promise<T> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(doc.iv ?? '') as BufferSource, additionalData: new TextEncoder().encode(where) }, key, unb64(doc.ct ?? '') as BufferSource);
  } catch {
    throw new Error('ما قدرنا نفك تشفير البيانات (رمز الاتصال مو مطابق)');
  }
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip')))) as T;
}

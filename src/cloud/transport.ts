// طبقة النقل: Firestore بالتطبيق (firestore.ts)، ونسخة بالذاكرة للاختبارات.
// البيانات: rooms/{room}/{coll}/{id} — الحقول مشفّرة (iv, ct) ما عدا أرقام الترتيب والوقت.
export type Coll = 'events' | 'meta' | 'req' | 'res' | 'snap';

export interface CloudDoc {
  iv?: string;
  ct?: string;
  last?: number; // آخر رقم عملية بالدفعة (events)
  epoch?: number; // جلسة الجهاز الرئيسي (meta)
  seen?: number; // آخر نبضة من الجهاز الرئيسي (meta)
  at?: number;
}

export interface CloudTransport {
  set(room: string, coll: Coll, id: string, data: CloudDoc): Promise<void>;
  get(room: string, coll: Coll, id: string): Promise<CloudDoc | null>;
  del(room: string, coll: Coll, id: string): Promise<void>;
  list(room: string, coll: Coll): Promise<string[]>;
  /** الوثائق الجديدة بالمجموعة (ومعها الموجودة بعد after)، بالترتيب حسب المعرّف. */
  watch(room: string, coll: Coll, after: string | null, cb: (docs: { id: string; data: CloudDoc }[]) => void): () => void;
  /** وثيقة وحدة (أو null إذا انحذفت). */
  watchDoc(room: string, coll: Coll, id: string, cb: (data: CloudDoc | null) => void): () => void;
}

/** نقل بالذاكرة (للاختبارات): نفس سلوك Firestore بس محلي. */
export class MemoryTransport implements CloudTransport {
  private docs = new Map<string, CloudDoc>();
  private watchers = new Set<{ room: string; coll: Coll; after: string | null; seen: Set<string>; cb: (docs: { id: string; data: CloudDoc }[]) => void }>();
  private docWatchers = new Set<{ key: string; cb: (d: CloudDoc | null) => void }>();
  writes = 0;

  private k(room: string, coll: Coll, id: string) {
    return `${room}/${coll}/${id}`;
  }

  private notify(room: string, coll: Coll, id: string): void {
    const key = this.k(room, coll, id);
    const data = this.docs.get(key) ?? null;
    queueMicrotask(() => {
      for (const w of this.docWatchers) if (w.key === key) w.cb(data ? structuredClone(data) : null);
      for (const w of this.watchers) {
        if (w.room !== room || w.coll !== coll || !data || w.seen.has(id) || (w.after !== null && id <= w.after)) continue;
        w.seen.add(id);
        w.cb([{ id, data: structuredClone(data) }]);
      }
    });
  }

  async set(room: string, coll: Coll, id: string, data: CloudDoc) {
    this.writes++;
    this.docs.set(this.k(room, coll, id), structuredClone(data));
    this.notify(room, coll, id);
  }
  async get(room: string, coll: Coll, id: string) {
    const d = this.docs.get(this.k(room, coll, id));
    return d ? structuredClone(d) : null;
  }
  async del(room: string, coll: Coll, id: string) {
    this.writes++;
    this.docs.delete(this.k(room, coll, id));
    this.notify(room, coll, id);
  }
  async list(room: string, coll: Coll) {
    const p = `${room}/${coll}/`;
    return [...this.docs.keys()].filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)).sort();
  }
  watch(room: string, coll: Coll, after: string | null, cb: (docs: { id: string; data: CloudDoc }[]) => void) {
    const w = { room, coll, after, seen: new Set<string>(), cb };
    this.watchers.add(w);
    void this.list(room, coll).then((ids) => {
      const docs = ids.filter((id) => after === null || id > after).map((id) => ({ id, data: structuredClone(this.docs.get(this.k(room, coll, id))!) }));
      docs.forEach((d) => w.seen.add(d.id));
      if (docs.length) cb(docs);
    });
    return () => void this.watchers.delete(w);
  }
  watchDoc(room: string, coll: Coll, id: string, cb: (d: CloudDoc | null) => void) {
    const w = { key: this.k(room, coll, id), cb };
    this.docWatchers.add(w);
    const d = this.docs.get(w.key);
    if (d) queueMicrotask(() => cb(structuredClone(d)));
    return () => void this.docWatchers.delete(w);
  }
}

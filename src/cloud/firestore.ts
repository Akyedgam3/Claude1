// النقل الحقيقي: Firestore (مشروع وزن على Firebase). بينحمّل بس إذا الاتصال عن بعد مفعّل.
import { getApps, initializeApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, deleteDoc, doc, documentId, getDoc, getDocs, initializeFirestore, onSnapshot, orderBy, query, setDoc, where, type Firestore } from 'firebase/firestore';
import { IS_TEST_BUILD } from '../license/public-key';
import type { CloudDoc, CloudTransport, Coll } from './transport';

// إعدادات عامة (مش سرية): الحماية بقواعد Firestore والتشفير من طرفنا
const CONFIG = {
  apiKey: 'AIzaSyADZGE5_zV-mUKBoE8LPw2PWqRT1_O4mbc',
  authDomain: 'wazn-5d0f2.firebaseapp.com',
  projectId: 'wazn-5d0f2',
  storageBucket: 'wazn-5d0f2.firebasestorage.app',
  messagingSenderId: '925225799887',
  appId: '1:925225799887:web:8bbc6d7a7ff8b75ea1e7ba',
};

let db: Firestore | null = null;

function firestore(): Firestore {
  if (db) return db;
  const app = getApps().find((a) => a.name === 'wazn-cloud') ?? initializeApp(CONFIG, 'wazn-cloud');
  // بعض الشبكات وبرامج VPN بتقطع الاتصال المستمر: منخلي Firestore يكتشف ويحوّل لـ long polling
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  // نسخة الاختبارات بس: Firestore المحلي بدل الحقيقي
  // (بالواجهة من localStorage، وبالعملية الرئيسية للكمبيوتر من متغير البيئة)
  const emu = !IS_TEST_BUILD ? null : typeof localStorage !== 'undefined' ? localStorage.getItem('wazn.cloudEmulator') : typeof process !== 'undefined' ? (process.env.WAZN_CLOUD_EMULATOR ?? null) : null;
  if (emu) connectFirestoreEmulator(db, emu.split(':')[0]!, Number(emu.split(':')[1]));
  return db;
}

/** للاختبارات بس: Firestore المحلي (firebase emulators). */
export function useFirestoreEmulator(host: string, port: number): void {
  connectFirestoreEmulator(firestore(), host, port);
}

const FIELDS = ['iv', 'ct', 'last', 'epoch', 'seen', 'at'] as const;
const clean = (d: Record<string, unknown> | undefined): CloudDoc | null => {
  if (!d) return null;
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (d[f] !== undefined) out[f] = d[f];
  return out as CloudDoc;
};

export class FirestoreTransport implements CloudTransport {
  private readonly db = firestore();

  private ref(room: string, coll: Coll, id: string) {
    return doc(this.db, 'rooms', room, coll, id);
  }

  async set(room: string, coll: Coll, id: string, data: CloudDoc) {
    await setDoc(this.ref(room, coll, id), Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
  }
  async get(room: string, coll: Coll, id: string) {
    const s = await getDoc(this.ref(room, coll, id));
    return s.exists() ? clean(s.data()) : null;
  }
  async del(room: string, coll: Coll, id: string) {
    await deleteDoc(this.ref(room, coll, id));
  }
  async list(room: string, coll: Coll) {
    const s = await getDocs(collection(this.db, 'rooms', room, coll));
    return s.docs.map((d) => d.id).sort();
  }
  watch(room: string, coll: Coll, after: string | null, cb: (docs: { id: string; data: CloudDoc }[]) => void) {
    const c = collection(this.db, 'rooms', room, coll);
    const q = after === null ? query(c, orderBy(documentId())) : query(c, where(documentId(), '>', after), orderBy(documentId()));
    const seen = new Set<string>();
    return onSnapshot(q, (s) => {
      const docs = s
        .docChanges()
        .filter((ch) => ch.type === 'added' && !seen.has(ch.doc.id))
        .map((ch) => (seen.add(ch.doc.id), { id: ch.doc.id, data: clean(ch.doc.data())! }))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      if (docs.length) cb(docs);
    });
  }
  watchDoc(room: string, coll: Coll, id: string, cb: (data: CloudDoc | null) => void) {
    return onSnapshot(this.ref(room, coll, id), (s) => cb(s.exists() ? clean(s.data()) : null));
  }
}

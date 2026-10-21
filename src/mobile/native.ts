// كل شي بيحتاج أندرويد نفسه (معرّف الجهاز، الطباعة، المشاركة، فتح الروابط) بمكان واحد.
// بالمتصفح (التجارب الآلية) في بدائل بسيطة لكل وحدة.
import { App } from '@capacitor/app';
import { BarcodeScanner, GoogleBarcodeScannerModuleInstallState } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Buffer } from 'buffer';
import { createHash } from './shims/crypto';

/** إضافة الطباعة (android/app/src/main/java/.../WaznPrintPlugin.java): بتطبع محتوى الشاشة بنظام طباعة أندرويد. */
const WaznPrint = registerPlugin<{ print(o: { name: string }): Promise<{ ok: boolean }> }>('WaznPrint');

const isNative = () => Capacitor.isNativePlatform();

export const native = {
  /** بصمة ثابتة للموبايل بنفس شكل بصمة الكمبيوتر (XXXX-XXXX-XXXX-XXXX). */
  async machineId(): Promise<string> {
    const { identifier } = await Device.getId();
    const hex = (createHash('sha256').update(`wazn-android|${identifier}`).digest('hex') as string).slice(0, 16).toUpperCase();
    return hex.match(/.{4}/g)!.join('-');
  },

  async print(name: string): Promise<boolean> {
    if (isNative()) return (await WaznPrint.print({ name })).ok;
    window.print();
    return true;
  },

  /** بيحفظ ملف ويفتح قائمة المشاركة (واتساب، درايف، الملفات...). بيرجع اسم الملف. */
  async shareFile(name: string, bytes: Uint8Array, mime: string): Promise<string | null> {
    if (isNative()) {
      const res = await Filesystem.writeFile({ path: name, data: Buffer.from(bytes).toString('base64'), directory: Directory.Cache });
      try {
        await Share.share({ title: name, files: [res.uri], dialogTitle: 'حفظ أو مشاركة الملف' });
      } catch (e) {
        // المستخدم سكّر قائمة المشاركة بدون ما يختار: مش خطأ
        if (!/cancel/i.test((e as Error).message)) throw e;
        return null;
      }
      return name;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return name;
  },

  /** اختيار ملف من الجهاز (نافذة أندرويد للملفات). null إذا تراجع المستخدم. */
  pickFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null> {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept });
      input.style.display = 'none';
      let settled = false;
      const finish = (v: { name: string; bytes: Uint8Array } | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(v);
      };
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        finish(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
      });
      input.addEventListener('cancel', () => finish(null));
      document.body.append(input);
      input.click();
    });
  },

  /**
   * قراءة باركود بالكاميرا بقارئ غوغل (ما بيحتاج إذن كاميرا، وأول مرة بينزّل حاله من خدمات غوغل).
   * null إذا سكّر المستخدم القارئ.
   */
  async scanBarcode(): Promise<string | null> {
    if (!isNative()) throw new Error('قراءة الباركود بالكاميرا على الجوال بس');
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) throw new Error('هالجوال ما بيدعم قراءة الباركود بالكاميرا');
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      // أول مرة: قارئ غوغل بينزل من خدمات Google Play (بدو إنترنت)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('تنزيل قارئ الباركود طوّل، تأكد من الإنترنت وجرّب مرة تانية')), 120_000);
        void BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (e) => {
          if (e.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
            clearTimeout(timer);
            resolve();
          } else if (e.state === GoogleBarcodeScannerModuleInstallState.FAILED || e.state === GoogleBarcodeScannerModuleInstallState.CANCELED) {
            clearTimeout(timer);
            reject(new Error('ما قدرنا ننزّل قارئ الباركود من خدمات غوغل'));
          }
        });
        BarcodeScanner.installGoogleBarcodeScannerModule().catch((e: Error) => {
          clearTimeout(timer);
          reject(e);
        });
      });
    }
    try {
      const { barcodes } = await BarcodeScanner.scan();
      return barcodes[0]?.rawValue ?? null;
    } catch (e) {
      if (/cancel/i.test((e as Error).message)) return null;
      throw e;
    }
  },

  async openUrl(url: string): Promise<void> {
    if (!/^https:\/\//.test(url)) throw new Error('رابط غير صالح');
    window.open(url, '_blank', 'noopener');
  },

  onResume(fn: () => void): void {
    if (isNative()) void App.addListener('resume', fn);
    else document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fn());
  },

  onPause(fn: () => void): void {
    if (isNative()) void App.addListener('pause', fn);
    else document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && fn());
  },
};

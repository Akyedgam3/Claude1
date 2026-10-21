// مدخل نسخة الموبايل: أول شي الـ globals، بعدين نحمّل الملفات من IndexedDB، بعدين نشغّل «العملية الرئيسية» والواجهة.
import './shims/globals';
import { mountVfs } from './shims/fs';

async function boot() {
  try {
    await mountVfs();
    const { startHost } = await import('./host');
    await startHost();
    await import('../renderer/src/main');
    const { startTableCards } = await import('../renderer/src/mobile-tables');
    startTableCards();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div style="padding:24px;font-family:sans-serif;direction:rtl"><h2>ما قدر وزن يشتغل</h2><pre style="white-space:pre-wrap">${String((e as Error)?.message ?? e)}</pre></div>`;
  }
}

void boot();

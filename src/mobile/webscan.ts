// قراءة الباركود بكاميرا الجوال من المتصفح (نسخة الويب على الآيفون، أو أي متصفح ما فيه قارئ أندرويد).
// سفاري ما فيه BarcodeDetector، فمنستعمل ZXing (بينحمّل بس لما ينفتح القارئ).
export async function scanWithCamera(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح ما بيدعم الكاميرا. افتح الموقع بسفاري أو كروم.');
  const { BrowserMultiFormatReader } = await import('@zxing/browser');

  const box = document.createElement('div');
  box.className = 'web-scan';
  box.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="web-scan-frame"><i></i></div>
    <p class="web-scan-hint">وجّه الكاميرا عالباركود</p>
    <button type="button" class="web-scan-close">إلغاء</button>`;
  document.body.append(box);
  const video = box.querySelector('video')!;

  return new Promise<string | null>((resolve, reject) => {
    let controls: { stop(): void } | null = null;
    let done = false;
    const finish = (v: string | null, err?: Error) => {
      if (done) return;
      done = true;
      controls?.stop();
      box.remove();
      if (err) reject(err);
      else resolve(v);
    };
    box.querySelector('button')!.addEventListener('click', () => finish(null));
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }, video, (result) => {
        if (result) {
          navigator.vibrate?.(60);
          finish(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop();
      })
      .catch((e: Error) => {
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        finish(null, new Error(denied ? 'اسمح لوزن يستعمل الكاميرا: إعدادات الجوال ← سفاري ← الكاميرا ← سماح، وبعدين جرّب مرة تانية.' : 'ما قدرنا نفتح الكاميرا: ' + (e?.message ?? e)));
      });
  });
}

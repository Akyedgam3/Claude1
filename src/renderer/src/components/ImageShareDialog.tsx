import { useEffect, useState } from 'react';
import { api, IS_MOBILE, useCompany } from '../api';
import type { ShareImage } from '../screens/hall-images';
import { Icon } from './icons';
import { Modal, Tabs } from './ui';

/** معاينة صورة الواتساب قبل الإرسال، مع خيارين (مع الأسعار أو بدونها). بالكمبيوتر بتنتسخ وبينفتح الواتساب، وبالجوال قائمة المشاركة. */
export function ImageShareDialog(p: {
  title: string;
  phone: string;
  fileName: string;
  caption: string;
  /** أسماء الخيارين: افتراضياً «مع الأسعار» و«بدون أسعار». */
  options?: [string, string];
  amountsDefault?: boolean;
  make: (amounts: boolean) => Promise<ShareImage>;
  onClose: () => void;
}) {
  const { notify } = useCompany();
  const [amounts, setAmounts] = useState(p.amountsDefault ?? true);
  const [img, setImg] = useState<ShareImage | null>(null);
  useEffect(() => {
    let live = true;
    setImg(null);
    p.make(amounts).then((x) => live && setImg(x), (e: Error) => notify(e.message, 'error'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts]);
  const send = async () => {
    if (!img) return;
    try {
      const r = await api.whatsappImage(p.phone, img.png, p.fileName, p.caption);
      if (r === 'clipboard') notify('نسخت الصورة وفتحت الواتساب: الصقها بالمحادثة (Ctrl+V) وابعت');
      if (r) p.onClose();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  const [on, off] = p.options ?? ['مع الأسعار (القيمة والعربون والباقي)', 'بدون أسعار'];
  return (
    <Modal title={p.title} onClose={p.onClose} width={720}>
      <div style={{ marginBottom: 10 }}>
        <Tabs
          value={amounts ? 'with' : 'without'}
          onChange={(v) => setAmounts(v === 'with')}
          tabs={[
            { key: 'with', label: on },
            { key: 'without', label: off },
          ]}
        />
      </div>
      <div className="share-preview">{img ? <img src={img.dataUrl} alt="" /> : <p className="muted">عم جهّز الصورة...</p>}</div>
      <div className="form-actions">
        <button type="button" onClick={p.onClose}>
          إلغاء
        </button>
        <button type="button" className="whatsapp" disabled={!img} onClick={() => void send()}>
          <Icon name="message" size={16} /> {IS_MOBILE ? 'مشاركة بالواتساب' : 'إرسال بالواتساب'}
        </button>
      </div>
    </Modal>
  );
}

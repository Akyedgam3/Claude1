import { useEffect, useState } from 'react';
import { ACTIVITIES, ACTIVITY_LIST, ALL_FEATURES, DEFAULT_SCALE, FEATURE_INFO, type Activity, type ActivityCustomization, type Feature, type Paper, type PrintSettings, type ReceiptSettings } from '../../../core';
import { Icon } from '../components/icons';
import { startTour } from '../components/Tour';
import { CommercialDoc, sampleModel } from '../components/CommercialDoc';
import { api, dateText, IS_MOBILE, today, useCompany, type LanStatus } from '../api';
import { PAPER_NAMES } from '../components/print';
import { sampleReceipt, ThermalReceipt } from '../components/ThermalReceipt';
import { Field, Modal, PageHeader, Tabs } from '../components/ui';
import { CloudTab } from '../cloud/CloudTab';

type Tab = 'company' | 'customize' | 'print' | 'receipt' | 'taxes' | 'lan' | 'cloud' | 'backup' | 'period' | 'account' | 'license' | 'reset';

export function Settings({ tab: initial }: { tab?: string }) {
  const { can, session, user } = useCompany();
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? (can('settings.manage') ? 'company' : 'account'));
  const local = session.kind === 'local';
  return (
    <div className="page">
      <PageHeader title="الإعدادات">
        <button onClick={startTour}>
          <Icon name="sparkles" size={16} /> الجولة التعريفية
        </button>
      </PageHeader>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'company', label: 'الشركة', hidden: !can('settings.manage') },
          { key: 'customize', label: 'تخصيص النشاط', hidden: !can('settings.manage') },
          { key: 'print', label: 'الطباعة والفواتير', hidden: !can('settings.manage') },
          { key: 'receipt', label: 'الإيصال وشاشة الزبون', hidden: !can('settings.manage') },
          { key: 'taxes', label: 'الضرائب والمخزون', hidden: !can('settings.manage') },
          { key: 'lan', label: 'الشبكة المحلية', hidden: IS_MOBILE || !local || !can('settings.manage') },
          { key: 'cloud', label: 'الاتصال عن بعد', hidden: !local || !can('settings.manage') },
          { key: 'backup', label: 'النسخ الاحتياطي', hidden: (!local && !IS_MOBILE && !session.cloud) || !can('backup.manage') },
          { key: 'period', label: 'إقفال الفترات', hidden: !can('period.close') },
          { key: 'account', label: 'حسابي' },
          { key: 'license', label: 'الترخيص', hidden: !local || user.role !== 'owner' },
          { key: 'reset', label: 'تصفير الشركة', hidden: !local || user.role !== 'owner' },
        ]}
      />
      {tab === 'company' && <CompanyTab />}
      {tab === 'customize' && <CustomizeTab />}
      {tab === 'print' && <PrintTab />}
      {tab === 'receipt' && <ReceiptTab />}
      {tab === 'taxes' && <TaxesTab />}
      {tab === 'lan' && <LanTab />}
      {tab === 'cloud' && <CloudTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'period' && <PeriodTab />}
      {tab === 'account' && <AccountTab />}
      {tab === 'license' && <LicenseTab />}
      {tab === 'reset' && <ResetTab />}
    </div>
  );
}

function CompanyTab() {
  const { state, call, notify, profile } = useCompany();
  const c = state.info!;
  const [f, setF] = useState({ name: c.name, phone: c.phone ?? '', address: c.address ?? '', taxNumber: c.taxNumber ?? '' });
  return (
    <section className="card">
      <p className="muted">
        نوع النشاط: {profile.name} · العملة الأساسية: {state.currencies[c.baseCurrency]?.nameAr}
      </p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call('updateCompany', f)) notify('تم الحفظ');
        }}
      >
        <Field label="الاسم">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="الهاتف">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" />
        </Field>
        <Field label="العنوان">
          <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="الرقم الضريبي / السجل التجاري">
          <input value={f.taxNumber} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} />
        </Field>
        <div className="form-actions wide">
          <button className="primary">حفظ</button>
        </div>
      </form>
    </section>
  );
}

/** حرية كاملة: كل محل يشغّل الميزات التي يحتاجها ويكتب تصنيفاته ووحداته وحقوله. */
function CustomizeTab() {
  const { state, call, notify } = useCompany();
  const info = state.info!;
  const [activity, setActivity] = useState<Activity>(info.activity ?? 'general');
  const base = ACTIVITIES[activity];
  const c = info.customize ?? {};
  const initialFeatures = new Set<Feature>([...base.features.filter((f) => !(c.featuresOff ?? []).includes(f)), ...((c.featuresOn ?? []) as Feature[])]);
  const [features, setFeatures] = useState<Set<Feature>>(initialFeatures);
  const [categories, setCategories] = useState<string[]>(c.categories ?? base.categories);
  const [units, setUnits] = useState<string[]>(c.units ?? base.units);
  const [attributes, setAttributes] = useState<string[]>(c.attributes ?? base.attributes ?? []);
  const [itemLabel, setItemLabel] = useState(c.itemLabel ?? '');
  const [itemsLabel, setItemsLabel] = useState(c.itemsLabel ?? '');

  const changeActivity = (a: Activity) => {
    setActivity(a);
    // عند تغيير النشاط نقترح ميزاته وقوائمه، ويبقى للمستخدم تعديلها
    setFeatures(new Set(ACTIVITIES[a].features));
    setCategories(ACTIVITIES[a].categories);
    setUnits(ACTIVITIES[a].units);
    setAttributes(ACTIVITIES[a].attributes ?? []);
  };

  const save = async () => {
    const b = ACTIVITIES[activity];
    const customize: ActivityCustomization = {
      featuresOn: ALL_FEATURES.filter((f) => features.has(f) && !b.features.includes(f)),
      featuresOff: b.features.filter((f) => !features.has(f)),
      categories,
      units,
      attributes,
      ...(itemLabel.trim() ? { itemLabel: itemLabel.trim() } : {}),
      ...(itemsLabel.trim() ? { itemsLabel: itemsLabel.trim() } : {}),
    };
    if (await call('updateCompany', { activity, customize })) notify('تم حفظ التخصيص. القوائم والشاشات تحدّثت.');
  };

  return (
    <>
      <section className="card">
        <h3>نوع النشاط</h3>
        <p className="muted">تغيير النشاط لا يمس الحسابات أو الفواتير؛ يغيّر فقط الشاشات والاقتراحات.</p>
        <div className="activity-grid compact">
          {ACTIVITY_LIST.map((a) => (
            <button key={a.id} type="button" className={`activity ${activity === a.id ? 'active' : ''}`} onClick={() => changeActivity(a.id)}>
              <span className="activity-icon" style={{ background: a.color }}>
                <Icon name={a.icon} size={20} />
              </span>
              <strong>{a.name}</strong>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>الميزات والشاشات</h3>
        <p className="muted">شغّل أي ميزة تحتاجها حتى لو لم تكن من نشاطك (مثلاً مواعيد لمحل خياطة، أو أصناف مركّبة لمحل عادي).</p>
        <div className="feature-grid">
          {ALL_FEATURES.map((f) => (
            <label key={f} className={`feature-toggle ${features.has(f) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={features.has(f)}
                onChange={(e) => {
                  const next = new Set(features);
                  if (e.target.checked) next.add(f);
                  else next.delete(f);
                  setFeatures(next);
                }}
              />
              <span>
                <strong>{FEATURE_INFO[f].name}</strong>
                <small>{FEATURE_INFO[f].description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <div className="two-col">
        <section className="card">
          <h3>تصنيفات المواد</h3>
          <ListEditor values={categories} onChange={setCategories} placeholder="تصنيف جديد" />
        </section>
        <section className="card">
          <h3>الوحدات</h3>
          <ListEditor values={units} onChange={setUnits} placeholder="وحدة جديدة (متر، طقم...)" />
        </section>
        <section className="card">
          <h3>حقول إضافية لكل مادة</h3>
          <p className="muted">تظهر في نموذج المادة (مثلاً: اللون، المقاس، بلد المنشأ، رقم الموديل).</p>
          <ListEditor values={attributes} onChange={setAttributes} placeholder="اسم الحقل" />
        </section>
        <section className="card form-grid">
          <h3 className="wide">التسميات</h3>
          <Field label={`اسم المادة الواحدة (الافتراضي: ${ACTIVITIES[activity].itemLabel})`}>
            <input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} />
          </Field>
          <Field label={`اسم قائمة المواد (الافتراضي: ${ACTIVITIES[activity].itemsLabel})`}>
            <input value={itemsLabel} onChange={(e) => setItemsLabel(e.target.value)} />
          </Field>
        </section>
      </div>
      <div className="form-actions">
        <button className="primary big" onClick={save}>
          حفظ التخصيص
        </button>
      </div>
    </>
  );
}

function ListEditor({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <>
      <ul className="chips editable">
        {values.map((v) => (
          <li key={v}>
            {v}
            <button type="button" className="chip-x" title="حذف" onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
        {values.length === 0 && <li className="muted">فارغة</li>}
      </ul>
      <form
        className="with-button"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button className="icon" title="إضافة" disabled={!text.trim()}>
          <Icon name="plus" size={16} />
        </button>
      </form>
    </>
  );
}

/** تصميم الإيصال الحراري مع معاينة حية، ورسالة شاشة الزبون. */
function ReceiptTab() {
  const { state, call, notify, feature } = useCompany();
  const print = state.info!.print ?? {};
  const [r, setR] = useState<ReceiptSettings>(print.receipt ?? {});
  const [logo, setLogo] = useState<string | undefined>(print.logo);
  const restaurant = feature('tables');
  const flag = (k: keyof ReceiptSettings, label: string, def = true) => (
    <label className="check">
      <input type="checkbox" checked={(r[k] as boolean | undefined) ?? def} onChange={(e) => setR({ ...r, [k]: e.target.checked })} />
      {label}
    </label>
  );
  const save = async () => {
    if (await call('updateCompany', { print: { ...print, ...(logo ? { logo } : {}), receipt: r } })) notify('تم حفظ تصميم الإيصال');
  };
  const sample = sampleReceipt(state.currencies[state.info!.baseCurrency]?.symbol ?? '');
  return (
    <section className="card receipt-designer">
      <div>
        <h3>تصميم الإيصال الحراري</h3>
        <p className="muted">هاد الشكل اللي بيطلع على الطابعة الحرارية (80mm أو 58mm) بنقطة البيع{restaurant ? ' والمطعم' : ''}. المعاينة جنبك بتتغير مباشرة.</p>
        <div className="form-grid">
          <Field label="الشعار" wide>
            <div className="with-button">
              {logo && <img src={logo} alt="" className="logo-preview" />}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 300_000) return notify('اختر صورة أصغر من 300 كيلوبايت', 'error');
                  const reader = new FileReader();
                  reader.onload = () => setLogo(String(reader.result));
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </Field>
          <Field label="حجم الشعار">
            <select value={r.logo ?? 'small'} onChange={(e) => setR({ ...r, logo: e.target.value as ReceiptSettings['logo'] })}>
              <option value="banner">كبير بعرض الورقة</option>
              <option value="small">صغير بالنص</option>
              <option value="none">بدون شعار</option>
            </select>
          </Field>
          <Field label="حجم الخط">
            <select value={r.fontSize ?? 'md'} onChange={(e) => setR({ ...r, fontSize: e.target.value as ReceiptSettings['fontSize'] })}>
              <option value="sm">صغير</option>
              <option value="md">وسط</option>
              <option value="lg">كبير</option>
            </select>
          </Field>
          <Field label="عنوان الإيصال">
            <input value={r.title ?? ''} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="فاتورة مبيع" />
          </Field>
          <Field label="أسطر تحت الاسم (عنوان، فرع...)">
            <textarea rows={2} value={r.header ?? ''} onChange={(e) => setR({ ...r, header: e.target.value })} placeholder="دمشق - المزة - جانب الجامع" />
          </Field>
        </div>
        <h4>شو يطلع على الإيصال</h4>
        <div className="toggles">
          {flag('showName', 'اسم المحل')}
          {flag('showContact', 'العنوان والهاتف')}
          {flag('showNumber', 'رقم الفاتورة')}
          {flag('showDate', 'التاريخ')}
          {flag('showTime', 'الوقت بالآخر')}
          {flag('showTable', 'رقم الطاولة')}
          {flag('showOrderType', 'سفري / توصيل')}
          {flag('showCaptain', 'اسم الكابتن')}
          {flag('showGuests', 'عدد الضيوف')}
          {flag('showCashier', 'اسم الكاشير')}
          {flag('showCustomer', 'اسم الزبون')}
          {flag('showPrice', 'عمود سعر الوحدة')}
          {flag('grid', 'جدول بخطوط', false)}
          {flag('showQr', 'رمز QR', false)}
        </div>
        <div className="form-grid">
          <Field label="نص قبل رقم التواصل">
            <input value={r.contactLabel ?? ''} onChange={(e) => setR({ ...r, contactLabel: e.target.value })} placeholder="للتوصيات والاستفسار" />
          </Field>
          <Field label="رقم التواصل">
            <input className="ltr" value={r.contactPhone ?? ''} onChange={(e) => setR({ ...r, contactPhone: e.target.value })} placeholder="0933 000 000" />
          </Field>
          <Field label="رسالة الشكر">
            <input value={r.thanks ?? ''} onChange={(e) => setR({ ...r, thanks: e.target.value })} placeholder="شكراً لزيارتكم" />
          </Field>
          <Field label="نص إضافي بالآخر">
            <textarea rows={2} value={r.footer ?? ''} onChange={(e) => setR({ ...r, footer: e.target.value })} placeholder="واي فاي: Wazn2026" />
          </Field>
        </div>
        <h4>شاشة الزبون</h4>
        <p className="muted">شاشة تانية موصولة بالكمبيوتر، بيشوف عليها الزبون طلبه والمبلغ وهو عم ينحسب. بتفتحها من زر «شاشة الزبون» بنقطة البيع{restaurant ? ' أو بشاشة الطلب' : ''}.</p>
        <Field label="رسالة الترحيب (لما ما في طلب)">
          <input value={r.displayWelcome ?? ''} onChange={(e) => setR({ ...r, displayWelcome: e.target.value })} placeholder={`أهلاً وسهلاً بكم في ${state.info!.name}`} />
        </Field>
        <div className="form-actions">
          <button className="primary" onClick={() => void save()}>
            حفظ التصميم
          </button>
        </div>
      </div>
      <div className="preview-col">
        <div className="thermal-preview">
          <ThermalReceipt data={sample} preview={r} {...(logo ? { logo } : {})} />
        </div>
      </div>
    </section>
  );
}

function PrintTab() {
  const { state, call, notify } = useCompany();
  const [p, setP] = useState<PrintSettings>(state.info!.print ?? { showAmountInWords: true });
  const [printers, setPrinters] = useState<{ name: string; label: string }[]>([]);
  useEffect(() => {
    api.printers().then(setPrinters).catch(() => setPrinters([]));
  }, []);
  const papers = Object.keys(PAPER_NAMES) as Paper[];
  const printerSelect = (kind: 'invoice' | 'receipt' | 'kitchen' | 'label', label: string) => (
    <Field label={label}>
      <select value={p.printers?.[kind] ?? ''} onChange={(e) => setP({ ...p, printers: { ...p.printers, [kind]: e.target.value || undefined } })}>
        <option value="">اسأل عند الطباعة</option>
        {printers.map((x) => (
          <option key={x.name} value={x.name}>
            {x.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const templates: { id: NonNullable<PrintSettings['template']>; name: string; hint: string }[] = [
    { id: 'modern', name: 'عصري', hint: 'شريط بلون شركتك وجدول ملوّن' },
    { id: 'classic', name: 'كلاسيكي', hint: 'إطارات واضحة، رسمي' },
    { id: 'minimal', name: 'بسيط', hint: 'أبيض وأسود، يوفّر الحبر' },
  ];
  const colors = ['#0f6e5c', '#1f5fa8', '#8a3fa0', '#b5531c', '#a52a2a', '#12302b', '#c07a12', '#2f8f3a'];
  return (
    <section className="card">
      <div className="print-designer">
        <div className="designer-controls">
          <h3>تصميم الفاتورة</h3>
          <div className="template-cards">
            {templates.map((t) => (
              <button type="button" key={t.id} className={`template-card ${(p.template ?? 'modern') === t.id ? 'active' : ''}`} onClick={() => setP({ ...p, template: t.id })}>
                <span className={`mini mini-${t.id}`} style={{ ['--doc-color' as string]: p.color ?? '#0f6e5c' }}>
                  <i />
                  <b />
                  <b />
                  <b />
                </span>
                <strong>{t.name}</strong>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
          <h4>لون الشركة</h4>
          <div className="swatches">
            {colors.map((c) => (
              <button type="button" key={c} title={c} className={`swatch ${(p.color ?? '#0f6e5c') === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setP({ ...p, color: c })} />
            ))}
            <input type="color" value={p.color ?? '#0f6e5c'} onChange={(e) => setP({ ...p, color: e.target.value })} title="لون مخصص" />
          </div>
          <div className="toggles">
            <label className="check">
              <input type="checkbox" checked={p.showQr !== false} onChange={(e) => setP({ ...p, showQr: e.target.checked })} />
              رمز QR بملخص الفاتورة
            </label>
            <label className="check">
              <input type="checkbox" checked={p.showStamp !== false} onChange={(e) => setP({ ...p, showStamp: e.target.checked })} />
              ختم (مدفوعة / آجل / ملغاة)
            </label>
            <label className="check">
              <input type="checkbox" checked={!!p.showSignatures} onChange={(e) => setP({ ...p, showSignatures: e.target.checked })} />
              خانات التوقيع
            </label>
          </div>
          <Field label="الشروط والأحكام (اختياري)">
            <textarea rows={3} value={p.terms ?? ''} onChange={(e) => setP({ ...p, terms: e.target.value })} placeholder={'البضاعة المباعة لا ترد بعد 7 أيام\nالكفالة لا تشمل سوء الاستخدام'} />
          </Field>
          <button className="primary" onClick={async () => (await call('updateCompany', { print: p })) && notify('تم حفظ تصميم الفاتورة')}>
            حفظ التصميم
          </button>
        </div>
        <div className="designer-preview">
          <div className="preview-scale">
            <div className="paper-preview">
              <CommercialDoc model={sampleModel(state.currencies[state.info!.baseCurrency]?.symbol ?? '')} preview={p} className="sample" />
            </div>
          </div>
        </div>
      </div>
      <hr />
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call('updateCompany', { print: p })) notify('تم الحفظ');
        }}
      >
        <Field label="شعار الشركة (يظهر على الفواتير)" wide>
          <div className="with-button">
            {p.logo && <img src={p.logo} alt="" className="logo-preview" />}
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 300_000) return notify('اختر صورة أصغر من 300 كيلوبايت', 'error');
                const reader = new FileReader();
                reader.onload = () => setP({ ...p, logo: String(reader.result) });
                reader.readAsDataURL(file);
              }}
            />
            {p.logo && (
              <button type="button" onClick={() => setP({ ...p, logo: undefined })}>
                إزالة
              </button>
            )}
          </div>
        </Field>
        <Field label="سطر تحت اسم الشركة">
          <input value={p.header ?? ''} onChange={(e) => setP({ ...p, header: e.target.value })} placeholder="وكيل معتمد لقطع ..." />
        </Field>
        <Field label="نص أسفل الفاتورة">
          <input value={p.footer ?? ''} onChange={(e) => setP({ ...p, footer: e.target.value })} placeholder="البضاعة المباعة لا ترد بعد 7 أيام" />
        </Field>
        <Field label="ورق الفاتورة الافتراضي">
          <select value={p.invoicePaper ?? 'a4'} onChange={(e) => setP({ ...p, invoicePaper: e.target.value as Paper })}>
            {papers.map((x) => (
              <option key={x} value={x}>
                {PAPER_NAMES[x]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ورق الإيصال (الكاشير)">
          <select value={p.receiptPaper ?? '80mm'} onChange={(e) => setP({ ...p, receiptPaper: e.target.value as Paper })}>
            {papers.map((x) => (
              <option key={x} value={x}>
                {PAPER_NAMES[x]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="عدد نسخ الفاتورة">
          <input type="number" min={1} max={5} value={p.copies ?? 1} onChange={(e) => setP({ ...p, copies: Number(e.target.value) })} />
        </Field>
        {!IS_MOBILE && printerSelect('invoice', 'طابعة الفواتير')}
        {!IS_MOBILE && printerSelect('receipt', 'طابعة الإيصالات (حرارية)')}
        {!IS_MOBILE && printerSelect('kitchen', 'طابعة المطبخ')}
        {!IS_MOBILE && printerSelect('label', 'طابعة الملصقات')}
        <label className="check">
          <input type="checkbox" checked={p.showAmountInWords !== false} onChange={(e) => setP({ ...p, showAmountInWords: e.target.checked })} />
          كتابة المبلغ بالحروف (التفقيط)
        </label>
        <label className="check">
          <input type="checkbox" checked={!!p.showUsdEquivalent} onChange={(e) => setP({ ...p, showUsdEquivalent: e.target.checked })} />
          إظهار المقابل بالدولار
        </label>
        <label className="check">
          <input type="checkbox" checked={p.showPreviousBalance !== false} onChange={(e) => setP({ ...p, showPreviousBalance: e.target.checked })} />
          إظهار الحساب السابق للزبون على الفاتورة (والباقي بذمته بعدها)
        </label>
        <Field label="عنوان فاتورة المبيع المطبوعة">
          <input placeholder="فاتورة مبيع" value={p.saleTitle ?? ''} disabled={!!p.hideSaleTitle} onChange={(e) => setP({ ...p, saleTitle: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!p.hideSaleTitle} onChange={(e) => setP({ ...p, hideSaleTitle: e.target.checked })} />
          بدون عنوان «فاتورة مبيع» (بيطلع الرقم بس، مفيد للشحنات والتخليص)
        </label>
        <label className="check">
          <input type="checkbox" checked={p.showInvoiceProfit !== false} onChange={(e) => setP({ ...p, showInvoiceProfit: e.target.checked })} />
          إظهار ربح كل فاتورة بسجل الفواتير (بيشوفه بس اللي إله صلاحية التكلفة)
        </label>
        <label className="check">
          <input type="checkbox" checked={p.profitWhileSelling === true} onChange={(e) => setP({ ...p, profitWhileSelling: e.target.checked })} />
          إظهار الربح كمان وقت كتابة الفاتورة (الزبون ممكن يشوفه عالشاشة)
        </label>
        <div className="form-actions wide">
          <button className="primary">حفظ</button>
        </div>
      </form>
    </section>
  );
}

function TaxesTab() {
  const { state, call, notify, feature } = useCompany();
  const info = state.info!;
  const scale = info.scale ?? DEFAULT_SCALE;
  return (
    <>
      <section className="card">
        <h3>الضرائب والرسوم</h3>
        <p className="muted">حدد النسب حسب نوع نشاطك. الضرائب الفعّالة تُضاف تلقائياً في الفواتير ويمكن إلغاؤها من الفاتورة.</p>
        <table className="table">
          <thead>
            <tr>
              <th>الضريبة</th>
              <th>النسبة %</th>
              <th>الحساب</th>
              <th>فعّالة</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(state.taxes).map((t) => (
              <tr key={t.id}>
                <td>
                  <input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && call('saveTax', { ...t, name: e.target.value })} />
                </td>
                <td>
                  <input type="number" min={0} max={100} step="0.01" defaultValue={t.percent} onBlur={(e) => Number(e.target.value) !== t.percent && call('saveTax', { ...t, percent: Number(e.target.value) })} />
                </td>
                <td>{state.accounts[t.accountId]?.name}</td>
                <td>
                  <input type="checkbox" checked={t.active} onChange={(e) => call('saveTax', { ...t, active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h3>المخزون</h3>
        <label className="check">
          <input type="checkbox" checked={!!info.allowNegativeStock} onChange={async (e) => (await call('updateCompany', { allowNegativeStock: e.target.checked })) && notify('تم الحفظ')} />
          السماح بالبيع بدون رصيد كافٍ (رصيد سالب)
        </label>
        {feature('scale') && (
          <form
            className="form-grid four"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const s = {
                prefix: String(fd.get('prefix')),
                itemDigits: Number(fd.get('itemDigits')),
                valueDigits: Number(fd.get('valueDigits')),
                valueType: String(fd.get('valueType')) as 'weight' | 'price',
                valueDecimals: Number(fd.get('valueDecimals')),
              };
              if (await call('updateCompany', { scale: s })) notify('تم الحفظ');
            }}
          >
            <h4 className="wide">باركود الميزان (EAN-13)</h4>
            <Field label="البادئة">
              <input name="prefix" defaultValue={scale.prefix} className="mono" />
            </Field>
            <Field label="خانات رمز المادة">
              <input name="itemDigits" type="number" defaultValue={scale.itemDigits} />
            </Field>
            <Field label="خانات القيمة">
              <input name="valueDigits" type="number" defaultValue={scale.valueDigits} />
            </Field>
            <Field label="القيمة">
              <select name="valueType" defaultValue={scale.valueType}>
                <option value="weight">وزن</option>
                <option value="price">سعر</option>
              </select>
            </Field>
            <Field label="المنازل العشرية للقيمة">
              <input name="valueDecimals" type="number" defaultValue={scale.valueDecimals} />
            </Field>
            <div className="form-actions">
              <button className="primary">حفظ</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

function LanTab() {
  const { notify, state } = useCompany();
  const [s, setS] = useState<LanStatus | null>(null);
  const load = () => api.lanStatus().then(setS).catch((e: Error) => notify(e.message, 'error'));
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  const toggle = async (enable: boolean, newCode = false) => {
    try {
      await api.lanHost(enable, newCode);
      await load();
      notify(enable ? 'وضع الخادم يعمل' : 'تم إيقاف وضع الخادم');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <section className="card">
      <h3>العمل على أكثر من جهاز (بدون إنترنت)</h3>
      <p className="muted">
        هذا الجهاز يحفظ البيانات، والأجهزة الأخرى على نفس الشبكة (راوتر/وايفاي) تتصل به. عدد الأجهزة المسموح به حسب الترخيص. كل جهاز يدخل بمستخدم وكلمة سر.
      </p>
      <label className="check">
        <input type="checkbox" checked={s.enabled} onChange={(e) => toggle(e.target.checked)} />
        تفعيل وضع الخادم {s.running ? <span className="tag">يعمل</span> : s.enabled ? <span className="tag bad">متوقف</span> : null}
      </label>
      {s.enabled && (
        <div className="kv lan-info">
          <span>عنوان هذا الجهاز</span>
          <strong className="mono selectable">{s.addresses.join('  أو  ') || 'غير متصل بشبكة'}</strong>
          <span>المنفذ</span>
          <strong className="mono">{s.port}</strong>
          <span>رمز الربط</span>
          <strong className="mono selectable big-code">{s.pairingCode}</strong>
          <span>الأجهزة المتصلة</span>
          <strong>{s.devices.length ? s.devices.map((d) => `${d.deviceName} (${d.user})`).join('، ') : 'لا يوجد'}</strong>
        </div>
      )}
      {s.enabled && <button onClick={() => toggle(true, true)}>تغيير رمز الربط (يفصل كل الأجهزة)</button>}
      <p className="muted">قد يطلب جدار حماية ويندوز السماح للبرنامج بالاتصال على الشبكة الخاصة — اختر "سماح". الشركة: {state.info?.name}</p>
    </section>
  );
}

function BackupTab() {
  const { notify, session } = useCompany();
  const run = async (fn: () => Promise<string | null | void>) => {
    try {
      const p = await fn();
      if (p) notify(`تم حفظ النسخة: ${p}`);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  if (session.kind === 'remote') {
    return (
      <section className="card">
        <h3>النسخ الاحتياطي</h3>
        <p className="muted">
          بتاخد نسخة كاملة من بيانات الجهاز الرئيسي على {IS_MOBILE ? 'هالجوال' : 'هالكمبيوتر'}، وبتحفظها أو بتبعتها (واتساب، درايف…). الملف مشفّر وبينفتح بنفس كلمات السر على أي جهاز: شاشة البداية ← فتح شركة ← استعادة نسخة احتياطية. لازم يكون الجهاز الرئيسي شغّال.
        </p>
        <div className="button-row">
          <button className="primary" onClick={() => run(() => api.backup(true))}>
            نسخة احتياطية من الجهاز الرئيسي...
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="card">
      <h3>النسخ الاحتياطي</h3>
      <p className="muted">
        {IS_MOBILE
          ? 'يأخذ البرنامج نسخة تلقائية داخل الجوال عند كل خروج. يُنصح بإرسال نسخة أسبوعياً لمكان آمن (واتساب، درايف، أو كمبيوتر). النسخ مشفّرة وتُفتح بنفس كلمات السر. لاستعادة نسخة: شاشة البداية ← فتح شركة ← استعادة نسخة احتياطية.'
          : 'يأخذ البرنامج نسخة تلقائية عند كل خروج (آخر 30 نسخة داخل مجلد الشركة). يُنصح بنسخة أسبوعية على فلاشة. النسخ مشفّرة وتُفتح بنفس كلمات السر. لاستعادة نسخة: شاشة البداية ← فتح شركة ← استعادة نسخة احتياطية.'}
      </p>
      <div className="button-row">
        <button onClick={() => run(() => api.backup(false))}>نسخة احتياطية الآن</button>
        <button className="primary" onClick={() => run(() => api.backup(true))}>
          {IS_MOBILE ? 'حفظ أو إرسال ملف النسخة...' : 'نسخ إلى فلاشة / مجلد آخر...'}
        </button>
        {!IS_MOBILE && <button onClick={() => run(() => api.reveal())}>فتح مجلد الشركة</button>}
      </div>
    </section>
  );
}

function PeriodTab() {
  const { state, call, notify } = useCompany();
  const locked = state.info?.lockedUntil;
  const [lockDate, setLockDate] = useState('');
  const [yearEnd, setYearEnd] = useState(`${new Date().getFullYear() - 1}-12-31`);
  return (
    <section className="card">
      <h3>إقفال الفترات</h3>
      <p>{locked ? `الحركات حتى ${dateText(locked)} مقفلة ولا يمكن تعديلها.` : 'لا توجد فترات مقفلة.'}</p>
      <div className="form-grid">
        <div>
          <h4>قفل فترة (بعد مراجعة الشهر مثلاً)</h4>
          <div className="inline-form">
            <input type="date" value={lockDate} max={today()} onChange={(e) => setLockDate(e.target.value)} />
            <button disabled={!lockDate} onClick={async () => (await call('lockPeriod', lockDate)) && notify('تم قفل الفترة')}>
              قفل
            </button>
          </div>
        </div>
        <div>
          <h4>إقفال السنة المالية</h4>
          <p className="muted">ينقل أرباح/خسائر السنة إلى "الأرباح المدوّرة" ويقفل السنة. لا يمكن التراجع عنه.</p>
          <div className="inline-form">
            <input type="date" value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} />
            <button className="danger" onClick={async () => (await call('closeYear', yearEnd)) && notify('تم إقفال السنة المالية')}>
              إقفال السنة
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AccountTab() {
  const { call, notify, session, user } = useCompany();
  const [f, setF] = useState({ old: '', next: '', confirm: '' });
  const [recovery, setRecovery] = useState<string | null>(null);
  return (
    <section className="card">
      <h3>
        {user.displayName} <small className="muted mono">{user.username}</small>
      </h3>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (f.next !== f.confirm) return notify('كلمتا السر غير متطابقتين', 'error');
          if (await call('changeMyPassword', f.old, f.next)) {
            notify('تم تغيير كلمة السر');
            setF({ old: '', next: '', confirm: '' });
          }
        }}
      >
        {!session.viaRecovery && (
          <Field label="كلمة السر الحالية" wide>
            <input type="password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} />
          </Field>
        )}
        <Field label="كلمة السر الجديدة">
          <input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label="تأكيدها">
          <input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        <div className="form-actions wide">
          <button className="primary">تغيير كلمة السر</button>
        </div>
      </form>
      {user.role === 'owner' && session.kind === 'local' && (
        <>
          <h4>رمز الاسترداد</h4>
          <p className="muted">إن فقدت الرمز القديم أنشئ واحداً جديداً (يُبطل القديم).</p>
          <button
            onClick={async () => {
              const res = await call<string>('rotateRecoveryCode');
              if (res) setRecovery(res.value);
            }}
          >
            إنشاء رمز استرداد جديد
          </button>
        </>
      )}
      {recovery && (
        <Modal title="رمز الاسترداد الجديد" onClose={() => setRecovery(null)}>
          <p className="big-code mono selectable" dir="ltr">
            {recovery}
          </p>
          <p className="bad">اكتبه واحفظه في مكان آمن. لن يظهر مرة أخرى.</p>
        </Modal>
      )}
    </section>
  );
}

function LicenseTab() {
  const { info, notify, reloadInfo } = useCompany();
  const lic = info.license;
  const [key, setKey] = useState('');
  return (
    <section className="card">
      <h3>الترخيص</h3>
      <div className="kv">
        <span>الحالة</span>
        <strong>{lic.planName}</strong>
        <span>باسم</span>
        <strong>{lic.customer}</strong>
        <span>ينتهي</span>
        <strong>{lic.expiresAt ? dateText(lic.expiresAt) : 'دائم'}</strong>
        <span>عدد الأجهزة</span>
        <strong>{lic.devices}</strong>
        <span>بصمة الجهاز</span>
        <strong className="mono selectable">{lic.machineId}</strong>
        {lic.onlineEnabled && (
          <>
            <span>آخر تحقق</span>
            <strong>{lic.lastOnline ? new Date(lic.lastOnline).toLocaleString('ar-SY') : 'لم يتم'}</strong>
            <span>آخر قائمة وصلت</span>
            <strong>{lic.feedIssuedAt ? new Date(lic.feedIssuedAt).toLocaleString('ar-SY') : 'لم تصل بعد'}</strong>
          </>
        )}
      </div>
      <div className="inline-form">
        <input dir="ltr" className="mono" placeholder="مفتاح جديد (عند التجديد بدون إنترنت)" value={key} onChange={(e) => setKey(e.target.value)} />
        <button
          className="primary"
          disabled={!key.trim()}
          onClick={async () => {
            try {
              await api.activate(key);
              setKey('');
              notify('تم تحديث الترخيص');
              await reloadInfo();
            } catch (e) {
              notify((e as Error).message, 'error');
            }
          }}
        >
          تفعيل
        </button>
        {lic.onlineEnabled && (
          <button
            onClick={async () => {
              await api.refreshLicense();
              await reloadInfo();
              notify('تم التحقق');
            }}
          >
            تحقق الآن
          </button>
        )}
      </div>
    </section>
  );
}

const RESET_WORD = 'تصفير';

/** تصفير الشركة: بعد التجربة بيرجع الزبون يبلش نضيف، مع نسخة احتياطية تلقائية. */
function ResetTab() {
  const { notify, state, session } = useCompany();
  const [mode, setMode] = useState<'transactions' | 'all'>('transactions');
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const counts = { invoices: state.invoices.length, items: Object.keys(state.items).length, parties: Object.keys(state.parties).length };
  return (
    <section className="card">
      <h3>تصفير الشركة</h3>
      <p className="muted">بعد ما تخلص تجربة البرنامج، فيك تمحي الفواتير والحركات التجريبية وتبلش شغلك الحقيقي من الصفر بنفس الشركة ونفس كلمات السر.</p>
      <div className="segmented" style={{ margin: '12px 0' }}>
        <button type="button" className={mode === 'transactions' ? 'active' : ''} onClick={() => setMode('transactions')}>
          تصفير الحركات
        </button>
        <button type="button" className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
          تصفير كامل
        </button>
      </div>
      {mode === 'transactions' ? (
        <ul className="muted">
          <li>
            <b>بينمحى:</b> كل الفواتير ({counts.invoices})، السندات، القيود، الديون، حركات المخزون، الطلبات، الأقساط وأوامر الصيانة. كميات المخزون وأرصدة الزباين بترجع صفر.
          </li>
          <li>
            <b>بيضل:</b> المواد ({counts.items}) بأسعارها ووحداتها، الزباين والموردين ({counts.parties})، الطاولات، سعر الدولار، المستخدمين والإعدادات.
          </li>
        </ul>
      ) : (
        <ul className="muted">
          <li>
            <b>بينمحى:</b> كل شي — الحركات، والمواد ({counts.items})، والزباين والموردين ({counts.parties}).
          </li>
          <li>
            <b>بيضل:</b> اسم الشركة والإعدادات ودليل الحسابات والمستخدمين وكلمات السر بس.
          </li>
        </ul>
      )}
      <div className="banner bad">قبل التصفير البرنامج بياخد نسخة احتياطية تلقائياً. إذا غلطت، بترجع لها من: شاشة البداية ← استعادة نسخة احتياطية.</div>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (word.trim() !== RESET_WORD) return notify(`اكتب كلمة «${RESET_WORD}» للتأكيد`, 'error');
          setBusy(true);
          try {
            const dir = await api.wipe(mode, password);
            notify(`تم التصفير. النسخة القديمة محفوظة: ${dir}`);
            setPassword('');
            setWord('');
          } catch (err) {
            notify((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {session.viaRecovery ? (
          <p className="bad wide">فتحت الشركة برمز الاسترداد. عيّن كلمة سر من «حسابي» أولاً.</p>
        ) : (
          <Field label="كلمة السر (للتأكيد)">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label={`اكتب «${RESET_WORD}» للتأكيد`}>
          <input value={word} onChange={(e) => setWord(e.target.value)} />
        </Field>
        <div className="form-actions wide">
          <button className="danger" disabled={busy || !password || session.viaRecovery}>
            {mode === 'all' ? 'تصفير كامل للشركة' : 'تصفير الحركات'}
          </button>
        </div>
      </form>
    </section>
  );
}

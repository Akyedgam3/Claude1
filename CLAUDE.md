# ميزان (Mizan) — دليل المشروع

برنامج محاسبة وإدارة محلات عربي (RTL) لسطح المكتب، يعمل بدون إنترنت. Electron + React 19 + TypeScript، الهدف ويندوز.

## التواصل مع صاحب المشروع
- الرد عليه **باللهجة السورية** وباختصار.
- أرقام التواصل (واتساب): **+963 968 037 609** و **+963 980 072 891**.
  - ⚠️ الرقم الثاني ينتهي بـ **891** (وليس 981 — كان خطأ قديماً في الفيديوهات وتم تصحيحه).
- الأرقام والأسعار تظهر **فقط** في الموقع، وبرومبتات التعليق الصوتي، ونهايات الفيديوهات. **ممنوع وضعها داخل البرنامج** (ولا في ملف التنصيب).
- عرض الوكلاء: 10 رخص بـ 59.99$، الرخصة على جهازين (قابلة للزيادة لـ 5+ بسعر مختلف)، اشتراكات **سنوية فقط** للوكلاء (لا يوجد دائم).

## المستودعات
- `Akyedgam3/Claude1` (خاص): كود البرنامج. فرع التطوير: `claude/syria-accounting-system-pj25xg`. لا تفتح PR إلا إذا طُلب.
- `Akyedgam3/mizan-updates` (عام): الموقع الرسمي + `feed.txt` + ملفات التنصيب (Releases).
  - الموقع: https://akyedgam3.github.io/mizan-updates/
  - التحميل: https://github.com/Akyedgam3/mizan-updates/releases/latest/download/Mizan-Setup.exe
  - صفحات الموقع تُعدَّل في `tools/pages/` ثم `python3 tools/build_site.py`.

## الترخيص (مهم جداً)
- المفتاح العام الحقيقي مضمّن في `src/license/public-key.ts`. المفتاح الخاص **عند صاحب المشروع فقط** (`keys/license-private.pem`، مستثنى من git). **لا تولّد مفتاحاً جديداً** — هذا يُبطل كل التراخيص المباعة.
- نسخة الاختبارات تُبنى بـ `MIZAN_TEST_BUILD=1` فتثق بمفتاح التطوير (`dev-keys/`) ولا تتصل بالقائمة الحقيقية. نسخة البيع لا تحتوي مفتاح التطوير أبداً (تحقق: `grep -c MCowBQYDK2VwAyEAWu46 out/main/index.js` يجب أن يكون 0).
- البرنامج يقرأ `feed.txt` الموقّع من `mizan-updates` (والرابط الاحتياطي jsDelivr). إذا لم يصل إليه خلال `offlineDays` (7 افتراضياً) يتوقف عند العميل — **لا تغيّر روابط القائمة قبل أن يكون الملف الجديد منشوراً**.
- لوحة الإدارة: `npm run admin` (محلية على 127.0.0.1). فيها العملاء، الوكلاء (رصيد الباقات)، وإعلان التحديثات. بعد أي تغيير: "نشر قائمة الحالة" ثم رفع `keys/feed.txt` إلى `mizan-updates/feed.txt`.

## إصدار نسخة جديدة
1. ارفع رقم `version` في `package.json`.
2. ادفع للفرع؛ GitHub Actions يبني `Mizan-Setup.exe` (Artifacts ← Mizan-Windows).
3. صاحب المشروع يرفعه كـ Release جديد في `mizan-updates` باسم `Mizan-Setup.exe` (Tag مثل `v1.1.0`).
4. من لوحة الإدارة ← تحديثات البرنامج: رقم النسخة + الرابط + شو الجديد، ثم نشر القائمة ورفع `feed.txt`. البرامج المنصّبة تُظهر شاشة "في نسخة جديدة".

## ملف التنصيب (NSIS)
- `build/installer.nsh` (UTF-8 مع BOM): شاشة الترحيب، عنوان صفحة التنصيب، شاشة النهاية.
- `build/license_ar.txt` (UTF-8 مع BOM): اتفاقية الترخيص المختصرة. النص الكامل في الموقع `terms.html`.
- `build/installerSidebar.bmp` (164×314) و `build/installerHeader.bmp` (150×57)، مصدرها `marketing/video/installer/`.

## البنية والأوامر
- `npm test` (vitest)، `npm run typecheck`، `npm run build`، `npm run test:e2e` (بعد `MIZAN_TEST_BUILD=1 npm run build`، وعلى لينكس عبر `xvfb-run`).
- الدفتر مبني على الأحداث (event-sourced): `src/core/ledger.ts` و `commerce.ts`؛ المبالغ أعداد صحيحة بأصغر وحدة.
- العمليات من الواجهة: `window.mizan.invoke('company:call', method, args)`، والصلاحيات في `src/core/permissions.ts` و `src/app/executor.ts`.
- Prettier غير مطبّق على كامل المستودع — لا تشغّله على ملفات كاملة.

## الفيديوهات
- أدوات صناعة الفيديوهات في `marketing/video/` (اقرأ README هناك). الأسلوب: لقطات حقيقية من البرنامج عبر Playwright + كاميرا وتأشيرات تلقائية + موسيقى مولّدة + صوت من صاحب المشروع.
- الإعلان (`ad`) يذكر الرقم القديم 981 **بالصوت** — يحتاج تسجيل جملة الرقم من جديد قبل نشره.

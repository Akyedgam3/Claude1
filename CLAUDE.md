# وزن (Wazn) — دليل المشروع

> الاسم الحالي «وزن / Wazn» من النسخة 1.2.9. قبلها «ميزان / Mizan» (حتى 1.2.8)، وجرّبنا «معيار / Miyar» بـ 1.2.3. الأسماء الداخلية ما تغيّرت حتى ما ينكسر شي عند الزباين: `appId` (`sy.mizan.accounting`)، مجلد البيانات مثبّت على `%APPDATA%\Mizan` بأول `src/main/index.ts`، مجلد الشركات `Documents\Mizan` (أو `Documents\Miyar` إذا هو الموجود)، `meta.app = 'mizan'`، `window.mizan`، مستودع `mizan-updates` ورابط `feed.txt`. لوحة الإدارة صارت `Wazn-Admin.cmd` (كانت `Mizan-Admin.cmd`). كل Release فيه `Wazn-Setup.exe` ونسختين `Mizan-Setup.exe` و`Miyar-Setup.exe` للروابط القديمة. عبارات «ميزان المراجعة» و«باركود الميزان» مصطلحات محاسبية مش اسم البرنامج.

برنامج محاسبة وإدارة محلات عربي (RTL) لسطح المكتب، يعمل بدون إنترنت. Electron + React 19 + TypeScript، الهدف ويندوز.

## التواصل مع صاحب المشروع
- الرد عليه **باللهجة السورية** وباختصار.
- أرقام التواصل (واتساب): **+963 968 037 609** و **+963 980 072 891**.
  - ⚠️ الرقم الثاني ينتهي بـ **891** (وليس 981 — كان خطأ قديماً في الفيديوهات وتم تصحيحه).
- الأرقام والأسعار تظهر **فقط** في الموقع، وبرومبتات التعليق الصوتي، ونهايات الفيديوهات. **ممنوع وضعها داخل البرنامج** (ولا في ملف التنصيب).
- أسعار البيع المباشر (معروضة بالموقع): شهري 4.99$، 3 أشهر 11.99$، 6 أشهر 19.99$، سنوي 29.99$، شراء دائم 59.99$. كل رخصة على جهازين.
- عرض الوكلاء: 10 رخص بـ 59.99$، الرخصة على جهازين (قابلة للزيادة لـ 5+ بسعر مختلف)، اشتراكات **سنوية فقط** للوكلاء (لا يوجد دائم).

## المستودعات
- `Akyedgam3/Claude1` (خاص): كود البرنامج. فرع التطوير: `claude/syria-accounting-system-pj25xg`. لا تفتح PR إلا إذا طُلب.
- `Akyedgam3/mizan-updates` (عام): الموقع الرسمي + `feed.txt` + ملفات التنصيب (Releases).
  - الموقع: https://waznsy.com (الدومين من هوستنجر، والقديم https://akyedgam3.github.io/mizan-updates/ بيحوّل عليه). إيميل التواصل بالموقع: info@waznsy.com
  - التحميل: https://github.com/Akyedgam3/mizan-updates/releases/latest/download/Wazn-Setup.exe
  - صفحات الموقع تُعدَّل في `tools/pages/` ثم `python3 tools/build_site.py`.
  - التقييمات (`reviews.html` وقسم بالرئيسية): تسجيل دخول بغوغل عبر Firebase. الإعدادات بـ `assets/js/firebase-config.js` (عامة مش سرية)، والحماية بـ `firestore.rules` اللي بتنلصق بـ Firebase Console. الفيديوهات انشالت من الموقع بانتظار فيديوهات جديدة.

## الترخيص (مهم جداً)
- المفتاح العام الحقيقي مضمّن في `src/license/public-key.ts`. المفتاح الخاص **عند صاحب المشروع فقط** (`keys/license-private.pem`، مستثنى من git). **لا تولّد مفتاحاً جديداً** — هذا يُبطل كل التراخيص المباعة.
- نسخة الاختبارات تُبنى بـ `MIZAN_TEST_BUILD=1` فتثق بمفتاح التطوير (`dev-keys/`) ولا تتصل بالقائمة الحقيقية. نسخة البيع لا تحتوي مفتاح التطوير أبداً (تحقق: `grep -c MCowBQYDK2VwAyEAWu46 out/main/index.js` يجب أن يكون 0).
- البرنامج يقرأ `feed.txt` الموقّع من `mizan-updates`: raw.githubusercontent + `https://waznsy.com/feed.txt` (من 1.2.17) + jsDelivr، كلهن مع بعض ومناخد الأحدث (jsDelivr بيخزّن نسخة قديمة لساعات؛ لتحديثه فوراً افتح https://purge.jsdelivr.net/gh/Akyedgam3/mizan-updates@main/feed.txt). بيتحقق كل ساعة. إذا لم يصل إليه خلال `offlineDays` (7 افتراضياً) يتوقف عند العميل — **لا تغيّر روابط القائمة قبل أن يكون الملف الجديد منشوراً**.
- لوحة الإدارة: دبل كليك على `Wazn-Admin.cmd` (ويندوز) أو `npm run admin` (محلية على 127.0.0.1). مجلد `keys` لازم ينسخ يدوياً لأنه مستثنى من git. فيها العملاء، الوكلاء (رصيد الباقات)، وإعلان التحديثات. بعد أي تغيير: "نشر قائمة الحالة" ثم رفع `keys/feed.txt` إلى `mizan-updates/feed.txt`.

## إصدار نسخة جديدة
صاحب المشروع على الموبايل غالباً، فـ **Claude بيعمل النشر كامل لحالو**:
1. ارفع رقم `version` في `package.json` وادفع للفرع.
2. شغّل `scripts/publish-release.sh release-notes.md`: بيبني ملف التنصيب هون (عبر wine) وبيدفعه على فرع مؤقت `upload/<النسخة>` بـ `mizan-updates`، والـ workflow هناك (`.github/workflows/release.yml`) بيعمل Release `v<النسخة>` وبيحذف الفرع. تأكد بـ `get_latest_release`.
3. رابط التحميل الثابت بيآشّر تلقائياً على آخر Release، والسكربت بيحدّث رقم النسخة بالموقع (`tools/version.txt`). الموقع بينتشر مع كل دفع على main عبر `.github/workflows/pages.yml` (مصدر Pages = GitHub Actions).
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

## تطبيق أندرويد (APK)
- نسخة مستقلة على الجوال (ما بتتصل بالكمبيوتر)، بنفس الميزات. البيانات محلية على الجوال (IndexedDB) ومشفّرة بنفس طريقة الكمبيوتر.
- نفس كود التخزين والترخيص والصلاحيات حرفياً: `src/mobile/shims/` بتعطيه نسخ صغيرة من `node:fs` (ملفات بالذاكرة محفوظة بـ IndexedDB) و`node:crypto` (noble). `src/mobile/host.ts` = «العملية الرئيسية» للموبايل. الواجهة بتعرف إنها موبايل بـ `IS_MOBILE` (`src/renderer/src/api.ts`)، وستايلات الموبايل بـ `mobile.css` تحت `body.mobile`.
- البناء: `npm run build:mobile` (vite.mobile.config.ts ← www ← `cap sync android`). بصمة الجوال بتنحسب من معرّف أندرويد، والترخيص بيتصدر من لوحة الإدارة متل الكمبيوتر.
- التجربة هون بالمتصفح بحجم موبايل: `MIZAN_TEST_BUILD=1 npx vite build -c vite.mobile.config.ts` ثم شغّل `tests/mobile/screens.mts` على سيرفر لـ www.
- **النشر**: `scripts/publish-android.sh` (GitHub Actions بيبني APK غير موقّع بفرع `apk/<النسخة>`، منوقّعه هون بـ `scripts/apk-signer/sign.sh`، ومنرفعه على Release النسخة بـ `mizan-updates`). رابط ثابت: https://github.com/Akyedgam3/mizan-updates/releases/latest/download/Wazn.apk
- **مفتاح التوقيع** `keys/wazn-android.jks` و`keys/wazn-android.properties` (مستثنى من git، نسخة عند صاحب المشروع). **لا تولّد مفتاحاً جديداً**: أندرويد بيرفض تحديث التطبيق إذا تغيّر المفتاح (الزبون لازم يحذف التطبيق ويخسر بياناته).
- التصميم (`mobile.css`): جوال أقل من 700px = أزرار تحت (`.bottom-nav` بـ App.tsx) + الجداول بطاقات (`mobile-tables.ts` بيحط `data-label` و`.m-cards`) + نقطة البيع والمطعم بتبويب المواد/السلة (`components/MobileCart.tsx`). تابلت عمودي 700–1023px = أزرار تحت وعمودين. تابلت عرضي 1024px+ = قائمة جانبية ثابتة.
- **الشكل والحركة (1.2.14)**: آخر جزء بـ `mobile.css` («تصميم عصري وأنميشن») كله تحت `body.mobile` فالكمبيوتر ما بيتأثر: شريط علوي متدرّج، شريط تنقل عايم بزجاج شفاف (`--bottom-nav` = المحجوز تحت، و`--nav-h` ارتفاع الشريط)، بطاقات أنعم، نوافذ بتطلع من تحت، ودخول تدريجي للشاشات والبطاقات (`--i` ترتيب الظهور). أنميشن فتح التطبيق بـ `src/mobile/intro.ts` + `intro.css` (بيتركّب قبل تحميل أي شي وبيتلاشى لما تجهز الواجهة، بحد أدنى 1.9 ثانية)؛ كله بيحترم `prefers-reduced-motion`.
- فروع `build/android-*` و`apk/*` مؤقتة للبناء؛ حذفها من الجلسة مرفوض أحياناً وما بيضر.
- رقم نسخة التطبيق = رقم `package.json` (نفس نسخة الكمبيوتر)، وversionCode محسوب منه بـ `android/app/build.gradle`.

## الاتصال عن بعد (خدمة إضافية مدفوعة، اختيارية)
- جوال بالبيت بيشتغل على بيانات المحل عبر الإنترنت. **مش إجبارية**: بتنفتح لكل زبون من لوحة الإدارة (خانة «الاتصال عن بعد» ← `cloud: true` بقائمة الحالة)، وبعدها نشر `feed.txt`. بدونها تبويب الإعدادات بيعرض «تواصل معنا» بس (بدون أرقام ولا أسعار)، ومكتبة Firebase ما بتنحمّل أصلاً.
- الجهاز الرئيسي (كمبيوتر أو جوال) = اللي عليه البيانات: الإعدادات ← الاتصال عن بعد ← تفعيل ← رمز + QR. الجوال البعيد: «اتصال عن بعد» بشاشة البداية أو شاشة القفل (ما بيحتاج ترخيص، بيشتغل بترخيص المحل). حد الأجهزة البعيدة `max(2, devices-1)` (`CLOUD_MIN_DEVICES`).
- Firestore بمشروع `wazn-5d0f2` (نفس مشروع التقييمات) كصندوق بريد: `rooms/{room}/{events|meta|req|res|snap}/{id}`. رمز الاتصال (20 بايت) بيطلع منه اسم الغرفة ومفتاح AES-GCM؛ كل شي مشفّر ومضغوط (`src/cloud/seal.ts`) والسحابة ما بتشوف شي. كلمات السر بتتحقق على الجهاز الرئيسي، والتنفيذ بنفس `execute` والصلاحيات (`src/app/cloud-sessions.ts`).
- **كمبيوتر بعيد** (من 1.2.22): نفس الجوال البعيد بس على كمبيوتر: «اتصال عن بعد» بشاشة البداية أو القفل. الاتصال بالعملية الرئيسية (`cloud:connect` بـ `src/main/index.ts` و`CloudBackend` بـ `backend.ts`)؛ firebase بينضغط جوّا `out/main` (devDependency). المحاكي بالعملية الرئيسية من `WAZN_CLOUD_EMULATOR`.
- **بعد أول مرة بيكفي كلمة السر**: الشبكة المحلية (`lastRemote` فيه رمز الربط واسم المستخدم ومعرّف الشركة) والاتصال عن بعد (`lastCloud`). بالشبكة المحلية الجهاز الفرعي بيلاقي الرئيسي لحالو (UDP بث على 47101، `discoverHosts` بـ `src/app/lan.ts`)، وإذا تغيّر عنوان الجهاز الرئيسي بيلاقيه بمعرّف الشركة.
- الكود: `src/cloud/` (host, client, transport, firestore)، بالكمبيوتر الاتصال بيشتغل بالواجهة (`renderer/src/cloud/useCloudHost.ts`) والتنفيذ بالعملية الرئيسية عبر `cloud:host*`. الجوال البعيد بـ `src/mobile/host.ts` (`cloud:connect`).
- قواعد Firestore بـ `mizan-updates/firestore.rules` (التقييمات + rooms) — أي تعديل لازم ينلصق بـ Firebase Console ← Firestore ← Rules.
- **نسخة الويب للآيفون** (اتصال عن بعد بس، بدون بيانات محلية ولا ترخيص): نفس بناء الموبايل بـ `WAZN_WEB=1` (`npm run build:web` ← `web-dist/`، والواجهة بتعرفها بـ `IS_WEB`: شاشة `cloud/WebConnect.tsx` بدل البداية/القفل). بتنرفع نسخ `web-dist/*` لـ `mizan-updates/app/` (https://waznsy.com/app/ — الدومين `waznsy.com` مربوط بـ GitHub Pages من هوستنجر، والرابط القديم github.io بيحوّل عليه). رابط QR (`cloudCodeLink`) = `https://waznsy.com/app/#c=<الرمز>` من 1.2.16: كاميرا الآيفون بتفتحه بسفاري والرمز معبّى، وتطبيق أندرويد بيقبله (والقديم `wazn://connect/` كمان). إذا تغيّر الدومين غيّر `CLOUD_WEB_APP` بـ `src/cloud/code.ts`. بعد أي تعديل بالواجهة أعد بناء الويب وارفعه مع النسخة.
- الاختبارات: `tests/cloud.test.ts` (بالذاكرة). مع المحاكي (`npx firebase emulators:start --only firestore` بمجلد فيه firebase.json والقواعد، بورت 8085): `FIRESTORE_EMULATOR=127.0.0.1:8085` لـ `tests/cloud-firestore.test.ts` و`tests/e2e/cloud.e2e.ts`، و`tests/mobile/cloud.mts` (جوالين بالمتصفح)، و`tests/mobile/cloud-web.mts` (آيفون بنسخة الويب: www على 8790 وweb-dist على 8791).

## الفيديوهات
- أدوات صناعة الفيديوهات في `marketing/video/` (اقرأ README هناك). الأسلوب: لقطات حقيقية من البرنامج عبر Playwright + كاميرا وتأشيرات تلقائية + موسيقى مولّدة + صوت من صاحب المشروع.
- الإعلان (`ad`) يذكر الرقم القديم 981 **بالصوت** — يحتاج تسجيل جملة الرقم من جديد قبل نشره.

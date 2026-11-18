# وزن على Google Play — كل شي لازم ينحط بـ Play Console

الملفات:
- `Wazn-play-<النسخة>.aab` — الملف اللي بينرفع (بيطلع من CI بفرع `apk/<النسخة>` باسم `Wazn-play-unsigned.aab`، وبيتوقّع بـ `scripts/apk-signer/sign-aab.sh`).
- `out/icon-512.png` — أيقونة التطبيق.
- `out/feature-graphic-1024x500.png` — صورة الواجهة.
- `out/screenshot-1..6.png` — لقطات الجوال (1080×1920).
- لتجديد الصور: `npx tsx tests/mobile/screens.mts marketing/play-store/raw 540x960 s` (على www بـ 8790) ثم `node marketing/play-store/build.mjs`.

## الفرق بين نسخة الموقع ونسخة Play
| | الموقع (`direct`، APK) | Google Play (`play`، AAB) |
|---|---|---|
| التحديث | التطبيق بينزّل التحديث وبينصّبه لحالو | من Google Play بس (سياسة غوغل بتمنع التحديث الذاتي) |
| إذن `REQUEST_INSTALL_PACKAGES` | موجود | **مش موجود** |
| زر «تحديث» | تنزيل وتنصيب | بيفتح صفحة وزن بـ Play |

نفس اسم الحزمة `com.waznsy.wazn` ونفس المفتاح، فالنسختين بيتحدّثوا فوق بعض.

## 1) إنشاء التطبيق
- الاسم: **وزن - محاسبة ونقطة بيع**
- اللغة الافتراضية: العربية
- تطبيق (App)، مجاني (Free)

## 2) مفتاح التوقيع (مهم جداً، مرة وحدة)
بـ «App integrity ← App signing» اختار **Use a different key ← Export and upload a key from Java keystore**.
غوغل بتعطي ملف «encryption public key» (عام، مش سري): ابعته لـ Claude، وهو بيطلع ملف `output.zip` من مفتاح وزن (بأداة pepk) لترفعه.
هيك تطبيق Play وتطبيق الموقع نفس التوقيع، والزبون اللي منصّب من الموقع بيقدر يتحدّث من Play بدون ما يحذف التطبيق ويخسر بياناته.
(إذا اخترت «Google-generated key» بيمشي الحال، بس اللي منصّب من الموقع لازم ياخد نسخة احتياطية ويحذف التطبيق قبل ما ينزّله من Play.)

## 3) Store listing
**الوصف القصير (80 حرف):**
> محاسبة ونقطة بيع لمحلك: فواتير، مخزون، ديون وأرباح، بالليرة والدولار وبدون نت

**الوصف الكامل:**
> وزن برنامج محاسبة وإدارة محلات عربي، بيشتغل على جوالك بدون إنترنت.
>
> • نقطة بيع سريعة بالباركود (كاميرا الجوال أو قارئ باركود)
> • فواتير مبيع وشراء ومرتجعات، وطباعة على طابعة حرارية أو PDF، ومشاركة الفاتورة عالواتساب
> • المخزون: المواد والأصناف والكراتين، الجرد والتالف، وتنبيه النواقص
> • الديون: مين عليه وقديش ومن أيمتى، وكشف حساب لكل زبون ومورد
> • الأرباح: ربح كل فاتورة وكل يوم، وقائمة الدخل وقيمة البضاعة
> • الليرة والدولار وأسعار الصرف
> • مستخدمين وصلاحيات: كل موظف بيشوف بس اللي بتسمحله فيه
> • أكتر من 25 مجال: سوبرماركت، مطاعم وطاولات، صيدليات، موبايلات، ألبسة، خياطة، قطع سيارات، مواد بناء، فروج، حلويات…
> • بياناتك على جهازك ومشفّرة بكلمة سرك، مع نسخ احتياطية
> • الاتصال عن بعد (اختياري): تابع محلك من البيت، والبيانات مشفّرة بين أجهزتك
>
> التطبيق بيحتاج كود تفعيل من وزن أو من أحد وكلائنا. للتفاصيل: waznsy.com

- الفئة: **Business**
- الإيميل: info@waznsy.com — الموقع: https://waznsy.com
- سياسة الخصوصية: **https://waznsy.com/privacy.html** (فيها قسم لتطبيق أندرويد)

## 4) App content
**Privacy policy:** https://waznsy.com/privacy.html

**Ads:** No, the app does not contain ads.

**App access → All or some functionality is restricted → Add instructions:**
> The app needs an activation code. Use this test code on the first screen ("كود التفعيل"): `XXXX-XXXX-XXXX-XXXX`
> Then tap "شركة جديدة" (New company), choose any business type, enter any name and a password (6+ characters), and tick "عبّي بيانات تجريبية" to load demo data.

(اعمل من لوحة الإدارة «كرت» سنوي باسم Google Review وحط كوده مكان XXXX. الكرت بياخده أول جهاز + جوال، فإذا غوغل جرّبت على أكتر من جهاز اعمل كرتين أو تلاتة وحطهن كلهن.)

**Content rating:** Category «Utility, Productivity, Communication, or Other» — جاوب No على كل الأسئلة (ما في عنف، ولا محتوى للكبار، ولا تواصل بين المستخدمين، ولا مقامرة). النتيجة: Everyone / 3+.

**Target audience:** 18+ (برنامج للمحلات). ما بيستهدف الأطفال.

**News app:** No. **COVID-19 tracing:** No. **Government app:** No.

**Financial features:** «My app doesn't provide any financial features» (محاسبة وفواتير للمحل، مش بنك ولا قروض ولا تحويل أموال).

**Health:** No.

### Data safety
- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **Yes** (info@waznsy.com — وبيانات المحل نفسها على الجهاز)

| نوع البيانات | Collected | Shared | Optional? | الغرض |
|---|---|---|---|---|
| Device or other IDs | Yes | No | Required | App functionality (تفعيل الرخصة على هالجهاز) + Fraud prevention, security |
| Photos and videos / Camera | **No** (الكاميرا للباركود بس، ما بتنحفظ ولا بتنبعت) | | | |
| Financial info / Purchase history / Contacts / Location / Messages | **No** | | | |

ملاحظات:
- بيانات المحل (فواتير، زباين، مخزون) بتضل على الجهاز ومشفّرة، وما بتوصلنا: هي مش «collected» حسب تعريف غوغل.
- الاتصال عن بعد مشفّر طرف لطرف (غوغل ولا نحنا منقدر نقراه)، فكمان مش «collected».
- إذا سألت عن SDKs: Firebase Firestore (للاتصال عن بعد، مشفّر)، ML Kit Barcode (على الجهاز، بدون إرسال صور).

## 5) الإصدار
- Testing ← Internal testing أول (لحالك وكم رقم)، ارفع الـ AAB، وجرّب.
- بعدين Production. غوغل بتراجع بين يوم و7 أيام لأول مرة.
- **حسابات المطورين الشخصية الجديدة** لازم تعمل Closed testing مع 12 مختبر لمدة 14 يوم قبل Production.

## 6) شغلات لازم تعرفها
- **الدفع:** غوغل بتطلب إنو أي شي مدفوع جوّا التطبيق يكون عن طريقها. وزن ما فيه أي شراء ولا أسعار ولا روابط للدفع جوّا التطبيق (التفعيل بكود بيجيبه الزبون من برّا، متل تطبيقات الشركات اللي بتشتغل بحساب)، وهاد المسموح. لا تحط أسعار أو «اشتري الآن» بالوصف ولا بالصور.
- **كل تحديث** لازم يكون رقمه أكبر (versionCode بيطلع لحاله من رقم النسخة: 1.2.87 ← 10287).
- **الأرقام:** متل الموقع، الأرقام والأسعار ما بتنحط جوّا التطبيق. بالمتجر حطينا الإيميل والموقع.

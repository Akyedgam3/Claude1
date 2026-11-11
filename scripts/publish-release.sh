#!/bin/bash
# يبني ملف التنصيب لويندوز وينشره كـ Release على Akyedgam3/mizan-updates.
# الاستعمال: scripts/publish-release.sh [ملف_ملاحظات.md]
# النسخة من package.json. يحتاج wine (بينزّله لحالو على أوبونتو إذا ناقص).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$(pwd)
VERSION=$(node -p "require('./package.json').version")
NOTES=${1:-}
UPDATES=${UPDATES_DIR:-/home/user/mizan-updates}

if ! command -v wine >/dev/null || ! dpkg -s wine32:i386 >/dev/null 2>&1; then
  echo "تنزيل wine..."
  dpkg --add-architecture i386
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wine64 wine wine32:i386 >/dev/null
fi

# مفتاح غوغل درايف (مستثنى من git) لازم يكون موجود، وإلا النسخ على درايف ما بيشتغل بالنسخة المنشورة
[ -s keys/gdrive-client.json ] || { echo "خطأ: keys/gdrive-client.json ناقص (سر Google Drive). اطلبه من صاحب المشروع قبل النشر."; exit 1; }
rm -rf dist dist32 out
npm run build >/dev/null
# نسخة البيع ما لازم يكون فيها مفتاح التطوير أبداً
if grep -q MCowBQYDK2VwAyEAWu46 out/main/index.js; then echo "خطأ: مفتاح التطوير موجود بالنسخة!"; exit 1; fi
WINEDEBUG=-all CSC_IDENTITY_AUTO_DISCOVERY=false xvfb-run --auto-servernum npx electron-builder --win nsis --x64 --publish never >/dev/null
ls -la dist/Wazn-Setup.exe
# نسخة 32 بت للأجهزة القديمة (ويندوز 10 32 بت)، نفس الكود بس Electron ia32
rm -rf dist32
WINEDEBUG=-all CSC_IDENTITY_AUTO_DISCOVERY=false xvfb-run --auto-servernum npx electron-builder --win nsis --ia32 --publish never -c.directories.output=dist32 '-c.nsis.artifactName=Wazn-Setup-32bit.${ext}' >/dev/null
ls -la dist32/Wazn-Setup-32bit.exe

# فرع مؤقت فوق main فيه الملف؛ الـ workflow بالمستودع العام بينشره وبيحذف الفرع
[ -d "$UPDATES/.git" ] || git clone --depth 1 https://github.com/Akyedgam3/mizan-updates "$UPDATES"
cd "$UPDATES"
git fetch -q --depth 1 origin main && git checkout -q -B upload-tmp FETCH_HEAD
mkdir -p release
cp "$OLDPWD/dist/Wazn-Setup.exe" release/
cp "$OLDPWD/dist32/Wazn-Setup-32bit.exe" release/
# نسخ بالأسماء القديمة: روابط ميزان (1.2.4–1.2.8) ومعيار (1.2.3) بتضل شغالة
cp "$OLDPWD/dist/Wazn-Setup.exe" release/Mizan-Setup.exe
# نسخة باسم Miyar-Setup.exe كمان: روابط نسخة 1.2.3 (معيار) بتضل شغالة
cp "$OLDPWD/dist/Wazn-Setup.exe" release/Miyar-Setup.exe
if [ -n "$NOTES" ]; then cp "$NOTES" release/NOTES.md; else echo "وزن $VERSION" > release/NOTES.md; fi
git add release
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" commit -q -m "Upload installer $VERSION"
git push -q origin "+upload-tmp:refs/heads/upload/$VERSION"
git checkout -q main 2>/dev/null || git checkout -q -B main FETCH_HEAD
git branch -D -q upload-tmp
# رقم النسخة بالموقع ("النسخة X متوفرة الآن"): الموقع بينتشر لحالو مع الدفع (workflow: Deploy site)
git fetch -q --depth 50 origin main && git merge -q --ff-only FETCH_HEAD
echo "$VERSION" > tools/version.txt
python3 tools/build_site.py >/dev/null
# نسخة الويب للآيفون (الاتصال عن بعد) بنفس واجهة هالنسخة ← app/
(cd "$REPO" && npm run build:web >/dev/null)
if grep -rq MCowBQYDK2VwAyEAWu46 "$REPO/web-dist"; then echo "خطأ: مفتاح التطوير موجود بنسخة الويب!"; exit 1; fi
rm -rf app && cp -r "$REPO/web-dist" app
git add -A app
git add tools/version.txt ./*.html
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" commit -q -m "الموقع: النسخة $VERSION" || true
git push -q origin main
echo "انرفع. بعد دقيقة: https://github.com/Akyedgam3/mizan-updates/releases/tag/v$VERSION"

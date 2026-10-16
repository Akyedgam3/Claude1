#!/bin/bash
# يبني ملف التنصيب لويندوز وينشره كـ Release على Akyedgam3/mizan-updates.
# الاستعمال: scripts/publish-release.sh [ملف_ملاحظات.md]
# النسخة من package.json. يحتاج wine (بينزّله لحالو على أوبونتو إذا ناقص).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NOTES=${1:-}
UPDATES=${UPDATES_DIR:-/home/user/mizan-updates}

if ! command -v wine >/dev/null || ! dpkg -s wine32:i386 >/dev/null 2>&1; then
  echo "تنزيل wine..."
  dpkg --add-architecture i386
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wine64 wine wine32:i386 >/dev/null
fi

rm -rf dist out
npm run build >/dev/null
# نسخة البيع ما لازم يكون فيها مفتاح التطوير أبداً
if grep -q MCowBQYDK2VwAyEAWu46 out/main/index.js; then echo "خطأ: مفتاح التطوير موجود بالنسخة!"; exit 1; fi
WINEDEBUG=-all CSC_IDENTITY_AUTO_DISCOVERY=false xvfb-run --auto-servernum npx electron-builder --win nsis --x64 --publish never >/dev/null
ls -la dist/Mizan-Setup.exe

# فرع مؤقت فوق main فيه الملف؛ الـ workflow بالمستودع العام بينشره وبيحذف الفرع
[ -d "$UPDATES/.git" ] || git clone --depth 1 https://github.com/Akyedgam3/mizan-updates "$UPDATES"
cd "$UPDATES"
git fetch -q --depth 1 origin main && git checkout -q -B upload-tmp FETCH_HEAD
mkdir -p release
cp "$OLDPWD/dist/Mizan-Setup.exe" release/
# نسخة باسم Miyar-Setup.exe كمان: روابط نسخة 1.2.3 (معيار) بتضل شغالة
cp "$OLDPWD/dist/Mizan-Setup.exe" release/Miyar-Setup.exe
if [ -n "$NOTES" ]; then cp "$NOTES" release/NOTES.md; else echo "ميزان $VERSION" > release/NOTES.md; fi
git add release
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" commit -q -m "Upload installer $VERSION"
git push -q origin "+upload-tmp:refs/heads/upload/$VERSION"
git checkout -q main 2>/dev/null || git checkout -q -B main FETCH_HEAD
git branch -D -q upload-tmp
# رقم النسخة بالموقع ("النسخة X متوفرة الآن"): الموقع بينتشر لحالو مع الدفع (workflow: Deploy site)
git pull -q origin main
echo "$VERSION" > tools/version.txt
python3 tools/build_site.py >/dev/null
git add tools/version.txt ./*.html
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" commit -q -m "الموقع: النسخة $VERSION" || true
git push -q origin main
echo "انرفع. بعد دقيقة: https://github.com/Akyedgam3/mizan-updates/releases/tag/v$VERSION"

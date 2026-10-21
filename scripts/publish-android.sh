#!/bin/bash
# ينشر تطبيق أندرويد (Wazn.apk) على Release النسخة الحالية بـ Akyedgam3/mizan-updates.
# 1) GitHub Actions بيبني APK غير موقّع (فرع build/android-<النسخة>) وبيحطه بفرع apk/<النسخة>
# 2) هون منوقّعه بمفتاح keys/wazn-android.jks (scripts/apk-signer/sign.sh)
# 3) منرفعه على فرع upload/<النسخة> بمستودع التحديثات، والـ workflow هناك بيضيفه للـ Release
# الاستعمال: scripts/publish-android.sh [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
UPDATES=${UPDATES_DIR:-/home/user/mizan-updates}
OUT=$(mktemp -d)
SHA=$(git rev-parse HEAD)

if [ "${1:-}" != "--no-build" ]; then
  git push -q -f origin "HEAD:refs/heads/build/android-$VERSION"
  echo "عم يبني على GitHub..."
  sleep 20
  for i in $(seq 1 60); do
    r=$(gh api "repos/Akyedgam3/Claude1/actions/runs?branch=build/android-$VERSION&per_page=1" --jq '.workflow_runs[0]|.head_sha+" "+.status+" "+(.conclusion//"")')
    case "$r" in "$SHA completed success") break ;; "$SHA completed "*) echo "فشل البناء: $r"; exit 1 ;; esac
    sleep 20
  done
  git push -q origin --delete "build/android-$VERSION" || true
fi

git fetch -q origin "apk/$VERSION"
git show "FETCH_HEAD:Wazn-unsigned.apk" > "$OUT/Wazn-unsigned.apk"
scripts/apk-signer/sign.sh "$OUT/Wazn-unsigned.apk" "$OUT/Wazn.apk"

cd "$UPDATES"
git fetch -q --depth 1 origin main && git checkout -q -B upload-tmp FETCH_HEAD
mkdir -p release
cp "$OUT/Wazn.apk" release/Wazn.apk
echo "وزن $VERSION" > release/NOTES.md
git add release
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" commit -q -m "Upload Android app $VERSION"
git push -q origin "+upload-tmp:refs/heads/upload/$VERSION"
git checkout -q main 2>/dev/null || git checkout -q -B main FETCH_HEAD
git branch -D -q upload-tmp
rm -rf "$OUT"
echo "انرفع التطبيق: https://github.com/Akyedgam3/mizan-updates/releases/latest/download/Wazn.apk"

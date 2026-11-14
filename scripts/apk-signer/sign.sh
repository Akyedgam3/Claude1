#!/bin/bash
# يوقّع APK وزن: scripts/apk-signer/sign.sh in.apk out.apk
# المفتاح: keys/wazn-android.jks وكلمة سره بـ keys/wazn-android.properties (عند صاحب المشروع، مستثنى من git).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
props="$root/keys/wazn-android.properties"
if [ ! -f "$root/keys/wazn-android.jks" ]; then
  # بعد إعادة الحاوية: المفتاح بيرجع من النسخة المشفّرة بالمستودع بكلمة الاسترجاع (عند صاحب المشروع)
  if [ -f "$root/android/signing/wazn-android.enc" ] && [ -n "${WAZN_KEY_PHRASE:-}" ]; then "$here/restore-key.sh"
  else echo "ما في مفتاح توقيع: keys/wazn-android.jks. رجّعه بـ: WAZN_KEY_PHRASE='...' scripts/apk-signer/restore-key.sh (اطلب كلمة الاسترجاع من صاحب المشروع، ولا تولّد مفتاح جديد)"; exit 1; fi
fi
jar="$here/.cache/apksig-2.3.0.jar"
if [ ! -f "$jar" ]; then
  mkdir -p "$here/.cache"
  curl -sSfL -o "$jar" https://repo1.maven.org/maven2/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar
fi
[ -f "$here/.cache/SignApk.class" ] && [ "$here/.cache/SignApk.class" -nt "$here/SignApk.java" ] || javac -cp "$jar" -d "$here/.cache" "$here/SignApk.java"
pass="$(sed -n 's/^storePassword=//p' "$props")"
alias="$(sed -n 's/^keyAlias=//p' "$props")"
# apksig القديمة بتقرأ صفوف داخلية من جافا وقت التحميل
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$jar:$here/.cache" SignApk "$1" "$2" "$root/keys/wazn-android.jks" "$pass" "$alias"

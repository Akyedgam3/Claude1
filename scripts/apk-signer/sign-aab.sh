#!/bin/bash
# يوقّع ملف Google Play (AAB) بنفس مفتاح وزن: scripts/apk-signer/sign-aab.sh in.aab out.aab
# بـ Google Play هالمفتاح بيكون «مفتاح الرفع» (upload key)، أو مفتاح التطبيق نفسه إذا انرفع لـ Play App Signing.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
props="$root/keys/wazn-android.properties"
if [ ! -f "$root/keys/wazn-android.jks" ]; then
  if [ -f "$root/android/signing/wazn-android.enc" ] && [ -n "${WAZN_KEY_PHRASE:-}" ]; then "$here/restore-key.sh"
  else echo "ما في مفتاح توقيع: keys/wazn-android.jks (WAZN_KEY_PHRASE='...' scripts/apk-signer/restore-key.sh)"; exit 1; fi
fi
pass="$(sed -n 's/^storePassword=//p' "$props")"
keypass="$(sed -n 's/^keyPassword=//p' "$props")"
alias="$(sed -n 's/^keyAlias=//p' "$props")"
cp "$1" "$2"
jarsigner -keystore "$root/keys/wazn-android.jks" -storepass "$pass" -keypass "${keypass:-$pass}" -sigalg SHA256withRSA -digestalg SHA-256 "$2" "$alias" >/dev/null
jarsigner -verify "$2" >/dev/null && echo "signed: $2"

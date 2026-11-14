#!/bin/bash
# نسخة مشفّرة من مفتاح توقيع أندرويد جوّا المستودع، حتى ما يضيع إذا انعادت الحاوية.
# الاستعمال: WAZN_KEY_PHRASE='كلمة الاسترجاع' scripts/apk-signer/backup-key.sh
# بيشفّر keys/wazn-android.jks و keys/wazn-android.properties (AES-256، PBKDF2) لـ android/signing/wazn-android.enc
# كلمة الاسترجاع عند صاحب المشروع بس (مش بـ git). بلاها النسخة ما بتنفتح.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${WAZN_KEY_PHRASE:?لازم WAZN_KEY_PHRASE (كلمة الاسترجاع)}"
[ -s keys/wazn-android.jks ] && [ -s keys/wazn-android.properties ] || { echo "ما في keys/wazn-android.jks أو .properties"; exit 1; }
mkdir -p android/signing
tar -C keys -cf - wazn-android.jks wazn-android.properties |
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:WAZN_KEY_PHRASE -out android/signing/wazn-android.enc
# تأكد إنها بتنفتح وبتطابق
tmp=$(mktemp -d)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:WAZN_KEY_PHRASE -in android/signing/wazn-android.enc | tar -C "$tmp" -xf -
cmp -s "$tmp/wazn-android.jks" keys/wazn-android.jks && cmp -s "$tmp/wazn-android.properties" keys/wazn-android.properties
rm -rf "$tmp"
echo "انحفظت النسخة المشفّرة: android/signing/wazn-android.enc (اعمل commit و push)"

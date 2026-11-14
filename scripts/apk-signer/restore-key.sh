#!/bin/bash
# بيرجّع مفتاح توقيع أندرويد من النسخة المشفّرة بالمستودع لـ keys/ (بعد إعادة الحاوية).
# الاستعمال: WAZN_KEY_PHRASE='كلمة الاسترجاع من صاحب المشروع' scripts/apk-signer/restore-key.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${WAZN_KEY_PHRASE:?لازم WAZN_KEY_PHRASE (كلمة الاسترجاع، عند صاحب المشروع)}"
[ -f keys/wazn-android.jks ] && { echo "keys/wazn-android.jks موجود، ما غيّرت شي"; exit 0; }
mkdir -p keys
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:WAZN_KEY_PHRASE -in android/signing/wazn-android.enc | tar -C keys -xf -
echo "رجع المفتاح: keys/wazn-android.jks"

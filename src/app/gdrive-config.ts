// معرّف تطبيق Google (OAuth) للنسخ على Google Drive.
// بينعمل من Google Cloud Console بمشروع wazn-5d0f2: APIs & Services ← Credentials ← OAuth client ID ← Desktop app.
// «السر» تبع تطبيقات الكمبيوتر مش سري فعلياً (Google بتقول هيك)، والحماية من PKCE ومن صلاحية drive.file.
// فاضي = الميزة مخفية بالبرنامج. للتجربة: WAZN_GDRIVE_CLIENT_ID و WAZN_GDRIVE_CLIENT_SECRET.
export const GDRIVE_DESKTOP = {
  clientId: '925225799887-5g26hf113bdnnfm7v3llgcduj83mfhpd.apps.googleusercontent.com',
  clientSecret: '',
};

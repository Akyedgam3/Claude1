// المفتاح العام لترخيص وزن (ميزان سابقاً). المفتاح الخاص المقابل عند البائع فقط (keys/license-private.pem، خارج git).
// نسخة الاختبارات الآلية فقط (MIZAN_TEST_BUILD=1 وقت البناء) بتستعمل مفتاح التطوير،
// والنسخة اللي بتنباع ما فيها إلا المفتاح الحقيقي.
declare const __MIZAN_TEST_BUILD__: boolean | undefined;

/** نسخة مبنية للاختبارات الآلية (مش للبيع). */
export const IS_TEST_BUILD = typeof __MIZAN_TEST_BUILD__ !== 'undefined' && __MIZAN_TEST_BUILD__ === true;

const REAL_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABI3KNWfoltibkQXBfnr61y2OnggBkep6rek4LOfnTRk=
-----END PUBLIC KEY-----
`;

const DEV_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAWu46qBFRb4+Y4it3y1kwyZjs0oqTrj/5xwZTlcofAzo=
-----END PUBLIC KEY-----
`;

export const LICENSE_PUBLIC_KEY = IS_TEST_BUILD ? DEV_KEY : REAL_KEY;
export const IS_DEV_KEY = IS_TEST_BUILD;

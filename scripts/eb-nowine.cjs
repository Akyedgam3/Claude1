// electron-builder بدون wine لمرحلة «استخراج برنامج إزالة التنصيب» (NSIS):
// بيستعمل القارئ الداخلي (JavaScript) اللي بيستعملوه على ماك بدون wine.
// لزوم بيئات بتمنع wine (wine بيوقع). الاستعمال متل electron-builder: node scripts/eb-nowine.cjs --win nsis --x64 ...
const mv = require('app-builder-lib/out/util/macosVersion');
mv.isMacOsCatalina = () => true;
require('electron-builder/out/cli/cli.js');

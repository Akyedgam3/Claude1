// إصدار ترخيص لعميل:
//   npm run license:issue -- --customer "محل أبو أحمد" --machine XXXX-XXXX-XXXX-XXXX --plan annual [--devices 3]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { issueLicense, PLANS, type Plan } from '../src/license/license';

const { values } = parseArgs({
  options: {
    customer: { type: 'string' },
    machine: { type: 'string' },
    plan: { type: 'string' },
    devices: { type: 'string', default: '1' },
  },
});
const plan = values.plan as Plan;
if (!values.customer || !values.machine || !(plan in PLANS)) {
  console.error(`الاستخدام: --customer <الاسم> --machine <بصمة الجهاز> --plan <${Object.keys(PLANS).join('|')}> [--devices N]`);
  process.exit(1);
}
let keyFile = 'keys/license-private.pem';
if (!fs.existsSync(keyFile)) {
  keyFile = 'dev-keys/license-private.dev.pem';
  console.warn('تنبيه: يُستخدم مفتاح التطوير — هذا الترخيص للتجربة فقط.');
}
const key = issueLicense(
  { customer: values.customer, machineId: values.machine, plan, devices: Number(values.devices) },
  fs.readFileSync(keyFile, 'utf8'),
);
console.log(`${PLANS[plan].nameAr} — ${values.customer}\n${key}`);

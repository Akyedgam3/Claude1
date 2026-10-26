// سجل العملاء والتراخيص على جهازك — يبقى عندك فقط (مجلد keys/ مستثنى من git).
// المنطق كله بـ registry-core.ts (نفسه بلوحة الإدارة على النت).
import fs from 'node:fs';
import path from 'node:path';
import { RegistryCore, type RegistryFile } from './registry-core';

export * from './registry-core';

export class Registry extends RegistryCore {
  constructor(
    private readonly file: string,
    privateKey: string,
  ) {
    super(fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as RegistryFile) : { customers: [] }, privateKey, (data) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    });
  }

  /** يكتب قائمة الحالة الموقّعة لتُرفع على الإنترنت. */
  publish(outFile: string): { file: string; text: string } {
    const { text } = this.buildFeed();
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, text);
    return { file: outFile, text };
  }
}

// node:os للموبايل: الكود المشترك بيحتاج اسم الجهاز بس (للقفل وبصمة الكمبيوتر اللي ما منستعملها هون)
export const hostname = () => 'android';
export const platform = () => 'android';
export const arch = () => 'arm64';
export const cpus = () => [] as { model: string }[];
export const totalmem = () => 0;
export const networkInterfaces = () => ({});
export const tmpdir = () => '/data/tmp';
export default { hostname, platform, arch, cpus, totalmem, networkInterfaces, tmpdir };

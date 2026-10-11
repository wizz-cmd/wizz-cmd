import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
for (const [label, args] of [['default headless', []], ['swiftshader GL', ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-accelerated-2d-canvas']], ['gl=angle swiftshader-webgl', ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']]]) {
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const cdp = await browser.newBrowserCDPSession();
  const info = await cdp.send('SystemInfo.getInfo');
  console.log(label, JSON.stringify(info.gpu.featureStatus), (info.gpu.devices || []).map((d) => d.vendorString + '/' + d.deviceString).join(','));
  await browser.close();
}

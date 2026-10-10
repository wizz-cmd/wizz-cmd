import { boot } from './qa_mechanics_lib.mjs';
const { t, g, ev } = await boot({ clear: true });
console.log(await ev((H) => ({ p: H.P(0).x, y: H.P(0).y, ph: H.S().phase, en: H.S().enemies.length })));
console.log(await ev((H, a) => a + 1, 5));
console.log(t.errors);
await t.close();

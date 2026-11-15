import { escapeHtml as esc } from './markdown.mjs';

// Shared, authentic Native app capture. The app itself currently uses a light UI.
export function appPreview(locale='en',{eager=false}={}) {
 const ar=locale==='ar';
 const alt=ar?'واجهة توظيف: دليل الشركات والمتابعة وتحديثات الوظائف وتقدم الملفات المهنية':'Tawdheef native app: company directory, monitoring, job updates and career profile progress';
 const caption=ar?'التطبيق الفعلي ببيانات شركات عامة. لم يبدأ أي تشغيل ولم تُرسل طلبات.':'Actual app with public company research. No Runs started or applications sent.';
 return `<figure class="native-app-preview" id="native-app-preview"><div class="tour-frame" dir="ltr"><picture><source media="(max-width:600px)" srcset="/site-assets/walkthrough/native-mobile-light.jpg" width="390" height="820"/><img src="/site-assets/walkthrough/native-desktop-light.jpg" width="1100" height="760" alt="${esc(alt)}" decoding="async" loading="${eager?'eager':'lazy'}" ${eager?'fetchpriority="high"':''}/></picture></div><figcaption>${esc(caption)}</figcaption></figure>`;
}
export function walkthrough(locale='en'){return `<section class="product-tour" id="walkthrough" aria-label="${locale==='ar'?'واجهة توظيف':'Tawdheef app preview'}">${appPreview(locale,{eager:true})}</section>`;}
export function previewDisclosure(locale='en'){return `<details class="native-preview-disclosure"><summary>${locale==='ar'?'شاهد التطبيق الفعلي':'See the actual app'}</summary>${appPreview(locale)}</details>`;}

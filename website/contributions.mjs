import { escapeHtml as esc } from './markdown.mjs';

const copy = {
  en: {
    title: 'Help build Tawdheef.',
    body: 'Fix a detail, add a company, share a directory or improve the app. Any country is welcome.',
    paths: [
      ['Fix or complete a record', 'Correct a link or add published careers and contact details.', 'Suggest a correction', 'directory-data.yml'],
      ['Add a company', 'Share an organisation and its official website or careers page.', 'Add a company', 'add-company.yml'],
      ['Contribute a directory', 'Share researched companies for a country, city or industry.', 'Suggest a directory', 'new-country-pack.yml'],
      ['Improve the app or guides', 'Fix a bug, improve Arabic or English instructions, or help build a feature.', 'Contribute code or docs', null],
    ],
    noncoder: 'No coding needed to suggest company data. Include a public source and the date you checked it.',
    review: 'Suggestions are reviewed before merging. Updated packs are published in a release; download and import the update when you want it.',
    guide: 'Directory contribution guide', bug: 'Report a bug', feature: 'Suggest a feature',
    countryTitle: name => `Help improve the ${name} directory.`,
    countryBody: 'Found outdated details or a company we missed? Share a public source so the next person has a better starting point.',
    fix: 'Fix or add details', add: 'Add a company', more: 'Contribute another directory',
  },
  ar: {
    title: 'ساهم في تطوير Tawdheef.',
    body: 'صحّح معلومة، أضف شركة، شارك دليلًا أو حسّن التطبيق. المساهمات مرحّب بها من أي دولة.',
    paths: [
      ['صحّح سجلًا أو أكمل بياناته', 'صحّح رابطًا أو أضف معلومات توظيف وتواصل منشورة.', 'اقترح تصحيحًا', 'directory-data.yml'],
      ['أضف شركة', 'شارك اسم جهة ورابط موقعها الرسمي أو صفحة التوظيف.', 'أضف شركة', 'add-company.yml'],
      ['ساهم بدليل جديد', 'شارك بيانات موثّقة لشركات في دولة أو مدينة أو قطاع.', 'اقترح دليلًا', 'new-country-pack.yml'],
      ['حسّن التطبيق أو الأدلة', 'أصلح مشكلة، حسّن الشرح بالعربية أو الإنجليزية، أو ساعد في تطوير ميزة.', 'ساهم في الكود أو الشرح', null],
    ],
    noncoder: 'لا تحتاج إلى البرمجة لاقتراح بيانات الشركات. أرفق مصدرًا عامًا وتاريخ التحقق منه.',
    review: 'تُراجع الاقتراحات قبل دمجها. تُنشر الحزم المحدّثة ضمن إصدار جديد؛ نزّل التحديث واستورده عندما تريد.',
    guide: 'دليل المساهمة بالبيانات', bug: 'أبلغ عن مشكلة', feature: 'اقترح ميزة',
    countryTitle: name => `ساهم في تحسين دليل ${name}.`,
    countryBody: 'هل وجدت معلومة قديمة أو شركة غير موجودة؟ شارك مصدرًا عامًا ليستفيد منه الباحثون عن عمل.',
    fix: 'صحّح البيانات أو أكملها', add: 'أضف شركة', more: 'ساهم بدليل آخر',
  },
};

export function contributionIssue(repository, template, title) {
  const url = new URL(repository + '/issues/new');
  url.searchParams.set('template', template);
  if (title) url.searchParams.set('title', title);
  return url.href;
}

export function contributionSection({ repository, locale = 'en', pack = null, id = 'contribute' }) {
  const t = copy[locale];
  const issue = (template, title) => esc(contributionIssue(repository, template, title));
  const guide = esc(repository + '/blob/main/docs/DIRECTORY-CONTRIBUTING.md');
  if (pack) return `<section class="section contribution-section contribution-country" id="${esc(id)}" aria-labelledby="${esc(id)}-title"><h2 id="${esc(id)}-title">${esc(t.countryTitle(pack.name))}</h2><p>${esc(t.countryBody)}</p><div class="actions"><a class="button secondary" href="${issue('directory-data.yml', '[Directory] '+pack.name+': correction')}">${esc(t.fix)}</a><a class="button secondary" href="${issue('add-company.yml', '[Company] '+pack.name+': new organisation')}">${esc(t.add)}</a></div><p class="contribution-note">${esc(t.noncoder)}</p><p class="contribution-note">${esc(t.review)}</p><div class="contribution-links"><a href="${guide}">${esc(t.guide)}</a><a href="/directories/#contribute">${esc(t.more)}</a></div></section>`;
  return `<section class="section contribution-section" id="${esc(id)}" aria-labelledby="${esc(id)}-title"><h2 id="${esc(id)}-title">${esc(t.title)}</h2><p>${esc(t.body)}</p><div class="contribution-grid">${t.paths.map(([title, body, action, template])=>`<article><h3>${esc(title)}</h3><p>${esc(body)}</p><a href="${template ? issue(template) : esc(repository+'/blob/main/CONTRIBUTING.md#code-changes')}">${esc(action)}<span aria-hidden="true"> ${locale==='ar'?'←':'→'}</span></a></article>`).join('')}</div><p class="contribution-note">${esc(t.noncoder)}</p><p class="contribution-note">${esc(t.review)}</p><div class="contribution-links"><a href="${guide}">${esc(t.guide)}</a><a href="${issue('bug.yml')}">${esc(t.bug)}</a><a href="${issue('feature.yml')}">${esc(t.feature)}</a></div></section>`;
}

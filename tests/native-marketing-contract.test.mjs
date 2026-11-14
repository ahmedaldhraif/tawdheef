import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import en from '../website/i18n/skills-en.mjs';
import ar from '../website/i18n/skills-ar.mjs';

test('both setup overviews teach client-owned connections and the current source', () => {
  assert.match(en.start.body, /Connections/);
  assert.match(ar.start.body, /الاتصالات/);
  for (const dictionary of [en, ar]) {
    assert.match(dictionary.start.requirement, /v0\.1\.2/);
    assert.match(dictionary.start.nodeRequirement, /26 LTS/);
    assert.doesNotMatch(JSON.stringify(dictionary), /Check connections|--browser|verify:true/);
  }
  const config=JSON.parse(readFileSync(new URL('../website/config.json',import.meta.url),'utf8'));
  assert.equal(config.setupSource,'main');
});

test('active bilingual guides do not teach retired app-owned setup or recurring applications', () => {
  for (const folder of ['docs/guides/','docs/i18n/ar/guides/']) {
    for (const slug of ['use-the-skill','connect-your-agent','connect-your-cv','apply-to-jobs','replies-and-reports','troubleshoot','for-agents']) {
      const text=readFileSync(new URL('../'+folder+slug+'.md',import.meta.url),'utf8');
      assert.doesNotMatch(text,/Check connections|verify:true|--browser|Your CV → Tabbio|Apply to matching jobs|Monitor → Reports/);
    }
  }
});

test('both READMEs use the same brand GIF with dark and reduced-motion fallbacks', () => {
  for(const file of ['README.md','README.ar.md']) {
    const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.match(text,/prefers-reduced-motion/);
    assert.match(text,/prefers-color-scheme: dark/);
    assert.doesNotMatch(text,/marketing\/all-compact/);
    for(const path of ['wordmark-light.gif','wordmark-dark.gif','wordmark-light.png','wordmark-dark.png']) {
      assert.ok(text.includes('github-hero/'+path));
      const url=new URL('../public/brand/github-hero/'+path,import.meta.url);
      assert.ok(existsSync(url));
      assert.ok(readFileSync(url).length>1000);
    }
  }
});

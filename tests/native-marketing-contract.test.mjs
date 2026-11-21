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

test('GitHub identity GIFs contain the complete bilingual loop, not a truncated preview', () => {
  const folder = new URL('../public/brand/github-hero/', import.meta.url);
  const source = JSON.parse(readFileSync(new URL('sources.json', folder), 'utf8'));
  const themes = [];
  for (const theme of ['light', 'dark']) {
    const bytes = readFileSync(new URL(`wordmark-${theme}.gif`, folder));
    assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
    assert.equal(bytes.readUInt16LE(6), 800);
    assert.equal(bytes.readUInt16LE(8), 176);
    let offset = 13 + ((bytes[10] & 128) ? 3 * (2 << (bytes[10] & 7)) : 0);
    let frames = 0, duration = 0, delay = 0, ended = false;
    const subblocks = () => {
      for (;;) {
        assert.ok(offset < bytes.length, `${theme}: missing block terminator`);
        const size = bytes[offset++];
        if (!size) break;
        offset += size;
        assert.ok(offset <= bytes.length, `${theme}: truncated block`);
      }
    };
    while (offset < bytes.length) {
      const type = bytes[offset++];
      if (type === 0x3b) { ended = true; break; }
      if (type === 0x21) {
        const label = bytes[offset++];
        if (label === 0xf9) delay = bytes.readUInt16LE(offset + 2) * 10;
        subblocks();
      } else if (type === 0x2c) {
        const packed = bytes[offset + 8];
        offset += 9 + ((packed & 128) ? 3 * (2 << (packed & 7)) : 0);
        offset++; // LZW minimum code size
        subblocks(); frames++; duration += delay; delay = 0;
      } else assert.fail(`${theme}: unexpected GIF block ${type}`);
    }
    assert.ok(ended && offset === bytes.length, `${theme}: incomplete GIF`);
    assert.equal(frames, source.frames);
    assert.equal(duration, source.durationMs);
    assert.ok(duration > 6000, 'Both languages must have a full typing and hold interval.');
    themes.push(bytes);
  }
  assert.notDeepEqual(themes[0], themes[1]);
});

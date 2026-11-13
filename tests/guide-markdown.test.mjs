import test from'node:test';
import assert from'node:assert/strict';
import{inlineMarkdown,renderMarkdown}from'../website/markdown.mjs';
import{repositoryLinkResolver}from'../website/guides.mjs';

test('guide Markdown keeps code literal and escapes author HTML while preserving safe links',()=>{
 const result=renderMarkdown('# Guide\n\n## Run it\n\n<script>alert(1)</script> **Current CV** [Connect](/get-started/#cv)\n\n```sh\nnode cli.mjs --json \'{"value":"<tag>&"}\'\n```');
 assert.ok(!result.html.includes('<script>'));
 assert.ok(result.html.includes('&lt;script&gt;'));
 assert.ok(result.html.includes('<strong>Current CV</strong>'));
 assert.ok(result.html.includes('href="/get-started/#cv"'));
 assert.ok(result.html.includes('&lt;tag&gt;&amp;'));
 assert.equal(result.headings.length,1);
 assert.deepEqual(result.headings[0],{id:'run-it',title:'Run it',level:2});
 assert.throws(()=>inlineMarkdown('[unsafe](javascript:alert)'),/HTTPS URL/);
 assert.throws(()=>inlineMarkdown('![remote](https://example.org/tracker.png)'),/bundled/);
 assert.equal(inlineMarkdown('[`CLI`](https://example.org/)'),'<a href="https://example.org/"><code>CLI</code></a>');
});

test('the same guide links work in GitHub source and resolve to the corresponding website pages',()=>{
 const root='https://github.com/ahmedaldhraif/tawdheef';
 const resolveLink=repositoryLinkResolver({intendedRepository:root});
 const source='[Setup]('+root+'/blob/main/docs/FIRST-RUN.md#give-your-agent-one-setup-request) and [CV]('+root+'/blob/main/docs/guides/connect-your-cv.md)';
 const rendered=renderMarkdown(source,{resolveLink}).html;
 assert.ok(rendered.includes('href="/guides/use-the-skill/#agent"'));
 assert.ok(rendered.includes('href="/guides/connect-your-cv/"'));
 assert.equal(resolveLink('https://app.tabbio.com/?utm_source=tawdheef'),'https://app.tabbio.com/?utm_source=tawdheef');
 assert.equal(resolveLink(root+'/blob/main/docs/guides/README.md'),'/guides/');
 assert.equal(resolveLink(root+'/blob/main/docs/guides/get-started.md#cv'),'/guides/use-the-skill/#cv');
});

test('guide headings, copy targets, lists and widgets remain distinct',()=>{
 const result=renderMarkdown('# Title\n\n## Check\n\n1. Open **Connections**.\n2. Check your CV.\n\n{{setup-prompt}}\n\n## Check\n\n```\nfirst\n```\n\n```\nsecond\n```',{prefix:'fixture',widget:token=>token==='{{setup-prompt}}'?'<div id="canonical-prompt">Setup request</div>':null});
 assert.deepEqual(result.headings.map(item=>item.id),['check','check-2']);
 assert.equal((result.html.match(/<li>/g)||[]).length,2);
 assert.ok(result.html.includes('canonical-prompt'));
 const ids=[...result.html.matchAll(/<pre id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,2);
 assert.throws(()=>renderMarkdown('```sh\nno close'),/Close the code fence/);
});

test('Arabic headings preserve shared anchors and localized copy controls without changing commands',()=>{
 const root='https://github.com/ahmedaldhraif/tawdheef';
 const rendered=renderMarkdown('# دليل\n\n## اربط سيرتك {#cv}\n\n[الإعداد]('+root+'/blob/main/docs/guides/use-the-skill.md#agent)\n\n```sh\nnpm run agent -- codex --browser\n```',{copyLabel:'نسخ',copyAria:'نسخ الأمر',resolveLink:repositoryLinkResolver({intendedRepository:root},'ar')});
 assert.deepEqual(rendered.headings,[{id:'cv',title:'اربط سيرتك',level:2}]);
 assert.ok(rendered.html.includes('href="/ar/guides/use-the-skill/#agent"'));
 assert.ok(rendered.html.includes('aria-label="نسخ الأمر">نسخ</button>'));
 assert.ok(rendered.html.includes('npm run agent -- codex --browser'));
 assert.ok(!rendered.html.includes('{#cv}'));
});

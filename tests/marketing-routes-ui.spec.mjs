import{test,expect}from'@playwright/test';

test('old setup and skill links lead to one guide with working anchors and the original mark',async({page,request})=>{
 for(const path of ['/skills','/skills/','/skills/tawdheef','/skills/tawdheef/','/get-started','/get-started/','/guides/get-started','/guides/get-started/']){
  const response=await request.get(path,{maxRedirects:0});
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe('/guides/use-the-skill/');
 }
 await page.goto('/skills/tawdheef/#install');
 await expect(page).toHaveURL(/\/guides\/use-the-skill\/#install$/);
 await expect(page.getByRole('heading',{level:1})).toHaveText('Set up Tawdheef with your agent');
 const mark=page.locator('.guide-title-row img');
 await expect(mark).toHaveAttribute('src','/brand/mark.svg');
 expect(await mark.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect(page.locator('.desktop-navigation a[href="/skills/"]')).toHaveCount(0);
 for(const id of ['install','agent','cv','use','workflow','prompts','permissions','privacy'])await expect(page.locator('#'+id)).toHaveCount(1);
 await page.goto('/get-started/#cv');
 await expect(page).toHaveURL(/\/guides\/use-the-skill\/#cv$/);
});

test('homepage shows one preview and a copyable CLI connection, with setup as the docs entry',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}}));
 await page.goto('/welcome/');
 await expect(page.locator('#walkthrough [role=tablist]')).toHaveCount(0);
 await expect(page.locator('#walkthrough img')).toHaveCount(1);
 await expect(page.locator('.desktop-navigation').getByRole('link',{name:'Guides',exact:true})).toHaveAttribute('href','/guides/use-the-skill/');
 await page.getByText('Quick CLI setup',{exact:true}).click();
 await page.locator('#quick-setup [data-copy]').click();
 expect(await page.evaluate(()=>window.__copied)).toBe('npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start');
 await page.getByRole('link',{name:'Set up with your agent',exact:true}).click();
 await expect(page.locator('#use-the-skill-setup')).toContainText('Set up Tawdheef for me in this folder.');
 const download=page.getByRole('link',{name:'Download from GitHub',exact:true});
 await expect(download).toHaveCSS('color','rgb(255, 255, 255)');
 await expect(download).toHaveAttribute('href',/github.com\/ahmedaldhraif\/tawdheef\/releases\/download\/v[\d.]+\/tawdheef-[\d.]+-source.zip$/);
 expect(await download.evaluate(link=>link.compareDocumentPosition(document.querySelector('#use-the-skill-setup')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
});

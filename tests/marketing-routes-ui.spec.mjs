import{test,expect}from'@playwright/test';

test('legacy skill URLs lead to the guide with the approved symbol and working anchors',async({page,request})=>{
 for(const path of ['/skills','/skills/','/skills/tawdheef','/skills/tawdheef/']){
  const response=await request.get(path,{maxRedirects:0});
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe('/guides/use-the-skill/');
 }
 await page.goto('/skills/tawdheef/#install');
 await expect(page).toHaveURL(/\/guides\/use-the-skill\/#install$/);
 await expect(page.getByRole('heading',{level:1})).toHaveText('Use the Tawdheef skill');
 const mark=page.locator('.guide-title-row img');
 await expect(mark).toHaveAttribute('src','/brand/mark.svg');
 expect(await mark.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect(page.locator('.desktop-navigation a[href="/skills/"]')).toHaveCount(0);
 for(const id of ['install','use','workflow','prompts','permissions'])await expect(page.locator('#'+id)).toHaveCount(1);
});

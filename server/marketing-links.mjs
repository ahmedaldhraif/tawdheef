// Temporary local website destination until the public domain is connected.
export const LOCAL_MARKETING_ORIGIN = 'http://127.0.0.1:4001';
const roots = ['welcome', 'skills', 'guides', 'examples', 'get-started', 'directories', 'about', 'brand', 'policies'];
export function isMarketingPath(path) {
  return roots.some(root => path === '/'+root || path.startsWith('/'+root+'/')) ||
    path === '/ar' || path === '/ar/' || roots.some(root => path === '/ar/'+root || path.startsWith('/ar/'+root+'/'));
}
export function localMarketingUrl(originalUrl) {
  const url = new URL(originalUrl, 'http://localhost');
  if (!isMarketingPath(url.pathname)) throw new Error('Not a marketing page.');
  let path = url.pathname.replace(/^\/welcome(?=\/|$)/, '') || '/';
  const ar = path === '/ar' || path.startsWith('/ar/'), prefix = ar ? '/ar' : '';
  const relative = path.slice(prefix.length).replace(/\/$/, '');
  if (['/get-started', '/skills/tawdheef', '/guides/get-started'].includes(relative)) path = prefix+'/guides/use-the-skill/';
  else if (!path.endsWith('/') && !path.split('/').at(-1).includes('.')) path += '/';
  return LOCAL_MARKETING_ORIGIN+path+url.search;
}
export function installMarketingRedirects(app, { websiteAvailable }) {
  if (websiteAvailable) return;
  app.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method) && isMarketingPath(req.path)) return res.redirect(302, localMarketingUrl(req.originalUrl));
    next();
  });
}

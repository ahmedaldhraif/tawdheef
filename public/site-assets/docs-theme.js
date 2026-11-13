/* Set the docs theme before paint. This preference stays in this browser. */
(()=>{let theme;try{theme=localStorage.getItem('tawdheef-docs-theme');}catch{}if(theme!=='light'&&theme!=='dark')theme='light';document.documentElement.dataset.docsTheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111110':'#ffffff');})();

(() => {
  const status=document.getElementById('copy-status'); let statusTimer;
  const copyTimers=new WeakMap();
  document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const target=document.getElementById(button.dataset.copy); if(!target)return;
    clearTimeout(copyTimers.get(button));clearTimeout(statusTimer);
    try{await navigator.clipboard.writeText(target.textContent.trim());button.textContent='Copied';if(status)status.textContent='Copied to clipboard';}
    catch{if(status)status.textContent='Select and copy the command above.';}
    copyTimers.set(button,setTimeout(()=>{button.textContent='Copy';},2200));
    statusTimer=setTimeout(()=>{if(status)status.textContent='';},2200);
  }));
  const header=document.querySelector('.site-header');
  function updateHeader(){header?.classList.toggle('scrolled',scrollY>8);}
  addEventListener('scroll',updateHeader,{passive:true});updateHeader();
  const themeToggle=document.querySelector('.docs-theme-toggle');
  if(themeToggle){
    function syncTheme(){const dark=document.documentElement.dataset.docsTheme==='dark';themeToggle.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111110':'#ffffff');}
    themeToggle.addEventListener('click',()=>{const theme=document.documentElement.dataset.docsTheme==='dark'?'light':'dark';document.documentElement.dataset.docsTheme=theme;try{localStorage.setItem('tawdheef-docs-theme',theme);}catch{}syncTheme();});syncTheme();
  }
  const docsSearch=document.getElementById('docs-search'),docsInput=document.getElementById('docs-search-input');
  if(docsSearch&&docsInput){
    const triggers=[...document.querySelectorAll('.docs-search-trigger')],results=[...docsSearch.querySelectorAll('[data-docs-search]')];let returnFocus;
    const visible=()=>results.filter(item=>!item.hidden);
    function filterDocs(){const query=docsInput.value.trim().toLocaleLowerCase();for(const result of results)result.hidden=!result.dataset.docsSearch.toLocaleLowerCase().includes(query);const count=visible().length;document.getElementById('docs-search-status').textContent=count===1?'1 result':`${count} results`;document.getElementById('docs-search-empty').hidden=count>0;}
    function openSearch(){if(docsSearch.open)return;returnFocus=document.activeElement;docsInput.value='';filterDocs();docsSearch.showModal();docsInput.focus();}
    triggers.forEach(trigger=>trigger.addEventListener('click',openSearch));
    docsSearch.querySelector('.docs-search-close').addEventListener('click',()=>docsSearch.close());
    docsSearch.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
    docsSearch.addEventListener('click',event=>{if(event.target!==docsSearch)return;const rect=docsSearch.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)docsSearch.close();});
    docsInput.addEventListener('input',filterDocs);
    docsInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&visible().length){event.preventDefault();visible()[0].focus();}});
    for(const result of results)result.addEventListener('keydown',event=>{const items=visible(),index=items.indexOf(result);if(event.key==='ArrowDown'){event.preventDefault();items[(index+1)%items.length]?.focus();}if(event.key==='ArrowUp'){event.preventDefault();if(index===0)docsInput.focus();else items[index-1]?.focus();}});
    document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(docsSearch.open)docsSearch.close();else openSearch();}});
    document.querySelectorAll('[data-shortcut]').forEach(item=>{item.textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';});
  }
  document.querySelectorAll('.docs-mobile-navigation a').forEach(link=>link.addEventListener('click',()=>document.getElementById('docs-navigation')?.hidePopover()));
  const search=document.getElementById('directory-search'),role=document.getElementById('source-role');
  if(search){const rows=[...document.querySelectorAll('[data-directory-row]')];function filter(){const query=search.value.trim().toLocaleLowerCase();let count=0;rows.forEach(row=>{const show=row.textContent.toLocaleLowerCase().includes(query)&&(!role?.value||row.dataset.role===role.value);row.hidden=!show;if(show)count++;});const label=document.getElementById('directory-count');if(label)label.textContent=`${count} of ${rows.length} source records shown`;const empty=document.getElementById('directory-empty');if(empty)empty.hidden=count>0;}search.addEventListener('input',filter);role?.addEventListener('change',filter);filter();}
  const guideSearch=document.getElementById('guide-search');
  if(guideSearch){
    const items=[...document.querySelectorAll('[data-guide-item]')],groups=[...document.querySelectorAll('[data-guide-category]')];
    function filterGuides(){
      const query=guideSearch.value.trim().toLocaleLowerCase();let count=0;
      for(const item of items){item.hidden=!(item.dataset.guideSearch||item.textContent).toLocaleLowerCase().includes(query);if(!item.hidden)count++;}
      for(const group of groups)group.hidden=![...group.querySelectorAll('[data-guide-item]')].some(item=>!item.hidden);
      const label=document.getElementById('guide-search-status');if(label)label.textContent=count===1?'1 guide':`${count} guides`;
      const empty=document.getElementById('guide-empty');if(empty)empty.hidden=count>0;
    }
    guideSearch.addEventListener('input',filterGuides);
    guideSearch.addEventListener('keydown',event=>{if(event.key==='Escape'){guideSearch.value='';filterGuides();}});
  }
})();

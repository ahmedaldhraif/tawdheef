(() => {
  let languageUI={};try{languageUI=JSON.parse(document.body.dataset.ui||'{}');}catch{}
  const word=(key,fallback)=>languageUI[key]||fallback;
  const countLabel=(count,one,many)=>count===1?word(one,'1 result'):word(many,'{count} results').replace('{count}',count);
  const normalizeSearch=value=>String(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0640\u064b-\u065f\u0670]/g,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي');
  document.querySelectorAll('[data-language-link]').forEach(link=>link.addEventListener('click',()=>{if(location.hash){const target=new URL(link.href);target.hash=location.hash;link.href=target.pathname+target.search+target.hash;}}));
  const status=document.getElementById('copy-status'); let statusTimer;
  const copyTimers=new WeakMap();
  document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const target=document.getElementById(button.dataset.copy); if(!target)return;
    clearTimeout(copyTimers.get(button));clearTimeout(statusTimer);
    try{await navigator.clipboard.writeText(target.textContent.trim());button.textContent=word('copied','Copied');if(status)status.textContent=word('copiedStatus','Copied to clipboard');}
    catch{if(status)status.textContent=word('copyFallback','Select and copy the command above.');}
    copyTimers.set(button,setTimeout(()=>{button.textContent=word('copy','Copy');},2200));
    statusTimer=setTimeout(()=>{if(status)status.textContent='';},2200);
  }));
  const agentDemos=[...document.querySelectorAll('.agent-install-demo img[data-demo-gif]')];
  for(const image of agentDemos){
    const toggle=image.closest('.agent-install-demo')?.querySelector('[data-agent-playback]');
    if(!toggle)continue;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let visible=false,playing=false,userPaused=false,manualMotion=false,hasPlayed=false;
    const render=play=>{
      playing=play;if(play)hasPlayed=true;
      const src=play?image.dataset.demoGif:image.dataset.demoPoster;
      if(image.getAttribute('src')!==src)image.src=src;
      toggle.textContent=play?toggle.dataset.pauseLabel:hasPlayed?toggle.dataset.replayLabel:toggle.dataset.playLabel;
      toggle.setAttribute('aria-pressed',String(play));
    };
    const sync=()=>render(visible&&!document.hidden&&!userPaused&&(!motion.matches||manualMotion));
    toggle.addEventListener('click',()=>{
      if(playing){userPaused=true;manualMotion=false;render(false);}
      else{userPaused=false;manualMotion=true;render(true);}
    });
    image.addEventListener('error',()=>{if(playing){userPaused=true;render(false);toggle.hidden=true;}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)manualMotion=false;sync();});
    addEventListener('pagehide',()=>{manualMotion=false;render(false);});
    motion.addEventListener('change',()=>{manualMotion=false;sync();});
    render(false);toggle.hidden=false;
    if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
      visible=entries[0].isIntersecting;if(!visible)manualMotion=false;sync();
    },{threshold:0.1}).observe(image);
  }
  const header=document.querySelector('.site-header');
  function updateHeader(){header?.classList.toggle('scrolled',scrollY>8);}
  addEventListener('scroll',updateHeader,{passive:true});updateHeader();
  const themeToggles=[...document.querySelectorAll('.docs-theme-toggle')];
  if(themeToggles.length){
    function syncTheme(){const dark=document.documentElement.dataset.docsTheme==='dark';themeToggles.forEach(toggle=>{const label=dark?word('switchLight','Switch to light theme'):word('switchDark','Switch to dark theme');toggle.setAttribute('aria-label',label);toggle.setAttribute('title',label);});}
    themeToggles.forEach(themeToggle=>themeToggle.addEventListener('click',()=>window.tawdheefTheme?.setPreference(document.documentElement.dataset.docsTheme==='dark'?'light':'dark')));
    window.addEventListener('tawdheef:themechange',syncTheme);syncTheme();
  }
  document.querySelectorAll('[data-theme-system]').forEach(button=>button.addEventListener('click',()=>window.tawdheefTheme?.setPreference('system')));
  const docsSearch=document.getElementById('docs-search'),docsInput=document.getElementById('docs-search-input');
  if(docsSearch&&docsInput){
    const triggers=[...document.querySelectorAll('.docs-search-trigger')],results=[...docsSearch.querySelectorAll('[data-docs-search]')];let returnFocus;
    const visible=()=>results.filter(item=>!item.hidden);
    function filterDocs(){const query=normalizeSearch(docsInput.value.trim());for(const result of results)result.hidden=!normalizeSearch(result.dataset.docsSearch).includes(query);const count=visible().length;document.getElementById('docs-search-status').textContent=countLabel(count,'searchOne','searchOther');document.getElementById('docs-search-empty').hidden=count>0;}
    function openSearch(){if(docsSearch.open)return;returnFocus=document.activeElement;docsInput.value='';filterDocs();docsSearch.showModal();docsInput.focus();}
    triggers.forEach(trigger=>trigger.addEventListener('click',openSearch));
    docsSearch.querySelector('.docs-search-close').addEventListener('click',()=>docsSearch.close());
    docsSearch.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
    docsSearch.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();docsSearch.close();}},{capture:true});
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
      const query=normalizeSearch(guideSearch.value.trim());let count=0;
      for(const item of items){item.hidden=!normalizeSearch(item.dataset.guideSearch||item.textContent).includes(query);if(!item.hidden)count++;}
      for(const group of groups)group.hidden=![...group.querySelectorAll('[data-guide-item]')].some(item=>!item.hidden);
      const label=document.getElementById('guide-search-status');if(label)label.textContent=countLabel(count,'guideOne','guideOther');
      const empty=document.getElementById('guide-empty');if(empty)empty.hidden=count>0;
    }
    guideSearch.addEventListener('input',filterGuides);
    guideSearch.addEventListener('keydown',event=>{if(event.key==='Escape'){guideSearch.value='';filterGuides();}});
  }
})();

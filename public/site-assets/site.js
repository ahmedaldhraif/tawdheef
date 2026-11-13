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
  document.querySelectorAll('[role=tablist]').forEach(list=>{
    const tabs=[...list.querySelectorAll('[role=tab]')];
    function select(tab){tabs.forEach(item=>{const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;const panel=document.getElementById(item.getAttribute('aria-controls'));if(panel)panel.hidden=!active;});}
    tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();select(tabs[next]);tabs[next].focus();}});});
  });
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

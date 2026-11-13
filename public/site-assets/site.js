(() => {
  const status=document.getElementById('copy-status'); let timer;
  document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const target=document.getElementById(button.dataset.copy); if(!target)return;
    clearTimeout(timer);
    try{await navigator.clipboard.writeText(target.textContent.trim());button.textContent='Copied';if(status)status.textContent='Copied to clipboard';}
    catch{if(status)status.textContent='Select and copy the command above.';}
    timer=setTimeout(()=>{button.textContent='Copy';if(status)status.textContent='';},2200);
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
})();

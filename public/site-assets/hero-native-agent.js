// A decorative introduction, not a live application or agent-session status.
const agent=document.querySelector('#hero-native-agent');
if(agent){
 const group=agent.closest('.agent-heading'),slot=group.querySelector('.agent-phrase-slot'),text=slot.querySelector('.agent-phrase-text');
 const segmenter=new Intl.Segmenter(document.documentElement.lang||'en',{granularity:'grapheme'});
 const phrases=[slot.dataset.first,slot.dataset.second].map(s=>[...segmenter.segment(s)].map(p=>p.segment));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const forced=matchMedia('(forced-colors: active)');
 const parts=[...agent.querySelectorAll('.mascot-pose,.mascot-eye-square,.mascot-eye-angle-right')];
 const bridges=new Set();
 let visible=true,timer=0,index=0,count=0,mode='type',started=false;
 const allowed=()=>visible&&!document.hidden&&!reduced.matches&&!forced.matches;
 const matrix=value=>value==='none'?new DOMMatrix():new DOMMatrix(value);
 function clearBridges(){for(const bridge of bridges)bridge.cancel();bridges.clear();}
 function motion(){
  // The marketing introduction speaks the finished line, then codes the next.
  // This native demonstration is separate from the app's real Run indicator.
  const playing=allowed();
  const state=mode==='hold'?'speaking':'coding',changing=state!==agent.dataset.state;
  // Capture the visible pose before cancelling a previous handoff. Additive
  // corrections decay to identity while the native SVG animation continues.
  const previous=playing&&changing?parts.map(part=>matrix(getComputedStyle(part).transform)):null;
  if(changing||!playing)clearBridges();
  if(changing)agent.dataset.state=state;
  if(agent.dataset.busy!==String(playing))agent.dataset.busy=String(playing);
  if(agent.dataset.playing!==String(playing))agent.dataset.playing=String(playing);
  if(previous){
   const targets=parts.map(part=>matrix(getComputedStyle(part).transform));
   const easing=getComputedStyle(agent).getPropertyValue('--site-ease-out').trim()||'cubic-bezier(.23,1,.32,1)';
   parts.forEach((part,i)=>{
    const correction=targets[i].inverse().multiply(previous[i]);
    if(correction.isIdentity)return;
    const bridge=part.animate([{transform:correction.toString()},{transform:'matrix(1,0,0,1,0,0)'}],{duration:160,easing,composite:'add'});
    bridge.id='native-agent-state-blend';bridges.add(bridge);
    bridge.onfinish=bridge.oncancel=()=>bridges.delete(bridge);
   });
  }
 }
 function paint(){text.textContent=phrases[index].slice(0,count).join('');slot.dataset.phase=mode;motion();}
 function schedule(delay){clearTimeout(timer);if(allowed())timer=setTimeout(step,delay);}
 function step(){
  // Reconcile late visibility/media changes before the next typing step too.
  if(!allowed()){sync();return;}
  if(mode==='type'){count++;if(count===phrases[index].length){mode='hold';paint();schedule(2100);}else{paint();schedule(65);}return;}
  if(mode==='hold'){mode='erase';paint();schedule(40);return;}
  count--;paint();
  if(count===0){index=(index+1)%phrases.length;mode='type';paint();schedule(320);}else schedule(30);
 }
 function sync(){
  clearTimeout(timer);agent.dataset.paused=String(!allowed());group.dataset.motionPaused=String(!allowed());
  if(reduced.matches||forced.matches){text.textContent=slot.dataset.first;slot.dataset.phase='static';motion();started=false;return;}
  if(!started){count=0;index=0;mode='type';started=true;paint();}
  motion();
  if(allowed())schedule(mode==='hold'?2100:300);
 }
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(group);
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);forced.addEventListener('change',sync);sync();
}

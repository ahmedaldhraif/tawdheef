// A decorative introduction, not a live application or agent-session status.
const agent=document.querySelector('#hero-native-agent');
if(agent){
 const group=agent.closest('.agent-heading'),slot=group.querySelector('.agent-phrase-slot'),text=slot.querySelector('.agent-phrase-text');
 const segmenter=new Intl.Segmenter(document.documentElement.lang||'en',{granularity:'grapheme'});
 const phrases=[slot.dataset.first,slot.dataset.second].map(s=>[...segmenter.segment(s)].map(p=>p.segment));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let visible=true,timer=0,index=0,count=0,mode='type',started=false;
 const allowed=()=>visible&&!document.hidden&&!reduced.matches;
 function paint(){text.textContent=phrases[index].slice(0,count).join('');slot.dataset.phase=mode;agent.dataset.state=mode==='hold'?'speaking':'coding';}
 function schedule(delay){clearTimeout(timer);if(allowed())timer=setTimeout(step,delay);}
 function step(){
  if(!allowed())return;
  if(mode==='type'){count++;if(count===phrases[index].length){mode='hold';paint();schedule(2100);}else{paint();schedule(65);}return;}
  if(mode==='hold'){mode='erase';paint();schedule(40);return;}
  count--;paint();
  if(count===0){index=(index+1)%phrases.length;mode='type';paint();schedule(320);}else schedule(30);
 }
 function sync(){
  clearTimeout(timer);agent.dataset.paused=String(!allowed());group.dataset.motionPaused=String(!allowed());
  if(reduced.matches){text.textContent=slot.dataset.first;slot.dataset.phase='static';agent.dataset.state='rest';started=false;return;}
  if(!started){count=0;index=0;mode='type';started=true;paint();}
  if(allowed())schedule(mode==='hold'?2100:300);
 }
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(group);
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);sync();
}

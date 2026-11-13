/** The public guides use a deliberately small, escaped Markdown vocabulary.
 * Rendering happens at build time. No author HTML or remote media is executed. */
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function safeLink(value){
 const href=String(value).trim();
 if(/^(?:https?:\/\/|mailto:)/i.test(href)||/^\/(?!\/)/.test(href)||href.startsWith('#'))return href;
 throw new Error('Use a full HTTPS URL, a site path or an anchor in public guides: '+href);
}

export function inlineMarkdown(text,{resolveLink=href=>href}={}){
 const saved=[];
 const hold=html=>`\u0000${saved.push(html)-1}\u0000`;
 let value=String(text).replace(/`([^`]+)`/g,(_,code)=>hold('<code>'+escapeHtml(code)+'</code>'));
 value=value.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g,(_,alt,src)=>{
  if(!/^\/(?:site-assets|brands|brand|flags)\//.test(src))throw new Error('Guide images must use bundled local artwork.');
  return hold(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"/>`);
 });
 value=value.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g,(_,label,href)=>hold(`<a href="${escapeHtml(safeLink(resolveLink(href)))}">${escapeHtml(label)}</a>`));
 value=escapeHtml(value).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>');
 for(let pass=0;pass<=saved.length&&/\u0000\d+\u0000/.test(value);pass++)value=value.replace(/\u0000(\d+)\u0000/g,(_,index)=>saved[Number(index)]);
 return value;
}

export function renderMarkdown(source,{prefix='guide',skipTitle=true,widget=()=>null,resolveLink=href=>href,copyLabel='Copy',copyAria='Copy code'}={}){
 const lines=String(source).replaceAll('\r\n','\n').split('\n');
 const out=[],headings=[],ids=new Map();let block=0;
 const inline=text=>inlineMarkdown(text,{resolveLink});
 const slug=text=>text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'section';
 for(let i=0;i<lines.length;){
  const line=lines[i];
  if(!line.trim()){i++;continue;}
  const custom=widget(line.trim(),++block);if(custom!==null){out.push(custom);i++;continue;}
  const fence=line.match(/^```([\w-]*)\s*$/);
  if(fence){
   const code=[];i++;while(i<lines.length&&!/^```\s*$/.test(lines[i]))code.push(lines[i++]);
   if(i===lines.length)throw new Error('Close the code fence in '+prefix);i++;
   const id=prefix+'-code-'+block;
   out.push(`<div class="guide-code"><button class="copy" type="button" data-copy="${id}" aria-label="${escapeHtml(copyAria)}">${escapeHtml(copyLabel)}</button><pre id="${id}" dir="ltr"><code>${escapeHtml(code.join('\n'))}</code></pre></div>`);continue;
  }
  const heading=line.match(/^(#{1,3})\s+(.+)$/);
  if(heading){
   i++;const level=heading[1].length;if(level===1&&skipTitle)continue;
   const explicit=heading[2].match(/\s+\{#([a-z][a-z0-9-]*)\}$/),text=explicit?heading[2].slice(0,explicit.index):heading[2];
   const base=explicit?.[1]||slug(text),n=(ids.get(base)||0)+1;ids.set(base,n);const id=base+(n>1?'-'+n:'');
   headings.push({id,title:text.replace(/[*`]/g,''),level});out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);continue;
  }
  if(/^---+$/.test(line.trim())){out.push('<hr/>');i++;continue;}
  if(/^>\s?/.test(line)){
   const parts=[];while(i<lines.length&&/^>\s?/.test(lines[i]))parts.push(lines[i++].replace(/^>\s?/,''));
   out.push('<blockquote><p>'+inline(parts.join(' '))+'</p></blockquote>');continue;
  }
  const list=line.match(/^(?:([-*])|\d+[.)])\s+(.+)$/);
  if(list){
   const ordered=!list[1],tag=ordered?'ol':'ul',items=[];
   while(i<lines.length){
    const item=lines[i].match(ordered?/^\d+[.)]\s+(.+)$/:/^[-*]\s+(.+)$/);if(!item)break;
    const parts=[item[1]];i++;
    while(i<lines.length&&/^\s{2,}\S/.test(lines[i])&&!/^\s+[-*]\s/.test(lines[i]))parts.push(lines[i++].trim());
    items.push('<li>'+inline(parts.join(' '))+'</li>');
   }
   out.push('<'+tag+'>'+items.join('')+'</'+tag+'>');continue;
  }
  const paragraph=[line.trim()];i++;
  while(i<lines.length&&lines[i].trim()&&!/^(?:#{1,3}\s|```|>\s?|[-*]\s|\d+[.)]\s|\{\{)/.test(lines[i]))paragraph.push(lines[i++].trim());
  out.push('<p>'+inline(paragraph.join(' '))+'</p>');
 }
 return{html:out.join('\n'),headings};
}

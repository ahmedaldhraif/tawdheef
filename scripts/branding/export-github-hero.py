"""Render the original outlined wordmarks and native agent into README GIFs.

Build-only dependencies: Pillow, fontTools, aggdraw. No browser or provider access.
Run: python scripts/branding/export-github-hero.py
"""
from pathlib import Path
import sys, re, json, math
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'outputs/github-hero-render-deps'))
from PIL import Image,ImageDraw,ImageChops
import aggdraw
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

OUT=ROOT/'public/brand/github-hero'
OUT.mkdir(parents=True,exist_ok=True)
W,H,S=800,176,2
FPS=20
class Pen(BasePen):
 def __init__(self):super().__init__(None);self.path=aggdraw.Path()
 def _moveTo(self,p):self.path.moveto(*p)
 def _lineTo(self,p):self.path.lineto(*p)
 def _curveToOne(self,p1,p2,p3):self.path.curveto(*p1,*p2,*p3)
 def _qCurveToOne(self,p1,p2):
  p0=self._getCurrentPoint();self._curveToOne(tuple(p0[i]+2/3*(p1[i]-p0[i]) for i in (0,1)),tuple(p2[i]+2/3*(p1[i]-p2[i]) for i in (0,1)),p2)
 def _closePath(self):self.path.close()
 def _endPath(self):pass
def path_image(d,transform,color):
 image=Image.new('RGBA',(W*S,H*S));pen=Pen();parse_path(d,TransformPen(pen,transform));ctx=aggdraw.Draw(image);ctx.path(pen.path,aggdraw.Brush(color));ctx.flush();return image
def wordmark(file,color):
 root=ET.parse(ROOT/'public/brand'/file).getroot();e=next(e for e in root if e.tag.endswith('path'))
 tx,ty,sx,sy=map(float,re.findall(r'[-\d.]+',e.attrib['transform']));scale=48/64
 x=192 if 'latin' in file else 192+444-float(root.attrib['width'])*scale
 return path_image(e.attrib['d'],(S*scale*sx,0,0,S*scale*sy,S*(x+scale*tx),S*(64+scale*ty)),color)
BODY='M10 40.4H26V59.6H74V40.4H90V75.6H10Z'
LEFT='M28.333333 20.4H44.333333V36.4H28.333333Z'
CODE='M53.666667 20.4L73.666667 25.4V31.4L53.666667 36.4V30.4L65.666667 28.4L53.666667 26.4Z'
def agent(color,time,active):
 # The native studio's same small code-eye movement; body and proportions stay fixed.
 transform=(S,0,0,S,64*S,34*S)
 image=path_image(BODY+' '+LEFT,transform,color)
 offset=(math.sin(time*math.pi)*.7) if active else 0
 image.alpha_composite(path_image(CODE,(S,0,0,S,(64+offset)*S,34*S),color));return image
PHRASES=['tawdheef.com','توظيف.كوم']
segments=[]
for index,word in enumerate(PHRASES):
 for n in range(len(word)+1):segments.extend([(index,n/len(word),'type')]*2)
 segments.extend([(index,1,'hold')]*36)
 for n in range(len(word)-1,-1,-1):segments.append((index,n/len(word),'erase'))
 segments.extend([(index,0,'type')]*5)
for dark in [False,True]:
 stem='wordmark-dark' if dark else 'wordmark-light'
 bg='#0d1117' if dark else '#ffffff';ink='#f0f0ef' if dark else '#18181b';violet='#b29aff' if dark else '#5a2aff'
 marks=[wordmark('wordmark-latin-purple.svg',ink),wordmark('wordmark-arabic-purple.svg',ink)]
 frames=[]
 for frame,(index,progress,phase) in enumerate(segments):
  image=Image.new('RGBA',(W*S,H*S),bg);image.alpha_composite(agent(violet,frame/FPS,phase!='hold'))
  visible=marks[index].copy();mask=Image.new('L',visible.size,0);draw=ImageDraw.Draw(mask)
  box=visible.getbbox();left,top,right,bottom=box
  edge=round(left+(right-left)*progress) if index==0 else round(right-(right-left)*progress)
  draw.rectangle((left,0,edge,H*S) if index==0 else (edge,0,right,H*S),fill=255)
  visible.putalpha(ImageChops.multiply(visible.getchannel('A'),mask))
  if phase=='hold':
   sweep=(frame%36)/35;shine=Image.new('RGBA',visible.size);sd=ImageDraw.Draw(shine)
   center=left+(right-left)*sweep
   for dx in range(-60,61):
    strength=round(80*(1-abs(dx)/61));sd.line((center+dx,0,center+dx,H*S),fill=violet+(format(strength,'02x')),width=1)
   shine.putalpha(ImageChops.multiply(shine.getchannel('A'),visible.getchannel('A')));visible.alpha_composite(shine)
  image.alpha_composite(visible)
  if phase=='type' and progress<1:
   ImageDraw.Draw(image).rectangle((edge+3*S,68*S,edge+5*S,110*S),fill=violet)
  frames.append(image.convert('RGB').resize((W,H),Image.Resampling.LANCZOS))
 frames[0].save(OUT/(stem+'.gif'),save_all=True,append_images=frames[1:],duration=50,loop=0,optimize=True,disposal=2)
 still=Image.new('RGBA',(W*S,H*S),bg);still.alpha_composite(agent(violet,0,False));still.alpha_composite(marks[0]);still.resize((W,H),Image.Resampling.LANCZOS).save(OUT/(stem+'.png'))
print(json.dumps({'frames':len(segments),'fps':FPS,'durationSeconds':len(segments)/FPS,'size':[W,H],'output':str(OUT)}))
(OUT/'sources.json').write_text(json.dumps({'generator':'scripts/branding/export-github-hero.py','artwork':['../wordmark-latin-purple.svg','../wordmark-arabic-purple.svg'],'agent':'Original native studio body, square left eye and single right code eye from scripts/branding/mascot.mjs','rendering':'Pillow + fontTools + aggdraw; local vector rendering only','purpose':'Decorative GitHub identity animation. No live job progress or account status.','themes':['light','dark'],'reducedMotion':'Separate still PNGs in the README picture element'},indent=2)+'\n',encoding='utf-8')

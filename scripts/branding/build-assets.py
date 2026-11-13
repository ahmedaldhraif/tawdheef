"""Build Tawdheef's selected Arabic Grid identity as real vector artwork.

Requires fonttools[woff] and uharfbuzz. Font sources and licenses are bundled
in public/brand/fonts. Run from any directory: python scripts/branding/build-assets.py
Raster exports are produced separately by export-assets.mjs through Chromium.
"""
from pathlib import Path
from io import BytesIO
from html import escape
import hashlib
import json
import shutil

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'brand'
PURPLE, INK, WHITE = '#5A2AFF', '#18181B', '#FFFFFF'
LATIN_LOGO = 'tawdheef.com'
OUT.mkdir(exist_ok=True)

# 16-unit stroke; a 5-module-wide body. Both dots are true squares.
# The dot baseline aligns with the body's top, as in the selected concept.
BODY = 'M10 40.4H26V59.6H74V40.4H90V75.6H10Z'
DOTS = '<rect class="dot dot-a" x="31.333333" y="24.4" width="16" height="16"/><rect class="dot dot-b" x="52.666667" y="24.4" width="16" height="16"/>'
MARK = f'<path d="{BODY}"/>{DOTS}'
MOTION = '''.dot{transform-box:fill-box;transform-origin:center}
.dot-a{animation:tawdheef-dot 1120ms cubic-bezier(.45,0,.55,1) infinite}
.dot-b{animation:tawdheef-dot 1120ms cubic-bezier(.45,0,.55,1) 140ms infinite}
@keyframes tawdheef-dot{0%,70%,100%{opacity:1;transform:translateY(0)}35%{opacity:.48;transform:translateY(-2px)}}
@media(prefers-reduced-motion:reduce){.dot-a,.dot-b{animation:none}}
'''

def svg(w, h, content, title='Tawdheef — توظيف', extra=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(title, quote=True)}" {extra}><title>{escape(title)}</title>{content}</svg>\n'

def save(name, content):
    (OUT / name).write_text(content, encoding='utf-8')

for name, color in [('mark', PURPLE), ('mark-ink', INK), ('mark-white', WHITE), ('mark-current', 'currentColor')]:
    save(name+'.svg', svg(100, 100, f'<g fill="{color}">{MARK}</g>'))
save('mark-animated.svg', svg(100, 100, f'<style>{MOTION}</style><g fill="{PURPLE}">{MARK}</g>', 'Tawdheef loading mark'))

# Hand-hinted small masters: integer edges rather than fractional pixels.
small = {
    16: ('M1 6H4V10H12V6H15V13H1Z', [(5,3,2),(9,3,2)]),
    24: ('M2 9H6V14H18V9H22V18H2Z', [(7,5,4),(13,5,4)]),
    32: ('M3 12H8V19H24V12H29V24H3Z', [(10,7,5),(17,7,5)]),
}
for size, (body, dots) in small.items():
    content = f'<path d="{body}"/>' + ''.join(f'<rect x="{x}" y="{y}" width="{s}" height="{s}"/>' for x,y,s in dots)
    save(f'mark-{size}.svg', svg(size,size,f'<g fill="{PURPLE}">{content}</g>'))
save('favicon.svg', svg(32,32, '<style>.mark{fill:#5A2AFF}@media(prefers-color-scheme:dark){.mark{fill:#BBA6FF}}</style><g class="mark"><path d="M3 12H8V19H24V12H29V24H3Z"/><rect x="10" y="7" width="5" height="5"/><rect x="17" y="7" width="5" height="5"/></g>'))
shutil.copy2(OUT/'favicon.svg', ROOT/'public'/'favicon.svg')

font_specs = {'latin': ('Manrope-variable.ttf', 750), 'arabic': ('NotoKufiArabic-variable.ttf', 750), 'caption': ('Manrope-variable.ttf', 500)}
fonts = {}
for key, (file, weight) in font_specs.items():
    font = instantiateVariableFont(TTFont(OUT/'fonts'/file), {'wght':weight}, inplace=False)
    stream=BytesIO(); font.save(stream)
    face=hb.Face(stream.getvalue()); hbfont=hb.Font(face); hbfont.scale=(face.upem,face.upem)
    fonts[key]=(font,hbfont)
for name in ['Manrope', 'NotoKufiArabic']:
    font=TTFont(OUT/'fonts'/f'{name}-variable.ttf'); font.flavor='woff2'; font.save(OUT/'fonts'/f'{name}-variable.woff2')

def outline(text, family='latin'):
    font, hbfont=fonts[family]
    buf=hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(hbfont,buf)
    glyphset=font.getGlyphSet(); pen=SVGPathPen(glyphset); bounds=BoundsPen(glyphset)
    x=y=0
    for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
        glyph=glyphset[font.getGlyphName(info.codepoint)]
        transform=(1,0,0,1,x+pos.x_offset,y+pos.y_offset)
        glyph.draw(TransformPen(pen,transform)); glyph.draw(TransformPen(bounds,transform))
        x+=pos.x_advance; y+=pos.y_advance
    return pen.getCommands(),bounds.bounds

def lettering(text, family, x, y, height, color):
    d,(x0,y0,x1,y1)=outline(text,family); scale=height/(y1-y0)
    return f'<path fill="{color}" transform="translate({x-x0*scale:.6f} {y+y1*scale:.6f}) scale({scale:.8f} {-scale:.8f})" d="{d}"/>', (x1-x0)*scale

def mark_at(x,y,size,color):
    return f'<g fill="{color}" transform="translate({x} {y}) scale({size/100})">{MARK}</g>'

for variant, color in [('purple',PURPLE),('ink',INK),('white',WHITE)]:
    for family,text in [('latin',LATIN_LOGO),('arabic','توظيف')]:
        word,width=lettering(text,family,0,0,64,color)
        save(f'wordmark-{family}-{variant}.svg', svg(round(width,4),64,word))
        # Optical alignment uses visible mark bounds (24.4–75.6), not its box.
        word,width=lettering(text,family,148,32,64, WHITE if variant=='white' else INK)
        content=mark_at(0,0,128,color)+word
        save(f'logo-{family}-{variant}.svg',svg(round(width+164,4),128,content))
    # Arabic above Latin, same visible width, natural joining preserved.
    ar,arw=lettering('توظيف','arabic',176,26,54, WHITE if variant=='white' else INK)
    en,enw=lettering(LATIN_LOGO,'latin',176,103,46, WHITE if variant=='white' else INK)
    scale=arw/enw
    en=f'<g transform="translate({176*(1-scale):.6f} {103*(1-scale):.6f}) scale({scale:.8f})">{en}</g>'
    save(f'logo-bilingual-{variant}.svg',svg(round(arw+192,4),180,mark_at(0,0,180,color)+ar+en))
    ar,arw=lettering('توظيف','arabic',0,174,62,color)
    en,enw=lettering(LATIN_LOGO,'latin',0,269,42, WHITE if variant=='white' else INK)
    width=max(arw,enw)+64
    body=mark_at((width-224)/2,-8,224,color)+f'<g transform="translate({(width-arw)/2:.5f} 0)">{ar}</g>'+f'<g transform="translate({(width-enw)/2:.5f} 0)">{en}</g>'
    save(f'logo-stacked-{variant}.svg',svg(round(width,4),343,body))

# The optional endorsement is a separate asset. The supplied Tabbio icon
# remains unchanged in tabbio-original.svg, outside the core Tawdheef mark.
shutil.copy2(ROOT/'public/brands/tabbio.svg', OUT/'tabbio-original.svg')
endorsement,width=lettering('Powered by Tabbio','caption',0,0,18,INK)
save('endorsement.svg',svg(round(width,4),18,endorsement,'Powered by Tabbio'))

# App icons are square, opaque canvases with generous safe area for OS masks.
for name,bg,fg in [('app-icon',PURPLE,WHITE),('app-icon-light',WHITE,PURPLE),('avatar-dark',INK,WHITE)]:
    save(name+'.svg',svg(512,512,f'<rect width="512" height="512" fill="{bg}"/>'+mark_at(56,56,400,fg)))

# A self-contained GitHub social preview with outlined bilingual typography.
social=f'<rect width="1280" height="640" fill="{WHITE}"/>'
social+=mark_at(64,144,320,PURPLE)
ar,arw=lettering('توظيف','arabic',452,204,105,INK)
en,enw=lettering(LATIN_LOGO,'latin',452,345,76,INK)
# Preserve the social canvas and symbol; fit the longer domain wordmark inside
# the existing text column, leaving the same 80-pixel right-hand margin.
if enw > 748:
    en,enw=lettering(LATIN_LOGO,'latin',452,345,76*748/enw,INK)
social+=ar+en
desc,descw=lettering('Auto job apply & application tracker.','caption',452,464,22,'#62626B')
assert descw <= 748, 'Social descriptor must fit the existing text column'
url,_=lettering('tawdheef.com','caption',80,563,16,'#62626B')
social+=desc+url+f'<rect x="80" y="529" width="1120" height="1" fill="#DEDEE3"/>'
save('github-social.svg',svg(1280,640,social,'Tawdheef — Auto Job Apply & Application Tracker'))

tokens={
 'name':{'display':LATIN_LOGO,'prose':'Tawdheef','arabic':'توظيف','domain':'www.tawdheef.com','repositorySlug':'tawdheef'},
 'selectedConcept':'04 — Arabic Grid','version':'1.0.0','date':'2026-11-13',
 'parent':{'name':'Tabbio','relationship':'subbrand','endorsement':'Powered by Tabbio','optional':True,'coreLogoIncludesEndorsement':False},
 'color':{'purple':PURPLE,'ink':INK,'white':WHITE,'canvas':'#F5F5F7','lavender':'#EEE8FF','muted':'#62626B','border':'#DEDEE3','success':'#23734B'},
 'type':{'latinBrand':'Manrope 750','arabicBrand':'Noto Kufi Arabic 750','ui':'Installed platform system font','code':'ui-monospace, Consolas, monospace','logoTextIsOutlined':True},
 'geometry':{'viewBox':[0,0,100,100],'bodyPath':BODY,'strokeModule':16,'dotSize':16,'visibleBounds':[10,24.4,90,75.6],'clearSpaceMinimum':'One dot (16 units) on every side of the visible artwork','smallMasters':[16,24,32]},
 'usage':{'minSymbolSize':16,'minLatinLockupWidth':180,'minArabicLockupWidth':140,'minBilingualLockupWidth':260,'minStackedLockupWidth':160,'minEndorsementHeight':12,'iconSafeArea':'At least 10% of the square canvas around visible artwork'},
 'motion':{'purpose':'Indicate actual loading; optionally demonstrate the mark on a brand surface','idle':'static','favicon':'static','busyDurationMs':1120,'dotStaggerMs':140,'movementIn100UnitViewBox':2,'lowestOpacity':0.48,'easing':'cubic-bezier(.45,0,.55,1)','reducedMotion':'Static mark; textual loading status remains','keyboardTriggers':'No decorative motion'},
 'voice':{'englishDescriptor':'Auto Job Apply & Application Tracker','arabicDescriptor':'التقديم الآلي للوظائف ومتابعة الطلبات','englishLine':'Auto-apply to jobs. Track your applications.','arabicLine':'رتّب رحلة بحثك عن عمل.','rules':['Plain, calm, practical language','Describe application outcomes only when confirmed','Keep source identities and evidence intact']},
 'fontSources':[
  {'family':'Manrope','url':'https://github.com/google/fonts/tree/main/ofl/manrope','license':'SIL Open Font License 1.1'},
  {'family':'Noto Kufi Arabic','url':'https://github.com/google/fonts/tree/main/ofl/notokufiarabic','license':'SIL Open Font License 1.1'}],
 'limitations':['Domain is the intended brand address; this package does not publish or deploy the tracker','No claim of trademark clearance','Generated concept 04 is preserved separately as source; final logo assets are deterministic vector artwork']
}
(OUT/'tokens.json').write_text(json.dumps(tokens,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
sources=[]
for file in sorted((OUT/'fonts').glob('*')):
 sources.append({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT/'fonts'/'sources.json').write_text(json.dumps(sources,indent=2)+'\n',encoding='utf-8')
print(f'Built {len(list(OUT.glob("*.svg")))} SVG assets, local fonts and brand tokens in {OUT}')

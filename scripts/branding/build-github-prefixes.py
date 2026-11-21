"""Build GitHub typing outlines using the canonical brand shaping rules.
Requires fonttools and uharfbuzz, like build-assets.py. No other assets change.
"""
from pathlib import Path
from io import BytesIO
import json

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'brand'
PURPLE, INK, WHITE = '#5A2AFF', '#18181B', '#FFFFFF'
LATIN_LOGO = 'tawdheef.com'
ARABIC_LOGO = 'توظيف.كوم'
font_specs = {'latin': ('Manrope-variable.ttf', 750), 'arabic': ('NotoKufiArabic-variable.ttf', 750), 'caption': ('Manrope-variable.ttf', 500)}
fonts = {}
for key, (file, weight) in font_specs.items():
    font = instantiateVariableFont(TTFont(OUT/'fonts'/file), {'wght':weight}, inplace=False)
    stream=BytesIO(); font.save(stream)
    face=hb.Face(stream.getvalue()); hbfont=hb.Font(face); hbfont.scale=(face.upem,face.upem)
    fonts[key]=(font,hbfont)
# HarfBuzz emits separate named dot glyphs. Rework only these marks, never
# letter contours or counters. Match the original dot's narrower axis.
ARABIC_DOT_GLYPHS = {'dotabovear':1, 'twodotshorizontalabovear':2,
                     'twodotshorizontalbelowar':2, 'period':1}
arabic_glyphset = fonts['arabic'][0].getGlyphSet()
dot_bounds = BoundsPen(arabic_glyphset)
arabic_glyphset['dotabovear'].draw(dot_bounds)
ARABIC_DOT_SIDE = min(dot_bounds.bounds[2]-dot_bounds.bounds[0],
                      dot_bounds.bounds[3]-dot_bounds.bounds[1])

def square_dot_outline(glyphset, glyph_name, pen):
    recorded = RecordingPen(); glyphset[glyph_name].draw(recorded)
    contours = []; contour = None
    for operation, args in recorded.value:
        if operation == 'moveTo':
            if contour is not None: raise ValueError(f'Unclosed dot contour: {glyph_name}')
            contour = RecordingPen()
        if contour is None or operation == 'addComponent':
            raise ValueError(f'Unexpected dot glyph structure: {glyph_name}')
        getattr(contour, operation)(*args)
        if operation == 'closePath':
            contours.append(contour); contour = None
    if contour is not None or len(contours) != ARABIC_DOT_GLYPHS[glyph_name]:
        raise ValueError(f'Dot glyph changed; review its source: {glyph_name}')
    half = ARABIC_DOT_SIDE / 2
    for contour in contours:
        bounds = BoundsPen(glyphset); contour.replay(bounds)
        x0,y0,x1,y1 = bounds.bounds; cx,cy = (x0+x1)/2,(y0+y1)/2
        # Preserve each original dot centre and clockwise contour direction.
        pen.moveTo((cx-half,cy-half)); pen.lineTo((cx-half,cy+half))
        pen.lineTo((cx+half,cy+half)); pen.lineTo((cx+half,cy-half)); pen.closePath()

def outline(text, family='latin'):
    font, hbfont=fonts[family]
    buf=hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(hbfont,buf)
    glyphset=font.getGlyphSet(); pen=SVGPathPen(glyphset); bounds=BoundsPen(glyphset)
    x=y=0
    for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
        glyph_name=font.getGlyphName(info.codepoint); glyph=glyphset[glyph_name]
        transform=(1,0,0,1,x+pos.x_offset,y+pos.y_offset)
        target=TransformPen(pen,transform)
        if family=='arabic' and glyph_name in ARABIC_DOT_GLYPHS:
            square_dot_outline(glyphset,glyph_name,target)
        else:
            glyph.draw(target)
        # Retain original font bounds so letter scale, spacing and baseline
        # remain exact when the round dots become squares.
        glyph.draw(TransformPen(bounds,transform))
        x+=pos.x_advance; y+=pos.y_advance
    return pen.getCommands(),bounds.bounds

# Shape every complete prefix independently, preserving Arabic joining and
# square brand dots. All prefixes share the finished word's scale and baseline.
result = []
for word, family in [(LATIN_LOGO, 'latin'), (ARABIC_LOGO, 'arabic')]:
    _, (_, y0, _, y1) = outline(word, family)
    scale = 48 / (y1-y0)
    prefixes = []
    for count in range(1, len(word)+1):
        text = word[:count]
        d, (x0, _, x1, _) = outline(text, family)
        width = (x1-x0)*scale
        art = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="64" viewBox="0 0 {width} 64"><path fill="#5A2AFF" transform="translate({-x0*scale:.6f} {8+y1*scale:.6f}) scale({scale:.8f} {-scale:.8f})" d="{d}"/></svg>'
        prefixes.append({'text':text,'width':width,'svg':art})
    result.append({'text':word,'prefixes':prefixes})
target = OUT / 'github-hero' / 'prefixes.json'
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')
print('Saved joined brand wordmark prefixes:', target)

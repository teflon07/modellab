#!/usr/bin/env python3
"""Abstraction (arc-lite) pass/fail card from a JSON instance.

The card animates the test grid transforming into an output grid: PASS fills the
correct answer, FAIL fills a wrong transform (an explicit `fail` grid, else a
rot180 of the test as the archetypal 'applied the wrong rule'). On-brand dark.

Instance JSON: {"test": [[..]], "answer": [[..]], "model": "Fable 5",
                "fail": [[..]] (optional)}
Usage: render_arc.py --data arc.json --out card.gif
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

BG=(10,13,18); INK=(232,238,242); OK=(61,184,225); BAD=(232,119,119); DIM=(120,132,148)
VAL={0:(32,39,50), 1:(61,184,225), 2:(240,180,40), 3:(232,119,119)}
CELL=46; PAD=2; GAPX=44; PANELGAP=40; HEAD=48; CAP=34

def font(sz):
    for p in ("/System/Library/Fonts/Menlo.ttc","/System/Library/Fonts/SFNSMono.ttf"):
        try: return ImageFont.truetype(p,sz)
        except Exception: pass
    return ImageFont.load_default(size=sz)

def rot180(g): return [list(reversed(r)) for r in reversed(g)]

def draw_grid(d, g, ox, oy, n, reveal=None):
    k=0
    for r in range(n):
        for c in range(n):
            x0,y0=ox+c*CELL, oy+r*CELL
            shown = reveal is None or k<reveal
            col = VAL.get(g[r][c],(60,60,60)) if shown else (20,24,31)
            d.rectangle([x0+PAD,y0+PAD,x0+CELL-PAD,y0+CELL-PAD], fill=col)
            k+=1

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--pass-label", default=None); ap.add_argument("--fail-label", default="FAIL  ·  wrong transform")
    ap.add_argument("--duration", type=int, default=150)
    a=ap.parse_args()
    D=json.load(open(os.path.expanduser(a.data)))
    test, answer = D["test"], D["answer"]
    wrong = D.get("fail") or rot180(test)
    plabel = a.pass_label or f"PASS  ·  {D.get('model','model')}"
    n=len(test); GRID=n*CELL; PW=GRID+GAPX+GRID; PH=HEAD+GRID
    CARDW=PW*2+PANELGAP; CARDH=PH+CAP

    def panel(title, ok, out_grid, reveal):
        img=Image.new("RGB",(PW,PH),BG); d=ImageDraw.Draw(img)
        d.text((6,14), title, fill=(OK if ok else BAD), font=font(20))
        draw_grid(d, test, 0, HEAD, n)
        d.text((GRID+GAPX//2-11, HEAD+GRID//2-14), "→", fill=DIM, font=font(30))
        draw_grid(d, out_grid, GRID+GAPX, HEAD, n, reveal=reveal)
        return img

    frames=[]
    for rv in range(0, n*n+1):
        card=Image.new("RGB",(CARDW,CARDH),BG)
        card.paste(panel(a.fail_label, False, wrong, rv),(0,0))
        card.paste(panel(plabel, True, answer, rv),(PW+PANELGAP,0))
        d=ImageDraw.Draw(card)
        d.text((14, CARDH-CAP+8),
               "Abstraction: infer the hidden rule from 3 examples, then apply it to the test grid.",
               fill=DIM, font=font(17))
        frames.append(card)
    frames=[frames[0]]*6+frames+[frames[-1]]*16
    out=os.path.expanduser(a.out)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=a.duration, loop=0, optimize=True)
    print(f"wrote {out} {CARDW}x{CARDH} {len(frames)} frames {os.path.getsize(out)//1024} KB")

if __name__=="__main__": main()

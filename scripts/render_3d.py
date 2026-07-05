#!/usr/bin/env python3
"""3D-spatial (maze-3d) pass/fail card from a JSON instance.

Three stacked levels drawn side by side. The path moves within a level (UDLR) and
climbs/descends ladders (+/-). A climb is drawn as a line jumping from one level
grid to the next, so the vertical move is visible. PASS = the model's real solve;
FAIL = an explicit move string, or --auto-fail (beeline from S, never climbing,
until it clips a wall). Fail row on top, pass row below. On-brand dark, animated.

Instance JSON: {"levels": ["...","..."], "path": "RRRRR+...", "model": "Fable 5"}
Usage: render_3d.py --data spatial.json --out card.gif --auto-fail
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

BG=(10,13,18); WALL=(24,29,38); OPEN=(40,48,61); DIM=(120,132,148)
S_COL=(61,184,225); E_COL=(240,180,40); LAD=(150,120,232); OK=(61,184,225); BAD=(232,119,119)
CELL=20; HEAD=42; LGAP=26; ROWGAP=30; PAD=14; LEG=24
D={"U":(0,-1,0),"D":(0,1,0),"L":(0,0,-1),"R":(0,0,1),"+":(1,0,0),"-":(-1,0,0)}

def font(sz):
    for p in ("/System/Library/Fonts/Menlo.ttc","/System/Library/Fonts/SFNSMono.ttf"):
        try: return ImageFont.truetype(p,sz)
        except Exception: pass
    return ImageFont.load_default(size=sz)

def start(L):
    for z,lv in enumerate(L):
        for r,row in enumerate(lv):
            c=row.find("S")
            if c>=0: return (z,r,c)

def inb(L,z,r,c): return 0<=z<len(L) and 0<=r<len(L[z]) and 0<=c<len(L[z][r])

def walk(L, moves):
    z,r,c=start(L); st=[(z,r,c)]; broke=False
    for m in moves:
        dz,dr,dc=D[m]; z,r,c=z+dz,r+dr,c+dc
        if not inb(L,z,r,c) or L[z][r][c]=="#":
            broke=True; st.append((z,r,c)); break
        st.append((z,r,c))
    return st, broke

def auto_fail(L):
    z,r,c=start(L); best=""
    for m in "RLDU":
        s=""; rr,cc=r,c
        while True:
            dz,dr,dc=D[m]; nr,nc=rr+dr,cc+dc
            if inb(L,z,nr,nc) and L[z][nr][nc]!="#": rr,cc=nr,nc; s+=m
            else: s+=m; break
        if len(s)>len(best): best=s
    return best

def ladder_icon(d, x, y, cell):
    x1,x2=x+cell*0.32, x+cell*0.68; top,bot=y+cell*0.22, y+cell*0.78
    d.line([(x1,top),(x1,bot)], fill=(235,235,245), width=2)
    d.line([(x2,top),(x2,bot)], fill=(235,235,245), width=2)
    for f in (0.30,0.55,0.80):
        yy=y+cell*f; d.line([(x1,yy),(x2,yy)], fill=(235,235,245), width=2)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--fail"); ap.add_argument("--auto-fail", action="store_true")
    ap.add_argument("--pass-label", default=None)
    ap.add_argument("--fail-label", default="FAIL  ·  ignores the ladder, hits a wall")
    ap.add_argument("--duration", type=int, default=130)
    a=ap.parse_args()
    Dj=json.load(open(os.path.expanduser(a.data)))
    L=Dj["levels"]; PASS=Dj["path"]; nlev=len(L); side=len(L[0])
    FAIL=a.fail if a.fail else (auto_fail(L) if a.auto_fail else "")
    if not FAIL: ap.error("provide --fail MOVES or --auto-fail")
    plabel=a.pass_label or f"PASS  ·  {Dj.get('model','model')}  ·  climbs to E"
    lw=side*CELL

    def draw_row(moves, reveal):
        W=nlev*lw+(nlev-1)*LGAP; H=HEAD+side*CELL
        img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
        ox=[i*(lw+LGAP) for i in range(nlev)]
        for zi in range(nlev):
            d.text((ox[zi],12), f"L{zi}", fill=DIM, font=font(16))
            for r in range(side):
                for c in range(side):
                    ch=L[zi][r][c]; x=ox[zi]+c*CELL; yy=HEAD+r*CELL
                    col=WALL if ch=="#" else OPEN
                    if ch=="S": col=S_COL
                    elif ch=="E": col=E_COL
                    elif ch=="o": col=LAD
                    d.rectangle([x+1,yy+1,x+CELL-1,yy+CELL-1], fill=col)
                    if ch=="o": ladder_icon(d, x, yy, CELL)
        st,broke=walk(L,moves)
        def pt(z,r,c): return (ox[z]+c*CELL+CELL//2, HEAD+r*CELL+CELL//2)
        n=min(reveal,len(st)-1); prev=None
        for i in range(0,n+1):
            z,r,c=st[i]
            if not inb(L,z,r,c): continue
            red=broke and i==len(st)-1 and n==len(st)-1
            p=pt(z,r,c)
            if prev:
                climb = prev[0]!=z
                d.line([prev[1],p], fill=(BAD if red else OK), width=(3 if climb else 4))
            d.ellipse([p[0]-5,p[1]-5,p[0]+5,p[1]+5], fill=(BAD if red else OK)); prev=(z,p)
        return img

    fp,_=walk(L,FAIL); pp,_=walk(L,PASS); maxr=max(len(fp),len(pp))
    row=draw_row(FAIL,0); RW,RH=row.width,row.height
    CARDW=RW+2*PAD; CARDH=30+RH+ROWGAP+22+RH+LEG
    legend="Violet = ladder: the path line jumps to the next level when it climbs.  S start, E exit."
    frames=[]
    for t in range(0,maxr+1):
        card=Image.new("RGB",(CARDW,CARDH),BG); d=ImageDraw.Draw(card)
        d.text((PAD,6), a.fail_label, fill=BAD, font=font(19))
        card.paste(draw_row(FAIL,t),(PAD,30))
        ymid=30+RH+ROWGAP
        d.text((PAD,ymid-2), plabel, fill=OK, font=font(19))
        card.paste(draw_row(PASS,t),(PAD,ymid+22))
        d.text((PAD,CARDH-LEG+5), legend, fill=DIM, font=font(14))
        frames.append(card)
    frames+=[frames[-1]]*16
    out=os.path.expanduser(a.out)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=a.duration, loop=0, optimize=True)
    print(f"wrote {out} {CARDW}x{CARDH} {len(frames)} frames {os.path.getsize(out)//1024} KB")

if __name__=="__main__": main()

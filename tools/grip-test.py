# 拳にナイフを差した様子を元の解像度で試す（無料）。frames.json を書き出した後に使う
# python3 tools/grip-test.py 出力.png "ポーズ,x,y,度,back|front[,押し込み]" ...  （x,y は元の絵の拳の真ん中。export-hero.py の fists と同じ書き方）
import sys, json
from PIL import Image, ImageDraw
src={'idle':'assets/game/parts/p1rig/body.png','up':'assets/game/parts/poses/p2.png','strike':'assets/game/parts/poses/p3.png'}
meta=json.load(open('app/public/hero/frames.json'))['frames']['knife']
K=Image.open('assets/game/parts/gear/knife.png').convert('RGBA')
W,H=meta['size']; K=K.resize((W,H),Image.LANCZOS)
G=meta['guard']; px,py=meta['pivot']
def knife(deg, blade_only, shift):
    k=K.crop((0,0,W,round(H*G))) if blade_only else K
    # 回転の中心=握り。大きめの画布に置いて回す
    S=600; c=Image.new('RGBA',(S,S)); c.alpha_composite(k,(int(S/2-px*W),int(S/2-py*H-shift)))
    return c.rotate(-deg,resample=Image.BICUBIC,center=(S/2,S/2))
tiles=[]
for spec in sys.argv[2:]:
    n,x,y,deg,mode,*rest=spec.split(','); x,y,deg=int(x),int(y),float(deg); shift=float(rest[0]) if rest else 0
    body=Image.open(src[n]).convert('RGBA'); P=300
    can=Image.new('RGBA',(body.width+2*P,body.height+2*P),(60,70,90,255))
    kn=knife(deg, mode=='front', shift)
    if mode!='front': can.alpha_composite(kn,(x+P-300,y+P-300))
    can.alpha_composite(body,(P,P))
    if mode=='front': can.alpha_composite(kn,(x+P-300,y+P-300))
    t=can.crop((x+P-150,y+P-150,x+P+150,y+P+150)).convert('RGB')
    ImageDraw.Draw(t).text((5,5),spec,fill='yellow'); tiles.append(t)
o=Image.new('RGB',(300*min(4,len(tiles)),300*((len(tiles)+3)//4)))
for i,t in enumerate(tiles): o.paste(t,((i%4)*300,(i//4)*300))
o.save(sys.argv[1])

from PIL import Image, ImageDraw, ImageFont, ImageChops
S=4; W=1000*S
im=Image.new("RGB",(W,W),"#F6EFE3"); d=ImageDraw.Draw(im)
def c(x,y,r,fill): d.ellipse([(x-r)*S,(y-r)*S,(x+r)*S,(y+r)*S],fill=fill)
def e(b,fill): d.ellipse([v*S for v in b],fill=fill)
c(500,500,440,"#A8D8C8"); c(500,500,405,"#D3EEE5")
for x,y,r in [(215,300,14),(790,270,10),(815,520,13),(190,540,9)]: c(x,y,r,"#FFF8B2")
mask=Image.new("L",(W,W),0); ImageDraw.Draw(mask).ellipse([95*S,95*S,905*S,905*S],fill=255)
def clipped(draw_fn,color):
    global d
    L=Image.new("L",(W,W),0); draw_fn(ImageDraw.Draw(L))
    im.paste(Image.new("RGB",(W,W),color),(0,0),ImageChops.multiply(L,mask)); d=ImageDraw.Draw(im)
# hair back, falling to shoulders
clipped(lambda g:g.rounded_rectangle([285*S,200*S,715*S,700*S],radius=190*S,fill=255),"#8A6A55")
# sweater
clipped(lambda g:g.ellipse([170*S,640*S,830*S,1250*S],fill=255),"#FBF5EA")
d.rounded_rectangle([462*S,540*S,538*S,650*S],radius=28*S,fill="#F2C9B0")
# low ponytail over right shoulder
e([600,560,700,720],"#8A6A55"); c(628,575,20,"#F2B8A0")
# muffler
d.rounded_rectangle([360*S,615*S,640*S,700*S],radius=42*S,fill="#7CC2AC")
d.rounded_rectangle([395*S,660*S,460*S,820*S],radius=28*S,fill="#7CC2AC")
for yy in (720,760): d.line([400*S,yy*S,455*S,yy*S],fill="#B9E2D5",width=6*S)
# face
e([335,245,665,575],"#F9DCC8")
c(337,420,24,"#F5D3BD"); c(663,420,24,"#F5D3BD")
# side-swept bangs (smooth swoop)
d.pieslice([300*S,190*S,700*S,520*S],180,360,fill="#8A6A55")
FL=Image.new("L",(W,W),0); ImageDraw.Draw(FL).ellipse([335*S,245*S,665*S,575*S],fill=255)
SW=Image.new("L",(W,W),0); ImageDraw.Draw(SW).ellipse([395*S,315*S,760*S,640*S],fill=255)
LOW=Image.new("L",(W,W),0); ImageDraw.Draw(LOW).rectangle([0,355*S,W,W],fill=255)
skin=ImageChops.lighter(ImageChops.multiply(FL,SW),ImageChops.multiply(FL,LOW))
im.paste(Image.new("RGB",(W,W),"#F9DCC8"),(0,0),skin); d=ImageDraw.Draw(im)
# eyes
for x in (440,560):
    d.arc([(x-30)*S,400*S,(x+30)*S,450*S],200,340,fill="#5A4436",width=10*S)
c(408,478,28,"#F4B9A5"); c(592,478,28,"#F4B9A5")
d.arc([462*S,462*S,538*S,520*S],20,160,fill="#C9705A",width=9*S)
# label
f=ImageFont.truetype("scripts/lib/fonts/Jua-Regular.ttf",92*S)
txt="성글벙글"; bb=d.textbbox((0,0),txt,font=f); tw=bb[2]-bb[0]; th=bb[3]-bb[1]
x=(W-tw)//2; y=770*S
d.rounded_rectangle([x-36*S,y-22*S,x+tw+36*S,y+th+28*S],radius=55*S,fill="#FFF8B2",outline="#FFFFFF",width=8*S)
d.text((x-bb[0],y-bb[1]),txt,font=f,fill="#6B4E3D")
im=im.resize((1000,1000),Image.LANCZOS); im.save("content/affiliate/profile/seonggeul-profile.png")
mk=Image.new("L",(1000,1000),0); ImageDraw.Draw(mk).ellipse([0,0,1000,1000],fill=255)
pv=Image.new("RGB",(1000,1000),"white"); pv.paste(im,(0,0),mk); pv.save("content/affiliate/profile/round-preview.png")

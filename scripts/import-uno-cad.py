"""Derive planar UNO Rev3e artwork from Arduino's CC BY-SA 4.0 Eagle board.
Usage: python3 scripts/import-uno-cad.py path/to/UNO-TH_Rev3e.brd
3D package heights/materials are separate approximations, not present in Eagle.
"""
import sys, math, json, xml.etree.ElementTree as ET
from pathlib import Path
r=ET.parse(sys.argv[1]).getroot();b=r.find('.//board')
packages={(lib.get('name'),p.get('name')):p for lib in b.findall('./libraries/library') for p in lib.findall('./packages/package')}
def num(e,k,d=0): return float(e.get(k,d))
def point(e,x,y):
 a=math.radians(float(e.get('rot','R0').split('R')[-1])); mirror=-1 if 'M' in e.get('rot','') else 1
 return [round(num(e,'x')+mirror*x*math.cos(a)-y*math.sin(a),5),round(num(e,'y')+mirror*x*math.sin(a)+y*math.cos(a),5)]
model='mega' if 'MEGA' in Path(sys.argv[1]).name else 'uno'
outline=[];remaining=[dict(x.attrib) for x in b.findall('./plain/wire') if x.get('layer')=='20'];at=[float(remaining[0]['x1']),float(remaining[0]['y1'])]
while remaining:
 i=next((i for i,w in enumerate(remaining) if [float(w['x1']),float(w['y1'])]==at),None)
 if i is None: raise ValueError('Outline is not contiguous')
 w=remaining.pop(i); outline.append(at);at=[float(w['x2']),float(w['y2'])]
 # Preserve rounded corners using the Eagle arc sweep.
 angle=math.radians(float(w.get('curve',0)))
 if angle:
  x,y=outline[-1];dx,dy=at[0]-x,at[1]-y
  cx=(x+at[0])/2-dy/(2*math.tan(angle/2));cy=(y+at[1])/2+dx/(2*math.tan(angle/2))
  start=math.atan2(y-cy,x-cx);rad=math.hypot(x-cx,y-cy)
  for k in range(1,8): outline.append([round(cx+rad*math.cos(start+angle*k/8),5),round(cy+rad*math.sin(start+angle*k/8),5)])
pads=[];elements=[];headers={};silk=[];traces=[];texts=[]
for w in b.findall('./plain/wire'):
 if w.get('layer')=='21': silk.append([num(w,'x1'),num(w,'y1'),num(w,'x2'),num(w,'y2'),num(w,'width')])
for t in b.findall('./plain/text'):
 if t.get('layer')=='21' and t.text: texts.append({'x':num(t,'x'),'y':num(t,'y'),'text':t.text,'size':num(t,'size'),'angle':float(t.get('rot','R0').split('R')[-1])})
for e in b.findall('./elements/element'):
 if 'M' in e.get('rot','') or e.get('value')=='DNP':continue
 p=packages[(e.get('library'),e.get('package'))];name=e.get('name');ep=[]
 for pad in list(p.findall('pad'))+list(p.findall('smd')):
  x,y=point(e,num(pad,'x'),num(pad,'y'));d=num(pad,'diameter',num(pad,'drill',0.4)*1.8)
  dx=num(pad,'dx',d);dy=num(pad,'dy',d)
  if int(float(e.get('rot','R0').split('R')[-1]))%180:dx,dy=dy,dx
  item={'x':x,'y':y,'w':dx,'h':dy,'drill':num(pad,'drill'),'name':pad.get('name'),'element':name};pads.append(item);ep.append(item)
 if p.get('name').startswith(('1X','2X')):headers[name]={p['name']:[p['x'],p['y']] for p in ep}
 for w in p.findall('wire'):
  if w.get('layer')=='21':silk.append(point(e,num(w,'x1'),num(w,'y1'))+point(e,num(w,'x2'),num(w,'y2'))+[num(w,'width')])
 if not ep or name.startswith(('TP_','GND_TP','FD')) or name in ['GROUND','RESET-EN']:continue
 name=e.get('name');value=e.get('value','');package=e.get('package');x,y=point(e,0,0)
 kind='smd';height=0.65
 if package.startswith(('1X','2X')):kind='header';height=7
 elif name=='X2':kind='usb';height=10.8
 elif name=='X1':kind='barrel';height=10.5
 elif name=='RESET':kind='button';height=3.2
 elif name.startswith('PC'):kind='can';height=5.4
 elif name in ['ON','L','RX','TX']:kind='led';height=0.7
 elif name.startswith(('U','IC')) or name in ['ZU4','T1'] or name.startswith('RN'):kind='ic';height=3 if name=='ZU4' else 1.3
 elif name in ['Y1','Y2']:kind='crystal';height=2
 # Body spans package silkscreen excluding text (or inset pads for tiny SMDs).
 xy=[]
 for w in p.findall('wire'):
  if w.get('layer')=='21':xy.extend([point(e,num(w,'x1'),num(w,'y1')),point(e,num(w,'x2'),num(w,'y2'))])
 if not xy:xy=[[z['x']-z['w']/2,z['y']-z['h']/2] for z in ep]+[[z['x']+z['w']/2,z['y']+z['h']/2] for z in ep]
 xmin,ymin=min(z[0] for z in xy),min(z[1] for z in xy);xmax,ymax=max(z[0] for z in xy),max(z[1] for z in xy)
 if name=='ZU4':xmin,xmax,ymin,ymax=28.3,64.4,13.0,19.8
 if kind=='header':xmin=min(z['x'] for z in ep)-1.27;xmax=max(z['x'] for z in ep)+1.27;ymin=min(z['y'] for z in ep)-1.27;ymax=max(z['y'] for z in ep)+1.27
 elements.append({'name':name,'value':value,'kind':kind,'x':xmin,'y':ymin,'w':xmax-xmin,'h':ymax-ymin,'height':height,'pads':ep})
for s in b.findall('./signals/signal'):
 for w in s.findall('wire'):
  if w.get('layer')=='1':traces.append([num(w,'x1'),num(w,'y1'),num(w,'x2'),num(w,'y2'),num(w,'width')])
mounts=[{'x':num(h,'x'),'y':num(h,'y'),'d':num(h,'drill')} for h in b.findall('./plain/hole')]
# Eagle has +Y upward; the table/SVG frame has +Y downward. Reflect once.
height=53.34
for p in outline:p[1]=round(height-p[1],5)
for p in mounts:p['y']=round(height-p['y'],5)
for p in pads:p['y']=round(height-p['y'],5)
for group in headers.values():
 for p in group.values():p[1]=round(height-p[1],5)
for e in elements:e['y']=round(height-e['y']-e['h'],5)
for line in silk+traces:line[1]=round(height-line[1],5);line[3]=round(height-line[3],5)
for t in texts:t['y']=round(height-t['y'],5)
data={'outline':outline,'mounts':mounts,'headers':headers,'pads':pads,'elements':elements,'silk':silk,'traces':traces,'texts':texts}
Path(f'lib/workbench/cad/{model}-rev3e.ts').write_text(f'// Derived from Arduino {Path(sys.argv[1]).name}. © Arduino. CC BY-SA 4.0.\n// See public/models/arduino-cad-NOTICE.md; generated by scripts/import-uno-cad.py.\nexport const {model}CAD = '+json.dumps(data,separators=(',',':'))+';\n')
print({k:len(v) for k,v in data.items()})

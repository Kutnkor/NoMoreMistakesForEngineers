"""Train a small neural classifier on synthetic, design-disjoint circuit groups.
Usage: python3 scripts/train-fault-model.py INPUT_JSON OUTPUT_DIRECTORY
Only NumPy is required. Validation selects the epoch; the test set is evaluated once.
"""
import json, sys, hashlib
from pathlib import Path
import numpy as np

source=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
data=json.loads(source.read_text());ds=data['datasets'];random=np.random.default_rng(60260905)
group_sets=[set(ds[s]['groups']) for s in ['train','val','test']]
assert all(not(group_sets[i]&group_sets[j]) for i in range(3) for j in range(i+1,3))
def arrays(split):
 return np.array([r['x'] for r in ds[split]['rows']],dtype=np.float64),np.array([r['y'] for r in ds[split]['rows']])
x,y=arrays('train');v,vy=arrays('val')
mean=x.mean(0);scale=np.maximum(x.std(0),.02);x=(x-mean)/scale;v=(v-mean)/scale
p=[random.normal(0,1/np.sqrt(24),(24,32)),np.zeros(32),random.normal(0,1/np.sqrt(32),(32,6)),np.zeros(6)]
mom=[np.zeros_like(z) for z in p];vel=[np.zeros_like(z) for z in p];step=0;best_loss=float('inf');best=None;history=[]
def predict(x,p):
 h=np.tanh(x@p[0]+p[1]);logits=h@p[2]+p[3];z=np.exp(logits-logits.max(1,keepdims=True));return h,z/z.sum(1,keepdims=True)
for epoch in range(1,251):
 for ix in np.array_split(random.permutation(len(x)),40):
  bx=x[ix];h,prob=predict(bx,p);grad=prob.copy();grad[np.arange(len(ix)),y[ix]]-=1;grad/=len(ix)
  dh=(grad@p[2].T)*(1-h*h)
  grads=[bx.T@dh+1e-4*p[0],dh.sum(0),h.T@grad+1e-4*p[2],grad.sum(0)]
  step+=1
  for k,g in enumerate(grads):
   mom[k]=.9*mom[k]+.1*g;vel[k]=.999*vel[k]+.001*g*g
   p[k]-=.002*(mom[k]/(1-.9**step))/(np.sqrt(vel[k]/(1-.999**step))+1e-8)
 if epoch%5==0:
  _,vp=predict(v,p);loss=float(-np.log(np.maximum(vp[np.arange(len(vy)),vy],1e-12)).mean());acc=float((vp.argmax(1)==vy).mean())
  history.append({'epoch':epoch,'validationLoss':loss,'validationAccuracy':acc})
  if loss<best_loss:best_loss=loss;best=[z.copy() for z in p];best_epoch=epoch
  if epoch%50==0:print(epoch,round(loss,4),round(acc,4),flush=True)
p=best
test,ty=arrays('test');test=(test-mean)/scale;_,probs=predict(test,p);pred=probs.argmax(1)
threshold=.60;accepted=probs.max(1)>=threshold
matrix=np.zeros((6,7),dtype=int)
for actual,guess,ok in zip(ty,pred,accepted):matrix[actual,guess if ok else 6]+=1
healthy=ty==0;faulty=~healthy
tp=((pred==ty)&accepted).sum();false_alarm=((pred!=0)&accepted&healthy).sum();missed=((pred==0)&accepted&faulty).sum()
model={'version':'fault-mlp-1.0','labels':data['labels'],'mean':mean.tolist(),'scale':scale.tolist(),'w1':p[0].tolist(),'b1':p[1].tolist(),'w2':p[2].tolist(),'b2':p[3].tolist(),'threshold':threshold,'trainingDomain':{k:data['domain'][k] for k in ['a0Db','gbwHz']}}
(out/'fault-mlp.json').write_text(json.dumps(model,separators=(',',':'))+'\n')
report={'version':model['version'],'seed':60260905,'datasetSeed':data['seed'],'dataSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'modelSha256':hashlib.sha256((out/'fault-mlp.json').read_bytes()).hexdigest(),'architecture':'24 residual AC features → 32 tanh hidden units → 6 softmax classes','optimizer':'Adam, learning rate 0.002, weight decay 0.0001, 40 minibatches/epoch, 250 epochs','selectedEpoch':best_epoch,'selection':'Minimum validation cross entropy; test evaluated only after model freeze. Fixed confidence-score threshold 0.60; scores are not calibrated probabilities.','splits':{s:{'designs':len(ds[s]['groups']),'samples':len(ds[s]['rows']),'groupsSha256':hashlib.sha256('|'.join(sorted(ds[s]['groups'])).encode()).hexdigest()} for s in ds},'designOverlap':0,'labels':data['labels'],'confusionColumns':data['labels']+['uncertain'],'confusionMatrix':matrix.tolist(),'test':{'samples':len(ty),'top1AccuracyPct':100*float((pred==ty).mean()),'correctIncludingUncertainAsWrongPct':100*float(tp/len(ty)),'coveragePct':100*float(accepted.mean()),'acceptedAccuracyPct':100*float(tp/max(1,accepted.sum())),'healthySamples':int(healthy.sum()),'falseAlarms':int(false_alarm),'falseAlarmPct':100*float(false_alarm/healthy.sum()),'faultySamples':int(faulty.sum()),'missedFaults':int(missed),'missedFaultPct':100*float(missed/faulty.sum()),'uncertain':int((~accepted).sum())},'domain':data['domain'],'noise':data['noise'],'faults':data['faults'],'limitations':['Synthetic single-fault AC measurements with known nominal circuit and excitation.','No hardware, manufacturer fault data or simultaneous-fault validation.','Only six trained classes; score threshold can defer but is not a proven out-of-distribution detector.'],'validationHistory':history,'parityFixture':{'features':ds['test']['rows'][0]['x'],'scores':probs[0].tolist()}}
(out/'fault-model-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['test'],indent=2),flush=True)

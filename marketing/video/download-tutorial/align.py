import subprocess,re,json,functools
out=subprocess.run(['ffmpeg','-hide_banner','-i','vo.mp3','-af','silencedetect=n=-32dB:d=0.25','-f','null','-'],capture_output=True,text=True).stderr
st=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',out)]; en=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',out)]
ch=[];prev=en[0]
for s,e in zip(st[1:],en[1:]): ch.append((prev,s,e-s)); prev=e
syl=[4,22,16,19,10,23,17,11,12,10,8,32,6,26,5,11,11,10,13,16,10,22,7,18,14,21,36,6,19,20,7]
n=len(ch);P=len(syl)
rate=sum(c[1]-c[0] for c in ch)/sum(syl)
import sys; sys.setrecursionlimit(10000)
@functools.lru_cache(None)
def f(i,p):
    if p==P: return (0 if i==n else 1e9,())
    best=(1e9,())
    for j in range(i+1,min(n,i+12)+1):
        if n-j < P-p-1: break
        d=sum(c[1]-c[0] for c in ch[i:j]); exp=syl[p]*rate
        cost=((d-exp)/exp)**2 + 0.6*max(0,0.5-(ch[j-1][2] if j<n else 1))
        r=f(j,p+1)
        if cost+r[0]<best[0]: best=(cost+r[0],((i,j),)+r[1])
    return best
c,seg=f(0,0)
res=[]
for k,((i,j),s) in enumerate(zip(seg,syl)):
    res.append({'p':k+1,'t0':round(ch[i][0],2),'t1':round(ch[j-1][1],2),'chunks':[round(x[0],2) for x in ch[i:j]]})
    print(k+1,s,res[-1]['t0'],res[-1]['t1'],res[-1]['chunks'])
json.dump(res,open('align.json','w'))

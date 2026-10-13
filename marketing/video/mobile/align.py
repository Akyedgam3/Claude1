import subprocess,re,sys
out=subprocess.run(['ffmpeg','-hide_banner','-i','vo_orig.mp3','-af','silencedetect=n=-32dB:d=0.12','-f','null','-'],capture_output=True,text=True).stderr
st=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',out)]; en=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',out)]
# speech chunks
ch=[]; prev=en[0]
for s,e in zip(st[1:],en[1:]): ch.append((prev,s,e-s)); prev=e
names='A B C D E F G H I J K L M N O P Q R S T U'.split()
syl=[7,6,6,3,16,20,7,16,11,14,11,6,13,19,15,11,20,6,21,19,7]
n=len(ch); P=len(syl)
rate=sum(c[1]-c[0] for c in ch)/sum(syl)
import functools
@functools.lru_cache(None)
def f(i,p):
    # phrases p.. starting at chunk i
    if p==P: return (0 if i==n else 1e9,[])
    best=(1e9,[])
    for j in range(i+1,n+1-(P-p-1)):
        d=sum(c[1]-c[0] for c in ch[i:j]); exp=syl[p]*rate
        cost=((d-exp)/exp)**2
        gap=ch[j-1][2] if j<n else 1
        cost+= 0.3*max(0,0.4-gap)  # prefer long pauses at boundaries
        r=f(j,p+1)
        if cost+r[0]<best[0]: best=(cost+r[0],[(i,j)]+r[1])
    return best
c,seg=f(0,0)
for nm,(i,j),s in zip(names,seg,syl): print(nm,s,f"{ch[i][0]:.2f}-{ch[j-1][1]:.2f}",'chunks',j-i, f"next pause {ch[j-1][2]:.2f}")

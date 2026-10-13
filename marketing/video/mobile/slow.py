# يبطّئ الصوت: سكتات أطول بين الجمل + سرعة 0.93 بدون تغيير طبقة الصوت
import subprocess,re,json,numpy as np,wave
SR=48000
raw=subprocess.run(['ffmpeg','-v','error','-i','vo_orig.mp3','-ac','1','-ar',str(SR),'-f','s16le','-'],capture_output=True).stdout
a=np.frombuffer(raw,np.int16).astype(np.float32)
out=subprocess.run(['ffmpeg','-hide_banner','-i','vo_orig.mp3','-af','silencedetect=n=-32dB:d=0.12','-f','null','-'],capture_output=True,text=True).stderr
st=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',out)][1:]; en=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',out)][1:]
# حدود الجمل (رقم المقطع الأخير بكل جملة) من align.py
ends=[1,2,3,4,6,9,10,13,14,16,18,19,21,25,28,30,33,34,38,42,44]  # تراكمي
names='A B C D E F G H I J K L M N O P Q R S T U'.split()
extra={}
for k,(nm,e) in enumerate(zip(names,ends)):
    if e>=len(st)+1: continue
    gap={'A':0.25,'B':0.1,'C':0.3,'D':0.25,'F':0.35,'I':0.35,'K':0.35,'M':0.3,'N':0.35,'O':0.45,'P':0.45,'Q':0.35,'R':0.25,'S':0.4,'T':0.4}.get(nm,0.25)
    extra[e-1]=gap   # بعد المقطع رقم e (فهرس السكتة e-1)
# جوا الأرقام: سكتات أوضح بين المجموعات
for i in range(34,42):
    extra.setdefault(i,0.12)
pieces=[];prev=0
for i,(s,e) in enumerate(zip(st,en)):
    mid=int((s+e)/2*SR)
    pieces.append(a[prev:mid]); 
    if i in extra: pieces.append(np.zeros(int(extra[i]*SR),np.float32))
    prev=mid
pieces.append(a[prev:])
b=np.concatenate(pieces).astype(np.int16)
with wave.open('vo_gap.wav','wb') as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(b.tobytes())
subprocess.run(['ffmpeg','-v','error','-y','-i','vo_gap.wav','-af','atempo=0.93','-ar','48000','vo.wav'],check=True)
print('added',round(sum(extra.values()),2))

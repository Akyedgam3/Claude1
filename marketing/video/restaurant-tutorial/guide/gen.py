import html
FONTS = ''.join(f"@font-face{{font-family:Cairo;font-weight:{w};src:url(cairo-{s}-{w}-normal.woff2);unicode-range:{r}}}\n"
  for w in (400,700,900) for s,r in (('arabic','U+0600-06FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC'),('latin','U+0000-00FF,U+2000-206F,U+20AC')))
CSS = FONTS + """
@page{size:A4;margin:0}
:root{--g:#0f6e5c;--g2:#14957c;--g3:#5fe0bf;--c:#d9792a;--ink:#1d2433;--muted:#6b7385;--line:#e3e6eb;--soft:#f4f6f5;--deep:#071a17;--deep2:#0f3a33}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Cairo,sans-serif;color:var(--ink);line-height:1.75;font-size:11.5pt}
.page{width:210mm;height:297mm;padding:16mm 15mm 14mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}
.page:last-child{page-break-after:auto}
.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--line);padding-bottom:3mm;margin-bottom:6mm;font-size:9.5pt;color:var(--muted)}
.hdr b{color:var(--g)}
.foot{position:absolute;bottom:7mm;left:15mm;right:15mm;display:flex;justify-content:space-between;font-size:8.5pt;color:var(--muted)}
.kick{display:inline-block;background:var(--g);color:#fff;font-weight:900;border-radius:99px;padding:.5mm 4mm;font-size:10pt}
h2{font-size:21pt;font-weight:900;margin:2mm 0 1mm;color:var(--deep2)}
.lead{color:var(--muted);margin-bottom:4mm}
ol.steps{list-style:none;counter-reset:s;margin:3mm 0}
ol.steps li{counter-increment:s;position:relative;padding-right:9mm;margin-bottom:2mm}
ol.steps li::before{content:counter(s);position:absolute;right:0;top:.6mm;width:6.2mm;height:6.2mm;border-radius:50%;background:var(--g2);color:#fff;font-weight:900;font-size:9pt;display:flex;align-items:center;justify-content:center;line-height:1}
b.k{background:#e8f5f1;color:var(--g);border:1px solid #bfe3d8;border-radius:1.5mm;padding:0 1.6mm;font-weight:700;white-space:nowrap}
figure{margin:3mm 0 4mm;border:1px solid var(--line);border-radius:3mm;overflow:hidden;box-shadow:0 1mm 4mm rgba(0,0,0,.06)}
figure img{display:block;width:100%}
figcaption{font-size:9pt;color:var(--muted);padding:1.5mm 3mm;background:var(--soft);border-top:1px solid var(--line)}
.row{display:flex;gap:5mm;align-items:flex-start}.row>*{flex:1}
.tip{background:#fff6ec;border:1px solid #f3d3b0;border-right:4px solid var(--c);border-radius:2.5mm;padding:2.5mm 4mm;margin:3mm 0;font-size:10.5pt}
.tip b:first-child{color:var(--c)}
.cover{background:radial-gradient(120% 80% at 80% 10%,#16584c 0,var(--deep2) 40%,var(--deep) 100%);color:#fff;padding:22mm 18mm;display:flex;flex-direction:column}
.cover img.logo{width:30mm}
.cover h1{font-size:40pt;font-weight:900;line-height:1.25;margin-top:16mm}
.cover h1 span{color:var(--g3)}
.cover p{font-size:13pt;opacity:.85;margin-top:4mm;max-width:150mm}
.cover .shot{margin-top:auto;border-radius:4mm;overflow:hidden;border:1px solid rgba(255,255,255,.2);box-shadow:0 4mm 12mm rgba(0,0,0,.4)}
.cover .shot img{width:100%;display:block}
.toc{margin-top:6mm}
.toc div{display:flex;align-items:center;gap:4mm;border-bottom:1px dashed var(--line);padding:2.6mm 0;font-size:12.5pt}
.toc i{font-style:normal;width:9mm;height:9mm;border-radius:2.5mm;background:var(--g);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center}
.toc span{color:var(--muted);font-size:10pt;margin-right:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:3mm 6mm;margin-top:3mm}
.card{border:1px solid var(--line);border-radius:3mm;padding:3mm 4mm;background:var(--soft)}
.card h4{color:var(--g);font-size:11.5pt}
.card p{font-size:10pt;color:#444b5a}
.bill{width:52mm;flex:0 0 52mm!important}
.end{background:linear-gradient(160deg,var(--deep2),var(--deep));color:#fff;border-radius:5mm;padding:8mm;text-align:center;margin-top:6mm}
.end h3{font-size:18pt;font-weight:900}.end p{opacity:.85}
.end .url{direction:ltr;font-weight:700;color:var(--g3);font-size:13pt;margin-top:2mm}
"""
pages=[]; n=[0]
def page(body, chap=''):
    n[0]+=1
    pages.append(f'<section class="page"><div class="hdr"><span><b>ميزان</b> · دليل قسم المطعم والكافيه</span><span>{chap}</span></div>{body}<div class="foot"><span>akyedgam3.github.io/mizan-updates</span><span>{n[0]}</span></div></section>')
def fig(name, cap, h=None, pos='center'): return f'<figure><img src="shots/{name}.jpg"'+(f' style="height:{h}mm;object-fit:cover;object-position:{pos}"' if h else '')+f'><figcaption>{cap}</figcaption></figure>'
def steps(*xs): return '<ol class="steps">'+''.join(f'<li>{x}</li>' for x in xs)+'</ol>'
def tip(x): return f'<div class="tip"><b>نصيحة:</b> {x}</div>'
def k(x): return f'<b class="k">{x}</b>'
def head(i, ord_, t, lead): return f'<span class="kick">{ord_}</span><h2>{t}</h2><p class="lead">{lead}</p>'

cover = f'''<section class="page cover"><img class="logo" src="logo.png">
<h1>دليل قسم<br><span>المطعم والكافيه</span></h1>
<p>كل شي بتحتاجه لتشغّل مطعمك على ميزان: الطاولات، المنيو بمكوّناتها، طلبات الصالة، شاشة المطبخ، السفري والتوصيل، الحساب، وإغلاق آخر الليل — خطوة بخطوة ومع صور من البرنامج.</p>
<div class="shot"><img src="shots/tables_busy.jpg"></div></section>'''
pages.append(cover)

chs=[('أولاً','تجهيز المطعم','الصالات والطاولات'),('ثانياً','المنيو والأصناف','الأسعار والمكوّنات'),('ثالثاً','طلب طاولة','من أول صنف لإرسال المطبخ'),
     ('رابعاً','شاشة المطبخ','الطلبات الجاهزة'),('خامساً','السفري والتوصيل','طلبات بدون طاولة'),('سادساً','نقل ودمج الطاولات','الزبون غيّر مكانه'),
     ('سابعاً','الحساب','الدفع والفاتورة'),('ثامناً','آخر الليل','إغلاق اليوم والأرباح')]
toc = ''.join(f'<div><i>{i+1}</i><b>{t}</b><span>{d}</span></div>' for i,(o,t,d) in enumerate(chs))
page(f'''<h2>شو في بهالدليل؟</h2><p class="lead">الدليل ماشي بنفس ترتيب شغل المطعم بيوم عادي — من تجهيز الطاولات الصبح لإغلاق الصندوق آخر الليل. كل فصل فيه الخطوات وصورة من البرنامج.</p>
<div class="toc">{toc}</div>
<div class="grid2" style="margin-top:8mm">
<div class="card"><h4>بيشتغل بدون إنترنت</h4><p>كل البيانات على جهازك، والشغل ما بيوقف إذا انقطع النت.</p></div>
<div class="card"><h4>أكتر من جهاز</h4><p>الكاشير، الكابتن وشاشة المطبخ بيشتغلوا سوا على الشبكة المحلية (الراوتر) بالمحل.</p></div>
<div class="card"><h4>المخزون لحالو</h4><p>كل صنف بينباع بينقص مكوّناته من المخزون أوتوماتيك.</p></div>
<div class="card"><h4>ليرة ودولار</h4><p>بتسجّل وبتقبض بالليرة أو بالدولار حسب سعر الصرف.</p></div>
</div>''','المحتويات')

page(head(1,'أولاً','تجهيز المطعم','بعد ما تعمل شركتك، اختار نوع الشغل '+k('مطعم وكافيه')+' — ميزان بيجهّزلك الطاولات والمطبخ والمنيو.')
 + fig('new_company','اختيار نوع الشغل «مطعم وكافيه» عند إنشاء الشركة')
 + steps('من القائمة الجانبية روح على '+k('الطاولات والطلبات')+'.',
         'فوق بتشوف صالات المطعم: '+k('الصالة')+'، '+k('التراس')+'، '+k('العائلي')+' — وكل صالة إلها طاولاتها.',
         'وفوقها ملخّص المطعم: كم طاولة مشغولة، كم طلب مفتوح، وقديش مبيعات اليوم.')
 + fig('tables','شاشة الطاولات: الصالات، الطاولات، وملخّص اليوم'), 'تجهيز المطعم')

page(steps('لتضيف طاولة: اكبس '+k('الطاولات')+' ثم '+k('إضافة طاولة')+'، اكتب اسمها وعدد الكراسي واختار الصالة.',
           'إذا بدك تضيف كذا طاولة مرة وحدة: '+k('إضافة مجموعة طاولات')+' — اكتب كم طاولة بدك وبأي صالة، وبيترقّموا لحالهم.')
 + fig('add_table','إضافة طاولة: الاسم، عدد الكراسي، والصالة')
 + fig('add_group','إضافة مجموعة طاولات دفعة وحدة')
 + tip('سمّي الصالات متل ما بيسمّيها الكابتن عندك (صالة، تراس، عائلي، فوق…) — بتصير الطلبات أسرع وأوضح.'), 'تجهيز المطعم')

page(head(2,'ثانياً','المنيو والأصناف','المنيو بميزان هي المواد اللي بتبيعها. كل صنف إلو سعر، تصنيف، ومكوّنات.')
 + steps('روح على '+k('المواد')+' واكبس '+k('+ صنف جديد')+'.',
         'بتبويب '+k('الأساسي')+': اكتب اسم الصنف (مثلاً «شاورما دجاج سندويش») واختار تصنيفه: مشاوي، مقبلات، مشروبات، حلويات…',
         'التصنيفات هي اللي بتطلع أزرار بشاشة الطلب — فاختارها مرتّبة.',
         'بتبويب '+k('الأسعار والوحدات')+': حط سعر البيع.')
 + fig('items','قائمة الطعام والمواد بتصنيفاتها'), 'المنيو')

page(steps('بتبويب '+k('المكوّنات')+' بتحدد شو بيدخل بالصنف: مثلاً السندويشة = رغيف خبز + 120 غرام صدر دجاج + صوص.',
           'اختار المكوّنات من المواد الأولية وحط الكمية لكل وحدة بتنباع، ثم '+k('حفظ')+'.',
           'من هلق وطالع: كل ما تبيع سندويشة، ميزان بينقّص الخبز والدجاج والصوص من المخزون لحالو.')
 + fig('item_recipe','تبويب المكوّنات: شو بينقص من المخزون مع كل صنف بينباع')
 + tip('بآخر الشهر بتعرف قديش صرفت لحمة ودجاج، وشو لازم تشتري، وقديش كلفة كل صنف ورِبحه الحقيقي. المواد الأولية بتدخل المخزون من فاتورة شراء من التاجر.'), 'المنيو')

page(head(3,'ثالثاً','طلب طاولة','إجا زبون وقعد على طاولة؟ هيك بتفتحله طلب.')
 + steps('من '+k('الطاولات والطلبات')+' اكبس على الطاولة — بينفتح الطلب.',
         'على اليمين المنيو بتصنيفاتها، وعلى اليسار الطلب. اكبس على الصنف — كل كبسة بتزيد واحد.',
         'الزبون بدو شي خاص؟ اكبس على الملاحظة تحت الصنف: '+k('حار')+'، '+k('بدون بصل')+'، '+k('بدون ثوم')+'… وبتنطبع للمطبخ.')
 + fig('order_items','شاشة الطلب: المنيو يمين والطلب يسار، مع ملاحظات المطبخ'), 'طلب طاولة')

page(steps('فوق الطلب بتكتب '+k('الضيوف')+' (عدد الأشخاص) و'+k('الكابتن')+' اللي ماسك الطاولة.',
           'إذا عندك رسم خدمة: اكتب النسبة بخانة '+k('خدمة %')+' وبينحسب لحالو على الحساب.',
           'اكبس '+k('إرسال للمطبخ')+' — الأصناف بتروح للمطبخ، وبتنطبع تذكرة المطبخ إذا عندك طابعة.',
           'الزبون طلب زيادة بعدين؟ ضيفها عادي واكبس إرسال للمطبخ مرة تانية — بيروح الجديد بس.')
 + fig('order_sent','بعد الإرسال للمطبخ: الأصناف معلّمة «بالمطبخ»')
 + tip('ارجع لشاشة الطاولات: الطاولة صارت مشغولة ومكتوب عليها قديش الحساب ومن قديش مفتوحة.'), 'طلب طاولة')

page(head(4,'رابعاً','شاشة المطبخ','حط بالمطبخ شاشة أو كمبيوتر تاني وافتح عليه '+k('شاشة المطبخ')+'.')
 + fig('kitchen','شاشة المطبخ: كل طلب ببطاقة مع الملاحظات والوقت')
 + steps('الطبّاخ بيشوف كل الطلبات اللي لازم تنعمل، كل طلب ببطاقة مع الملاحظات وقديش صار إلو.',
         'الطلب الأقدم بيطلع أول.',
         'خلص صنف؟ بيكبس عليه '+k('جاهز')+'. خلص الطلب كلو؟ بيكبس '+k('الطلب كلو جاهز')+'.',
         'على شاشة الطاولات بتظهر الطاولة '+k('جاهز للتقديم')+' — الكابتن بيعرف إنو يقدّم.')
 + tip('الأجهزة بتتربط ببعض عن طريق الشبكة المحلية بالمحل (الراوتر) — بدون إنترنت.'), 'شاشة المطبخ')

page(head(5,'خامساً','السفري والتوصيل','طلبات بدون طاولة — بنفس السهولة.')
 + steps('زبون بدو ياخد معو؟ اكبس '+k('سفري')+' — بينفتح طلب متل الطاولة بس بدون طاولة.',
         'بدو توصيل؟ اكبس '+k('توصيل')+' واكتب اسم الزبون، رقم موبايله، وعنوانه، و'+k('أجور التوصيل')+'.',
         'كمّل الطلب عادي وابعتو للمطبخ.',
         'طلبات السفري والتوصيل بتضل ظاهرة تحت '+k('طلبات سفري وتوصيل مفتوحة')+' لحد ما تسكّر حسابها.')
 + fig('delivery','طلب توصيل: اسم الزبون والموبايل والعنوان'), 'السفري والتوصيل')

page(head(6,'سادساً','نقل ودمج الطاولات','الزبون غيّر رأيه؟ ولا طاولتين بدهن حساب واحد؟')
 + steps('الزبون قعد جوّا وبعدين بدو التراس؟ افتح طلبو واكبس '+k('نقل')+' واختار الطاولة الجديدة — الطلب كلو بينتقل معو.',
         'طاولتين أصحاب وبدهن يدفعوا حساب واحد؟ افتح وحدة منهن واكبس '+k('دمج')+' واختار التانية — بيصيروا حساب واحد.')
 + fig('move','نقل الطلب لطاولة تانية',76)
 + fig('merge','دمج طاولتين بحساب واحد',76), 'نقل ودمج')

page(head(7,'سابعاً','الحساب','الزبون خلص وطلب الحساب.')
 + '<div class="row"><div>'
 + steps('افتح الطاولة واكبس '+k('طباعة الحساب')+' — بتطلع ورقة الحساب للزبون يشوفها.',
         'لما يدفع: اختار طريقة الدفع '+k('نقدي')+' أو '+k('بطاقة / حوالة')+' أو '+k('على الحساب')+' (للزبون الدائم، بيدفع آخر الشهر).',
         'اكتب المبلغ اللي استلمته بخانة '+k('المستلم')+' — البرنامج بيقلك قديش '+k('الباقي للزبون')+'.',
         'فيك تحط '+k('خصم')+' إذا بدك.',
         'اكبس '+k('الحساب وإغلاق الطلب')+' — بينطبع الإيصال على الطابعة الحرارية والطاولة بترجع فاضية للزبون الجاي.')
 + tip('كل شي بينحسب بالليرة أو بالدولار حسب عملتك وسعر الصرف.')
 + '</div><div class="bill">'+fig('bill','إيصال 80مم',118,'top')+'</div></div>'
 + fig('close','قسم الدفع: الطريقة، المستلم، والباقي',70,'left bottom'), 'الحساب')

page(head(8,'ثامناً','آخر الليل','خلص الدوام؟ اعرف شو صار اليوم بالضبط.')
 + steps('روح على '+k('التقارير')+' واختار '+k('إغلاق اليوم')+'.',
         'بتشوف كل شي صار اليوم: قديش مبيعات، قديش منها نقدي، قديش دين، وكم فاتورة.',
         'فيك تطلع تقرير لكل كاشير لحالو — لتعرف كل واحد قديش لازم يسلّمك — وتطبعو على الطابعة الحرارية.')
 + fig('daily','تقرير إغلاق اليوم'), 'آخر الليل')

page(steps('وبدك تعرف ربحك الحقيقي؟ روح على '+k('الأرباح والخسائر')+' — بيطلعلك قديش ربحت بعد كلفة المواد والمصاريف.')
 + fig('income','الأرباح والخسائر')
 + '<div class="end"><h3>وهيك صار مطعمك كلو بميزان</h3><p>الطاولات والمطبخ والسفري والتوصيل والحسابات — بمكان واحد وبدون إنترنت.<br>عندك سؤال؟ أرقام التواصل واتساب موجودة على موقعنا:</p><div class="url">akyedgam3.github.io/mizan-updates</div></div>', 'آخر الليل')

open('index.html','w').write(f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ميزان — دليل قسم المطعم</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>')
print(len(pages),'pages')

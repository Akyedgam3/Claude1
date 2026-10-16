; تخصيص ملف تنصيب ميزان: شاشة ترحيب، فكرة أثناء التنصيب، وشاشة نهاية.
; الملف محفوظ UTF-8 مع BOM حتى يقرأ NSIS العربي صح.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "أهلاً بك في ميزان"
  !define MUI_WELCOMEPAGE_TEXT "برنامج المحاسبة وإدارة المحلات اللي بيشتغل بدون إنترنت.$\r$\n$\r$\n•  أكتر من 14 مجال عمل: ميني ماركت، مطاعم، خياطة، موبايلات وكمبيوتر، صيدليات...$\r$\n•  بيع وفواتير ومخزون وحسابات بمكان واحد$\r$\n•  ليرة ودولار، وطباعة حرارية و A4$\r$\n•  بياناتك مشفّرة وبتضل على جهازك$\r$\n$\r$\nإذا كان عندك نسخة قديمة، بيتحدّث البرنامج فوقها وبياناتك بتضل متل ما هي.$\r$\n$\r$\nاكبس «التالي» لنكمّل."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; هالماكرو بيجي قبل صفحة التنصيب مباشرة، فبنستغله لنحط عنوانها
!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "عم ننصّب ميزان..."
  !define MUI_PAGE_HEADER_SUBTEXT "فكرة: وقت إنشاء شركتك اختار «بيانات تجريبية» لتشوف البرنامج شغّال من أول دقيقة."
  !define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "خلص التنصيب"
  !define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "ميزان صار جاهز على جهازك."
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_FINISHPAGE_RUN_TEXT "شغّل ميزان الآن"
  !endif
  !define MUI_FINISHPAGE_TITLE "ميزان جاهز!"
  !define MUI_FINISHPAGE_TEXT "خلص التنصيب بنجاح.$\r$\n$\r$\nالخطوة الجاية:$\r$\n1.  أول ما يفتح البرنامج بيطلعلك «بصمة الجهاز».$\r$\n2.  ابعتها للبائع أو للوكيل تبعك.$\r$\n3.  الصق مفتاح التفعيل اللي بيوصلك، واختار نوع شغلك.$\r$\n$\r$\nحساباتك صارت بميزان."
  !define MUI_FINISHPAGE_LINK "موقع ميزان: شروحات وفيديوهات"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://akyedgam3.github.io/mizan-updates/"
  !insertmacro MUI_PAGE_FINISH
!macroend

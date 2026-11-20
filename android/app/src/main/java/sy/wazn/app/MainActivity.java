package sy.wazn.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // إضافة الطباعة تبع وزن (لازم تتسجل قبل ما يبلّش الـ Bridge)
        registerPlugin(WaznPrintPlugin.class);
        // التحديث من جوّا التطبيق: بالنسخة المباشرة بس (نسخة Google Play بتتحدّث من المتجر)
        try {
            @SuppressWarnings("unchecked")
            Class<? extends com.getcapacitor.Plugin> update = (Class<? extends com.getcapacitor.Plugin>) Class.forName("sy.wazn.app.WaznUpdatePlugin");
            registerPlugin(update);
        } catch (ClassNotFoundException ignored) {
            // نسخة Google Play
        }
        super.onCreate(savedInstanceState);
        // خط الجوال المكبّر كتير بيكبّر الواجهة وبيزحمها (الأسطر بتطلع برّا الشاشة): منسمح بتكبير لحد 115% بس
        try {
            android.webkit.WebSettings settings = getBridge().getWebView().getSettings();
            if (settings.getTextZoom() > 115) settings.setTextZoom(115);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // إذا غيّر حجم الخط من الإعدادات والتطبيق مفتوح
        try {
            float scale = getResources().getConfiguration().fontScale;
            android.webkit.WebSettings settings = getBridge().getWebView().getSettings();
            settings.setTextZoom(Math.min(115, Math.round(scale * 100)));
        } catch (Exception ignored) {
        }
    }
}

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
    }
}

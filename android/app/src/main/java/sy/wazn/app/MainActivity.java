package sy.wazn.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // إضافة الطباعة تبع وزن (لازم تتسجل قبل ما يبلّش الـ Bridge)
        registerPlugin(WaznPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package sy.wazn.app;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * طباعة الشاشة الحالية بنظام طباعة أندرويد (طابعة شبكة، بلوتوث، أو حفظ PDF).
 * الواجهة بتجهّز صفحة الطباعة (حجم الورق) قبل ما تنادي، وما منرجّع النتيجة إلا لما يتسكّر حوار الطباعة،
 * لأنو أندرويد بيرسم الصفحة وقت المعاينة.
 */
@CapacitorPlugin(name = "WaznPrint")
public class WaznPrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        final String name = call.getString("name", "Wazn");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                final PrintDocumentAdapter inner = webView.createPrintDocumentAdapter(name);
                PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                    @Override
                    public void onStart() {
                        inner.onStart();
                    }

                    @Override
                    public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
                        inner.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
                    }

                    @Override
                    public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal, WriteResultCallback callback) {
                        inner.onWrite(pages, destination, cancellationSignal, callback);
                    }

                    @Override
                    public void onFinish() {
                        inner.onFinish();
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    }
                };
                manager.print(name, adapter, new PrintAttributes.Builder().build());
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}

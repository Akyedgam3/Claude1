package sy.wazn.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/**
 * تحديث التطبيق من جوّاتو: بينزّل ملف APK الجديد، بيتأكد إنو كامل وإنو من وزن (نفس اسم الحزمة ونفس التوقيع
 * ونسخة أحدث) وإنو في مساحة كافية، وبعدين بيفتح شاشة التنصيب تبع أندرويد.
 * هيك ما بيوصل للزبون ملف ناقص أو غلط (أشهر أسباب رسالة «التطبيق غير مثبت»).
 * الأخطاء بترجع برموز: space, corrupt, package, old, signature, network.
 */
@CapacitorPlugin(name = "WaznUpdate")
public class WaznUpdatePlugin extends Plugin {

    private static final String FILE = "update/Wazn-update.apk";

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith("https://")) {
            call.reject("رابط غير صالح", "network");
            return;
        }
        new Thread(() -> {
            File out = new File(getContext().getCacheDir(), FILE);
            //noinspection ResultOfMethodCallIgnored
            out.getParentFile().mkdirs();
            String lastCode = "network";
            String lastMsg = "";
            // محاولتين: إذا انقطع النت بالنص أو وصل الملف ناقص منعيد مرة
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    fetch(url, out);
                    JSObject info = check(out);
                    call.resolve(info);
                    return;
                } catch (UpdateError e) {
                    lastCode = e.code;
                    lastMsg = e.getMessage();
                    if (!e.code.equals("corrupt") && !e.code.equals("network")) break;
                } catch (Exception e) {
                    lastCode = "network";
                    lastMsg = String.valueOf(e.getMessage());
                }
            }
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            call.reject(lastMsg, lastCode);
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = new File(getContext().getCacheDir(), FILE);
        if (!apk.isFile()) {
            call.reject("ملف التحديث مش موجود", "corrupt");
            return;
        }
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // أندرويد 8+: لازم المستخدم يسمح لوزن ينصّب تطبيقات مرة وحدة
            Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(perm);
            ret.put("needPermission", true);
            call.resolve(ret);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        ret.put("needPermission", false);
        call.resolve(ret);
    }

    private void fetch(String url, File out) throws Exception {
        HttpURLConnection c = null;
        // روابط GitHub بتحوّل لسيرفر تاني: منلحق التحويلات بإيدنا
        for (int hops = 0; hops < 6; hops++) {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null) throw new UpdateError("network", "التحويل ما فيه رابط");
                url = new URL(new URL(url), next).toString();
                if (!url.startsWith("https://")) throw new UpdateError("network", "رابط غير آمن");
                continue;
            }
            if (code != 200) throw new UpdateError("network", "السيرفر رجّع " + code);
            break;
        }
        long total = c.getContentLengthLong();
        long free = new StatFs(getContext().getCacheDir().getPath()).getAvailableBytes();
        // الملف نفسو + فكّه وقت التنصيب: تقريباً 3 أضعاف حجمه
        long need = (total > 0 ? total : 30L << 20) * 3;
        if (free < need) {
            c.disconnect();
            throw new UpdateError("space", String.valueOf((need - free + (1 << 20) - 1) >> 20));
        }
        long done = 0;
        long lastSent = 0;
        try (InputStream in = c.getInputStream(); FileOutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                done += n;
                if (done - lastSent > 256 * 1024) {
                    lastSent = done;
                    JSObject p = new JSObject();
                    p.put("done", done);
                    p.put("total", total);
                    notifyListeners("progress", p);
                }
            }
            os.getFD().sync();
        } finally {
            c.disconnect();
        }
        if (total > 0 && done != total) throw new UpdateError("corrupt", "الملف ما نزل كامل");
    }

    @SuppressWarnings("deprecation")
    private JSObject check(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo next = pm.getPackageArchiveInfo(apk.getPath(), flags);
        if (next == null) throw new UpdateError("corrupt", "الملف تالف");
        if (!getContext().getPackageName().equals(next.packageName)) throw new UpdateError("package", next.packageName);
        PackageInfo cur = pm.getPackageInfo(getContext().getPackageName(), flags);
        long nextCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? next.getLongVersionCode() : next.versionCode;
        long curCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? cur.getLongVersionCode() : cur.versionCode;
        if (nextCode <= curCode) throw new UpdateError("old", next.versionName);
        Signature[] a = signatures(cur);
        Signature[] b = signatures(next);
        // إذا أندرويد ما رجّع توقيع الملف منكمّل، وشاشة التنصيب نفسها بترفض أي توقيع مختلف
        if (a != null && b != null && b.length > 0 && !Arrays.equals(a, b)) throw new UpdateError("signature", "توقيع مختلف");
        JSObject ret = new JSObject();
        ret.put("version", next.versionName);
        ret.put("size", apk.length());
        return ret;
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signatures(PackageInfo p) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (p.signingInfo == null) return null;
            return p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
        }
        return p.signatures;
    }

    private static class UpdateError extends Exception {
        final String code;

        UpdateError(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}

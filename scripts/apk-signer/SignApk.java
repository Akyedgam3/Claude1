import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * توقيع APK وزن بمفتاح keys/wazn-android.jks (مكتبة apksig الرسمية من غوغل)، ثم التحقق منه.
 * الاستعمال: java -cp apksig.jar:. SignApk in.apk out.apk keystore.jks storePassword alias
 */
public class SignApk {
    public static void main(String[] a) throws Exception {
        if (a.length != 5) throw new IllegalArgumentException("in.apk out.apk keystore password alias");
        char[] pass = a[3].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[2])) {
            ks.load(in, pass);
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[4], pass);
        List<X509Certificate> chain = new ArrayList<>();
        for (java.security.cert.Certificate c : ks.getCertificateChain(a[4])) chain.add((X509Certificate) c);
        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("WAZN", key, chain).build();
        new ApkSigner.Builder(Collections.singletonList(signer))
            .setInputApk(new File(a[0]))
            .setOutputApk(new File(a[1]))
            .setMinSdkVersion(24)
            .setV1SigningEnabled(true)
            .setV2SigningEnabled(true)
            .build()
            .sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[1])).build().verify();
        if (!r.isVerified()) {
            for (Object e : r.getErrors()) System.err.println(e);
            throw new IllegalStateException("التوقيع ما زبط");
        }
        System.out.println("signed: v1=" + r.isVerifiedUsingV1Scheme() + " v2=" + r.isVerifiedUsingV2Scheme());
    }
}

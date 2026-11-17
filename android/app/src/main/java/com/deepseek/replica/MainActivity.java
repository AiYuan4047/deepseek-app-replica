package com.deepseek.replica;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + ASSET_HOST + "/index.html";
    private static final int MICROPHONE = 1;
    private static final int FILE_CHOOSER = 2;
    private WebView webView;
    private FrameLayout frame;
    private ApiKeyStore keys;
    private PermissionRequest microphoneRequest;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        keys = new ApiKeyStore(this);
        frame = new FrameLayout(this);
        webView = new WebView(this);
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsets.CONSUMED;
        });
        setContentView(frame);
        setBars((getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES);
        WebView.setWebContentsDebuggingEnabled(
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new AppPage());
        webView.setWebChromeClient(new DeviceFeatures());
        webView.addJavascriptInterface(new DeviceBridge(), "DeepSeekAndroid");
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> webView.evaluateJavascript(
                "window.dispatchEvent(new Event('android-back', {cancelable: true}))",
                result -> { if ("true".equals(result)) finish(); }));
        webView.loadUrl(HOME);
    }

    private void setBars(boolean dark) {
        int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : flags, flags);
        getWindow().setNavigationBarContrastEnforced(false);
        int color = Color.parseColor(dark ? "#191919" : "#FDFDFD");
        frame.setBackgroundColor(color);
        webView.setBackgroundColor(color);
    }

    private static boolean isBundled(Uri url) {
        return "https".equals(url.getScheme()) && ASSET_HOST.equals(url.getHost())
            && url.getPort() == -1;
    }

    private final class AppPage extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isBundled(request.getUrl())) return false;
            String scheme = request.getUrl().getScheme();
            if (request.isForMainFrame() && ("https".equals(scheme) || "http".equals(scheme))) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (ActivityNotFoundException ignored) {
                    // The device has no browser for external links.
                }
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!isBundled(url)) return null;
            String path = url.getPath();
            if ("/index.html".equals(path) || (path != null && path.startsWith("/static/")
                    && !path.contains("/../"))) {
                String name = path.substring(1);
                String extension = name.substring(name.lastIndexOf('.') + 1);
                String type = "js".equals(extension) ? "text/javascript"
                    : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                Map<String, String> headers = Map.of("Content-Security-Policy",
                    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    + "img-src 'self' https: data: blob:; font-src 'self' data:; "
                    + "media-src 'self' blob:; connect-src https://api.deepseek.com; "
                    + "frame-src 'none'; base-uri 'none'; form-action 'none';");
                try {
                    return new WebResourceResponse(type == null ? "application/octet-stream" : type,
                        "UTF-8", 200, "OK", headers, getAssets().open(name));
                } catch (IOException ignored) {
                    // Unknown paths must stay inside the bundled origin.
                }
            }
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Map.of(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private final class DeviceFeatures extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            String[] audio = {PermissionRequest.RESOURCE_AUDIO_CAPTURE};
            if (!isBundled(request.getOrigin()) || !Arrays.equals(request.getResources(), audio)) {
                request.deny();
            } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                request.grant(audio);
            } else if (microphoneRequest != null) {
                request.deny();
            } else {
                microphoneRequest = request;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE);
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (microphoneRequest == request) microphoneRequest = null;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                    params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            String[] mimeTypes = Arrays.stream(params.getAcceptTypes())
                .map(type -> type.startsWith(".")
                    ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1)) : type)
                .filter(type -> type != null && type.contains("/"))
                .distinct().toArray(String[]::new);
            if (mimeTypes.length > 0) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            try {
                startActivityForResult(intent, FILE_CHOOSER);
            } catch (ActivityNotFoundException ignored) {
                fileCallback = null;
                callback.onReceiveValue(null);
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == MICROPHONE && microphoneRequest != null) {
            PermissionRequest request = microphoneRequest;
            microphoneRequest = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                request.deny();
            }
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_CHOOSER && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        }
    }

    @Override
    protected void onDestroy() {
        if (microphoneRequest != null) microphoneRequest.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        frame.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }

    private final class DeviceBridge {
        @JavascriptInterface
        public String readApiKey() { return keys.read(); }

        @JavascriptInterface
        public boolean writeApiKey(String value) { return keys.write(value); }

        @JavascriptInterface
        public void setDarkBars(boolean dark) { runOnUiThread(() -> setBars(dark)); }
    }
}

package com.mzx.dailyfit;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 小橘爱运动 —— 把 daily-fit 这个离线网页装进 WebView。
 *
 * 资源不走 file://(file 源是 opaque origin,localStorage 等都会受限),
 * 而是把 https://appassets.androidplatform.net/ 映射到 APK 内的 assets/public/,
 * 得到一个正常的 https 安全源。
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window win = getWindow();
        win.setStatusBarColor(Color.parseColor("#F5F6F8"));
        win.setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 23) {
            win.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#F5F6F8"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u != null && HOST.equals(u.getHost())) {
                    return asset(u.getPath());
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                return u == null || !HOST.equals(u.getHost());
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
    }

    /** 把 URL 路径映射到 assets/public/** */
    private WebResourceResponse asset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        String rel = "public" + path;
        String mime = mimeOf(rel);
        boolean binary = mime == null;
        try {
            InputStream in = getAssets().open(rel);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(binary ? "application/octet-stream" : mime,
                    binary ? null : "utf-8", 200, "OK", h, in);
        } catch (IOException e) {
            Map<String, String> h = new HashMap<>();
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, null);
        }
    }

    private String mimeOf(String p) {
        String x = p.toLowerCase();
        if (x.endsWith(".html") || x.endsWith(".htm")) return "text/html";
        if (x.endsWith(".js")) return "application/javascript";
        if (x.endsWith(".css")) return "text/css";
        if (x.endsWith(".json")) return "application/json";
        if (x.endsWith(".webmanifest")) return "application/manifest+json";
        if (x.endsWith(".svg")) return "image/svg+xml";
        if (x.endsWith(".txt") || x.endsWith(".md")) return "text/plain";
        return null; // png/jpg/wasm 等按二进制原样返回
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

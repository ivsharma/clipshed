package com.clipshed.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : TauriActivity() {
  @Volatile
  private var safeAreaInsets = SafeAreaInsets(0f, 0f, 0f, 0f)
  private var contentWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 43123)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    contentWebView = webView

    webView.addJavascriptInterface(SafeAreaBridge(), "ClipshedInsets")

    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(webView, SAFE_AREA_SCRIPT, setOf("*"))
    }

    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, windowInsets ->
      val bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      applySafeAreaInsets(bars)
      // Return the insets unchanged so WebView keeps its own keyboard handling.
      windowInsets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun applySafeAreaInsets(bars: Insets) {
    val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    val next = SafeAreaInsets(
      top = bars.top / density,
      right = bars.right / density,
      bottom = bars.bottom / density,
      left = bars.left / density,
    )
    if (next == safeAreaInsets) return

    safeAreaInsets = next
    contentWebView?.post {
      contentWebView?.evaluateJavascript(
        "window.__clipshedApplySafeAreaInsets && window.__clipshedApplySafeAreaInsets();",
        null,
      )
    }
  }

  private inner class SafeAreaBridge {
    @JavascriptInterface
    fun get(): String {
      val current = safeAreaInsets
      return JSONObject()
        .put("top", current.top)
        .put("right", current.right)
        .put("bottom", current.bottom)
        .put("left", current.left)
        .toString()
    }

    @JavascriptInterface
    fun setDarkTheme(dark: Boolean) {
      runOnUiThread {
        WindowInsetsControllerCompat(window, window.decorView).apply {
          isAppearanceLightStatusBars = !dark
          isAppearanceLightNavigationBars = !dark
        }
      }
    }
  }

  private data class SafeAreaInsets(
    val top: Float,
    val right: Float,
    val bottom: Float,
    val left: Float,
  )

  companion object {
    private const val SAFE_AREA_SCRIPT = """
      (function () {
        function apply() {
          try {
            var raw = window.ClipshedInsets && window.ClipshedInsets.get();
            if (!raw) return;
            var insets = JSON.parse(raw);
            var style = document.documentElement.style;
            style.setProperty("--safe-area-inset-top", insets.top + "px");
            style.setProperty("--safe-area-inset-right", insets.right + "px");
            style.setProperty("--safe-area-inset-bottom", insets.bottom + "px");
            style.setProperty("--safe-area-inset-left", insets.left + "px");
          } catch (error) {
            // The page still works without safe-area padding.
          }
        }
        window.__clipshedApplySafeAreaInsets = apply;
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", apply, { once: true });
        } else {
          apply();
        }
      })();
    """
  }
}

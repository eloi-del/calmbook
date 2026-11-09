package fr.perso.calmbook

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Facebook mobile (m.facebook.com) dans une WebView, avec calmbook.js injecté.
 *
 * Volontairement, il n'y a AUCUN pont entre la page et l'appli
 * (pas d'addJavascriptInterface, pas de WebMessageListener) : l'appli ne lit rien de la page.
 * Elle ne regarde que les adresses que la page veut ouvrir, pour :
 *  - ouvrir les liens externes dans le navigateur, nettoyés de leur pistage ;
 *  - ouvrir l'appli Messenger quand la page demande calmbook://messenger.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var documentStartSupported = false

    private val calmScript by lazy {
        assets.open("calmbook.js").bufferedReader().use { it.readText() }
    }

    // Sélecteur de fichiers Android pour les <input type=file> (photo dans un post, un commentaire).
    private val filePicker =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris: Array<Uri>? = if (result.resultCode != RESULT_OK) {
                null
            } else {
                val clip = result.data?.clipData
                if (clip != null) {
                    Array(clip.itemCount) { clip.getItemAt(it).uri }
                } else {
                    WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                }
            }
            pendingFileCallback?.onReceiveValue(uris)
            pendingFileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // En debug uniquement : permet d'inspecter la page depuis chrome://inspect sur le PC.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView = WebView(this).apply { fitsSystemWindows = true }
        setContentView(webView)
        setUpWebView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(if (intent?.action == ACTION_SETTINGS) SETTINGS_URL else START_URL)
        }
    }

    // L'activité est en singleTask : le raccourci "Mode calme" arrive ici si l'appli tourne déjà.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_SETTINGS) webView.loadUrl(SETTINGS_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            setGeolocationEnabled(false)
            setSupportMultipleWindows(false)
            // Facebook traite différemment les WebView : on se présente comme Chrome mobile.
            userAgentString = userAgentString
                .replace("; wv", "")
                .replace(Regex("Version/\\S+ "), "")
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            // Cookies des autres sites refusés dans la page Facebook.
            setAcceptThirdPartyCookies(view, false)
        }

        documentStartSupported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (documentStartSupported) {
            // Exécuté avant les scripts de Facebook, uniquement sur m.facebook.com.
            WebViewCompat.addDocumentStartJavaScript(view, calmScript, setOf(FACEBOOK_ORIGIN))
        }

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false // iframes (ex. captcha) : laisser faire
                val uri = LinkCleaner.unwrap(request.url)
                if (uri.scheme == "calmbook" && uri.host == "messenger") {
                    openMessenger()
                    return true
                }
                if (uri.scheme == "https" && isInAppHost(uri.host)) {
                    if (uri == request.url) return false
                    view.loadUrl(uri.toString()) // lien l.facebook.com vers une page Facebook
                    return true
                }
                // Liens externes -> navigateur, sans pistage. Schémas fb://, intent:// -> ignorés,
                // pour ne jamais basculer vers l'appli officielle.
                if (uri.scheme == "http" || uri.scheme == "https") openExternally(LinkCleaner.clean(uri))
                return true
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                // Repli pour les très vieilles WebView sans injection en début de page.
                if (!documentStartSupported && Uri.parse(url).host == FACEBOOK_HOST) {
                    view.evaluateJavascript(calmScript, null)
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = callback
                return try {
                    filePicker.launch(params.createIntent())
                    true
                } catch (e: ActivityNotFoundException) {
                    pendingFileCallback = null
                    false
                }
            }

            // Ni caméra, ni micro, ni position : l'appli n'a pas ces permissions, la page non plus.
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback,
            ) = callback.invoke(origin, false, false)
        }
    }

    private fun openMessenger() {
        val launch = packageManager.getLaunchIntentForPackage(MESSENGER_PACKAGE)
        if (launch != null) {
            startActivity(launch)
        } else {
            openExternally(Uri.parse("https://play.google.com/store/apps/details?id=$MESSENGER_PACKAGE"))
        }
    }

    private fun isInAppHost(host: String?): Boolean =
        host != null && IN_APP_DOMAINS.any { host == it || host.endsWith(".$it") }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            // Aucun navigateur : on ne fait rien.
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush() // garder la session après fermeture
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val FACEBOOK_HOST = "m.facebook.com"
        const val FACEBOOK_ORIGIN = "https://m.facebook.com"
        const val START_URL = "https://m.facebook.com/"
        const val SETTINGS_URL = "https://m.facebook.com/#calmbook"
        const val ACTION_SETTINGS = "fr.perso.calmbook.SETTINGS"
        const val MESSENGER_PACKAGE = "com.facebook.orca"

        // Connexion, double authentification et vérifications peuvent passer par Meta.
        val IN_APP_DOMAINS = listOf("facebook.com", "meta.com")
    }
}

package fr.perso.calmbook

import android.net.Uri

/**
 * Nettoyage des liens qui sortent de Facebook.
 *
 * 1. Facebook fait passer les liens externes par l.facebook.com/l.php?u=<vrai lien>&h=…
 *    (lm.facebook.com sur mobile), pour enregistrer le clic : on reprend le vrai lien.
 * 2. On enlève les paramètres de pistage connus (fbclid, utm_*, gclid…) ; le reste du lien
 *    est gardé tel quel, pour qu'il marche toujours.
 */
object LinkCleaner {

    private val REDIRECT_HOSTS = setOf("l.facebook.com", "lm.facebook.com", "l.messenger.com", "l.instagram.com")

    private val TRACKING_PARAMS = setOf(
        "fbclid", "igshid", "igsh", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid",
        "twclid", "ttclid", "li_fat_id", "yclid", "mc_cid", "mc_eid", "_hsenc", "_hsmi",
        "mkt_tok", "oly_anon_id", "oly_enc_id", "vero_id", "rb_clickid", "s_cid", "__tn__", "__cft__",
    )

    /** Si c'est un lien de redirection de Facebook, renvoie le vrai lien ; sinon le lien tel quel. */
    fun unwrap(uri: Uri): Uri {
        if (uri.host !in REDIRECT_HOSTS) return uri
        val target = uri.getQueryParameter("u") ?: return uri
        val parsed = Uri.parse(target)
        return if (parsed.scheme == "http" || parsed.scheme == "https") parsed else uri
    }

    fun clean(uri: Uri): Uri {
        val query = uri.encodedQuery ?: return uri
        val kept = query.split('&').filter { part ->
            val name = Uri.decode(part.substringBefore('=')).lowercase()
            part.isNotEmpty() && name !in TRACKING_PARAMS && !name.startsWith("utm_")
        }
        return uri.buildUpon().encodedQuery(kept.joinToString("&").ifEmpty { null }).build()
    }
}

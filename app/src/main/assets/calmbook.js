// calmbook.js : injecté par l'appli au tout début de chaque page https://m.facebook.com
//
// Ce que ce script lit : l'adresse de la page, l'en-tête des posts du fil (nom, étiquette
// « Sponsorisé », « Contenu IA », bouton « Suivre »…), et ses propres réglages
// (stockage du site, clé "calmbook.settings").
// Ce qu'il ne fait jamais : lire un champ de formulaire ou un message, envoyer une requête,
// parler à l'appli Android. Seule exception, voulue : un tap sur Messages ouvre l'adresse
// calmbook://messenger, que l'appli traduit en « ouvrir l'appli Messenger ».
(function () {
  'use strict';
  if (window.__calmbook) return;
  window.__calmbook = true;

  var root = document.documentElement;
  var PANEL_HASH = '#calmbook';
  var MESSENGER_URL = 'calmbook://messenger';
  var nativePush = history.pushState.bind(history);
  var nativeReplace = history.replaceState.bind(history);

  // ---------------------------------------------------------------------------
  // 1. Réglages (tous activés par défaut = mode calme)
  // ---------------------------------------------------------------------------
  var SETTINGS_KEY = 'calmbook.settings';
  var OPTIONS = [
    ['ads', 'Publicités', 'Masquer les posts « Sponsorisé »'],
    ['ai', 'Contenu IA', 'Masquer les posts marqués « Contenu IA »'],
    ['reels', 'Reels', 'Masquer les Reels du fil et l\'onglet Reels'],
    ['videos', 'Vidéos', 'Masquer les posts avec une vidéo'],
    ['suggested', 'Suggestions', 'Masquer les suggestions, et les posts de pages et groupes que tu ne suis pas'],
    ['reelSwipe', 'Un seul Reel à la fois', 'Un Reel ouvert reste seul : pas de swipe vers le suivant'],
    ['messenger', 'Messages', 'L\'onglet Messages ouvre l\'appli Messenger']
  ];

  // Deux copies des réglages, comme dans l'appli Instagram :
  //  - localStorage : lu tout de suite au chargement (pas de clignotement), mais écrit
  //    sur le disque avec retard par la WebView ;
  //  - IndexedDB : écrit tout de suite ; relu au démarrage, il fait foi.
  var DB_NAME = 'calmbook';
  var DB_STORE = 'kv';
  var settings = loadSettings();

  function normalize(saved) {
    var result = {};
    saved = saved && typeof saved === 'object' ? saved : {};
    OPTIONS.forEach(function (o) { result[o[0]] = typeof saved[o[0]] === 'boolean' ? saved[o[0]] : true; });
    return result;
  }

  function loadSettings() {
    try { return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { return normalize({}); }
  }

  function withStore(mode, use) {
    try {
      var open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = function () { open.result.createObjectStore(DB_STORE); };
      open.onsuccess = function () {
        var db = open.result;
        try {
          var tx = db.transaction(DB_STORE, mode);
          tx.oncomplete = tx.onerror = tx.onabort = function () { db.close(); };
          use(tx.objectStore(DB_STORE));
        } catch (e) { db.close(); }
      };
    } catch (e) { /* IndexedDB indisponible : localStorage seul */ }
  }

  function saveSettings() {
    var json = JSON.stringify(settings);
    try { localStorage.setItem(SETTINGS_KEY, json); } catch (e) { /* stockage indisponible */ }
    withStore('readwrite', function (store) { store.put(json, SETTINGS_KEY); });
  }

  function syncSettingsFromDisk() {
    withStore('readonly', function (store) {
      var get = store.get(SETTINGS_KEY);
      get.onsuccess = function () {
        if (typeof get.result !== 'string') {
          try { if (localStorage.getItem(SETTINGS_KEY)) saveSettings(); } catch (e) { /* idem */ }
          return;
        }
        var stored;
        try { stored = normalize(JSON.parse(get.result)); } catch (e) { return; }
        if (JSON.stringify(stored) === JSON.stringify(settings)) return;
        settings = stored;
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* idem */ }
        applySettings();
        refreshPanel();
        lastUrl = null;
        update();
      };
    });
  }

  // Les règles CSS lisent cet attribut : un changement s'applique immédiatement.
  function applySettings() {
    var off = OPTIONS.map(function (o) { return o[0]; }).filter(function (k) { return !settings[k]; });
    root.setAttribute('data-calm-off', off.join(' '));
  }

  // ---------------------------------------------------------------------------
  // 2. Redirections
  // ---------------------------------------------------------------------------
  function redirectTarget(path) {
    // Lecteur de Reels sans fin -> fil. Un Reel seul (/reel/ID) reste ouvrable.
    if (settings.reels && /^\/reels\/?$/.test(path)) return '/';
    return null;
  }

  function isMessagesPath(path) { return /^\/messages(\/|$)/.test(path); }

  function pageOf(path) {
    if (path === '/' || path === '/home.php') return 'home';
    return 'other';
  }

  // ---------------------------------------------------------------------------
  // 3. Style. Actif avant le premier rendu, donc sans clignotement.
  // ---------------------------------------------------------------------------
  // Un post masqué garde sa place dans la page mais à 0px de haut (vérifié le 2026-11-09 :
  // le fil continue de se remplir). Il reste dans la page, contrairement à display:none.
  var COLLAPSE = 'height:0!important;min-height:0!important;overflow:hidden!important;' +
                 'opacity:0!important;margin:0!important;padding:0!important;';
  var HOME = 'html[data-calm-page="home"]';
  var HIDDEN = [['ads', 'data-calm-ad'], ['ai', 'data-calm-ai'], ['reels', 'data-calm-reels'],
                ['videos', 'data-calm-video'], ['suggested', 'data-calm-suggested']];

  function hiddenRule(suffix) {
    return HIDDEN.map(function (h) {
      return HOME + ':not([data-calm-off~="' + h[0] + '"]) [' + h[1] + ']' + suffix;
    }).join(',\n');
  }

  var style = document.createElement('style');
  style.id = 'calmbook';
  style.textContent = [
    // Avec des posts masqués, l'ancrage de scroll du navigateur fait reculer la page
    // (constaté sur Instagram ; même piège signalé sur Facebook mobile par FB-Mobile-Clean-my-feeds).
    HOME + ' * { overflow-anchor:none!important; }',
    hiddenRule('') + ' {' + COLLAPSE + '}',
    // Dans le lecteur de vidéos/Reels : pubs et contenu IA retirés de la liste (vu le 2026-11-09 :
    // un post « Sponsorisée » entre deux vidéos). Les autres filtres ne s'y appliquent pas.
    'html:not([data-calm-off~="ads"]) .vscroller-snap [data-calm-ad],\n' +
    'html:not([data-calm-off~="ai"]) .vscroller-snap [data-calm-ai] {' + COLLAPSE + '}',
    // Entre deux posts, Facebook met un séparateur de 1px (+2px de marge) : sans post autour,
    // ces séparateurs s'empilaient en bandes grises (vu sur le téléphone le 2026-11-09).
    hiddenRule(' + div:not([data-tracking-duration-id])[style*="height:1px"]') + ' {' + COLLAPSE + '}',
    // Onglet Reels : on cache son contenu mais pas l'onglet, dont le fond blanc (::before)
    // couvre le gris de la barre. Masquer l'onglet entier laissait un carré gris.
    // Enfants de l'onglet (vérifié le 2026-11-09) : 1 = icône, 2 = trait gris sous la barre
    // (gardé), 3 et suivants = pastilles rouges « 9 », « 15+ ».
    'html:not([data-calm-off~="reels"]) [role="tab"][data-calm-tab="reels"] { pointer-events:none!important; }',
    'html:not([data-calm-off~="reels"]) [role="tab"][data-calm-tab="reels"] > :first-child,',
    'html:not([data-calm-off~="reels"]) [role="tab"][data-calm-tab="reels"] > :nth-child(n+3) { visibility:hidden!important; }',
    // Un seul Reel : le lecteur est une liste verticale qui s'aimante d'un Reel au suivant.
    // Le doigt ne peut plus la faire défiler (voir aussi lockReel). Ce lecteur s'ouvre aussi
    // à d'autres adresses que /reel/ID (ex. /<page>/videos/<numéro>/, vu le 2026-11-09) :
    // on le reconnaît à sa liste aimantée qui contient une vidéo, pas à l'adresse.
    'html:not([data-calm-off~="reelSwipe"]) .vscroller.vscroller-snap:has(video) { overflow-y:hidden!important; }',
    // Barre « Ouvrir l'application » collée en bas de l'écran
    '[data-calm-openapp] { display:none!important; }',
    // Barre de progression ajoutée sous les vidéos (voir section 6 bis)
    '.calmbook-seek { position:absolute; left:0; right:56px; bottom:0; height:36px; z-index:10; display:flex;' +
      ' align-items:center; padding:0 12px; box-sizing:border-box; }',
    '.calmbook-seek input { flex:1; width:100%; margin:0; accent-color:#fff; height:24px; }',
    // Quand Facebook affiche sa propre barre (classe « hidden » retirée), la nôtre s'efface :
    // deux barres l'une sur l'autre, c'était confus (retour du 2026-11-09).
    '[data-mcomponent="MVideo"]:has(.inline-video-progress-bar-container:not(.hidden)) > .calmbook-seek { display:none!important; }'
  ].join('\n');

  function ensureStyle() {
    if (!style.isConnected) root.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // 4. Le fil : chaque post est un bloc [data-tracking-duration-id] (vérifié le 2026-11-09).
  //    Facebook vide les posts loin de l'écran et les remplit en approchant :
  //    on classe un post dès qu'il a du contenu, et la marque reste sur le bloc.
  // ---------------------------------------------------------------------------
  // Étiquettes, comparées à un texte entier de l'en-tête (pas à la légende du post).
  var AD_LABEL = /^(Sponsorisée?|Sponsored|Publicité|Ad)$/;
  var AI_LABEL = /^(AI content|AI info|Made with AI|Contenu (d['’])?IA|Infos? (sur l['’])?IA|Notice sur l['’]IA|Créé avec (l['’])?IA|Généré (par|avec) (l['’])?IA)$/i;
  var FOLLOW_LABEL = /^(Follow|Suivre|Join|Rejoindre)$/;
  var SUGGESTION_TITLE = /^(Suggested for you|Suggestions pour vous|People you may know|Vous connaissez peut-être|Suggested groups|Groupes suggérés)$/i;
  var REELS_TITLE = /^(Reels|Reels et vidéos courtes|Reels and short videos)$/i;
  // Icônes de la police de Facebook (zone privée d'Unicode) et marques de direction.
  var JUNK = /[-‎‏‪-‮]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/g;
  var HEADER_SIZE = 8;

  function headerTexts(unit) {
    var texts = [];
    var spans = unit.getElementsByTagName('span');
    for (var i = 0; i < spans.length && texts.length < HEADER_SIZE; i++) {
      if (spans[i].childElementCount !== 0) continue;
      var t = spans[i].textContent.replace(JUNK, '').replace(/\s+/g, ' ').trim();
      if (t && t !== '•' && t !== '·') texts.push(t);
    }
    return texts;
  }

  function anyMatch(texts, pattern, limit) {
    for (var i = 0; i < texts.length && i < limit; i++) if (pattern.test(texts[i])) return true;
    return false;
  }

  function classify(unit) {
    var texts = headerTexts(unit);
    if (!texts.length) return; // bloc vidé : on le classera quand il sera rempli
    if (anyMatch(texts, AD_LABEL, 4)) unit.setAttribute('data-calm-ad', '');
    if (anyMatch(texts, AI_LABEL, HEADER_SIZE)) unit.setAttribute('data-calm-ai', '');
    if (REELS_TITLE.test(texts[0]) || unit.querySelector('[aria-label*="reel" i]')) unit.setAttribute('data-calm-reels', '');
    if (unit.querySelector('[data-mcomponent="MVideo"], video')) unit.setAttribute('data-calm-video', '');
    // « Suivre » peut venir après un lieu : « Page ¦ à ¦ Lieu ¦ Page ¦ Suivre » (vérifié le 2026-11-09).
    if (SUGGESTION_TITLE.test(texts[0]) || anyMatch(texts, FOLLOW_LABEL, 6)) unit.setAttribute('data-calm-suggested', '');
    unit.setAttribute('data-calm-seen', '');
  }

  function scanFeed() {
    // Le fil, et le lecteur de vidéos/Reels (liste aimantée), où Facebook glisse aussi des pubs.
    if (root.getAttribute('data-calm-page') !== 'home' && !document.querySelector('.vscroller-snap')) return;
    var units = document.querySelectorAll('[data-tracking-duration-id]:not([data-calm-seen])');
    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      // Un Reel dans le bloc « Reels » a aussi cet attribut : seul le bloc entier compte.
      if (unit.parentElement && unit.parentElement.closest('[data-tracking-duration-id]')) continue;
      classify(unit);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Barre du haut et bannière « Ouvrir l'application »
  //    Les onglets ont une étiquette en anglais quelle que soit la langue :
  //    « feed, … », « messages, … », « reels, 100 new, 4 of 6 ».
  // ---------------------------------------------------------------------------
  var OPEN_APP = /^(Open app|Ouvrir l['’]application|Use Facebook app|Utiliser l['’]application Facebook)$/i;

  function tabName(tab) {
    var label = tab.getAttribute('aria-label') || '';
    return label.split(',')[0].trim().toLowerCase();
  }

  // Chercher la barre parcourt tous les blocs de la page : 35 ms à chaque passage, mesuré sur
  // le téléphone le 2026-11-09. Fait à chaque changement de page, ça rendait le scroll saccadé.
  // On ne cherche donc qu'une fois par seconde au plus, et plus du tout tant qu'elle est trouvée.
  var OPEN_APP_INTERVAL = 1000;
  var lastOpenAppSearch = 0;
  var openAppBar = null;

  function markChrome() {
    var tabs = document.querySelectorAll('[role="tab"]:not([data-calm-tab])');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('data-calm-tab', tabName(tabs[i]));

    if (openAppBar && openAppBar.isConnected) return;
    var now = Date.now();
    if (now - lastOpenAppSearch < OPEN_APP_INTERVAL) return;
    lastOpenAppSearch = now;
    var bars = document.querySelectorAll('[data-mcomponent="MContainer"]:not([data-calm-openapp])');
    for (var j = 0; j < bars.length; j++) {
      var bar = bars[j];
      if (bar.childElementCount > 6) continue;
      var raw = bar.textContent || ''; // textContent : sans calcul de mise en page, contrairement à innerText
      if (raw.length > 60) continue;
      if (!OPEN_APP.test(raw.replace(JUNK, '').trim())) continue;
      if (getComputedStyle(bar).position !== 'fixed') continue;
      bar.setAttribute('data-calm-openapp', '');
      openAppBar = bar;
    }
  }

  // ---------------------------------------------------------------------------
  // 6 ter. Un seul Reel à la fois
  //    Le lecteur de Reels et de vidéos (/reel/ID, /<page>/videos/<numéro>/…) est une liste verticale. Le CSS empêche le doigt de la
  //    faire défiler. En plus, si elle bouge quand même, on la ramène à la position où elle
  //    était quand la vidéo est apparue (Facebook se place lui-même sur le Reel ouvert,
  //    pas forcément le premier). On retient une position et pas un élément : Facebook
  //    remplace les blocs de la liste (vérifié le 2026-11-09).
  // ---------------------------------------------------------------------------
  var lockedScroller = null;
  var lockedTop = 0;
  var lockedUrl = '';

  function lockReel() {
    if (!settings.reelSwipe) return;
    var scroller = document.querySelector('.vscroller.vscroller-snap');
    var video = scroller && scroller.querySelector('video');
    if (!video) return;
    if (scroller === lockedScroller && lockedUrl === location.pathname) return;
    // On attend que Facebook se soit placé sur le Reel qui a la vidéo.
    var slot = video.closest('.vertically-snappable') || video;
    if (Math.abs(slot.getBoundingClientRect().top - scroller.getBoundingClientRect().top) > 5) return;
    var first = scroller !== lockedScroller;
    lockedScroller = scroller;
    lockedTop = scroller.scrollTop;
    lockedUrl = location.pathname;
    if (!first) return;
    scroller.addEventListener('scroll', function () {
      if (!settings.reelSwipe || lockedScroller !== scroller) return;
      if (Math.abs(scroller.scrollTop - lockedTop) > 2) scroller.scrollTop = lockedTop;
    }, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // 6 bis. Barre de progression sous les vidéos
  //    Le lecteur de Facebook mobile n'a qu'une barre d'affichage, sans possibilité d'avancer
  //    ou reculer. On ajoute un curseur en bas de chaque vidéo en lecture, à gauche du bouton son.
  // ---------------------------------------------------------------------------
  function ensureSeekBars() {
    var videos = document.getElementsByTagName('video');
    for (var i = 0; i < videos.length; i++) addSeekBar(videos[i]);
  }

  function addSeekBar(video) {
    var box = video.closest('[data-mcomponent="MVideo"]') || video.parentElement;
    if (!box) return;
    var bar = box.querySelector(':scope > .calmbook-seek');
    if (bar && bar.calmVideo === video) return;
    if (bar) bar.remove(); // Facebook a remplacé la vidéo : on rebranche le curseur

    bar = document.createElement('div');
    bar.className = 'calmbook-seek';
    bar.calmVideo = video;
    var input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1000';
    input.value = '0';
    input.setAttribute('aria-label', 'Position dans la vidéo');
    bar.appendChild(input);

    var dragging = false;
    // Les gestes sur le curseur ne doivent pas atteindre Facebook (pause, plein écran, swipe).
    ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend'].forEach(function (type) {
      bar.addEventListener(type, function (e) {
        e.stopPropagation();
        if (type === 'pointerdown' || type === 'touchstart') dragging = true;
        if (type === 'pointerup' || type === 'touchend') dragging = false;
      }, { passive: true });
    });
    input.addEventListener('input', function () {
      if (isFinite(video.duration) && video.duration > 0) video.currentTime = input.value / 1000 * video.duration;
    });
    video.addEventListener('timeupdate', function () {
      if (dragging || bar.calmVideo !== video) return;
      if (isFinite(video.duration) && video.duration > 0) input.value = String(Math.round(video.currentTime / video.duration * 1000));
    });

    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    box.appendChild(bar);
  }

  // ---------------------------------------------------------------------------
  // 6. Messages -> appli Messenger
  // ---------------------------------------------------------------------------
  function openMessenger() { location.href = MESSENGER_URL; }

  window.addEventListener('click', function (e) {
    if (!settings.messenger || !e.target.closest) return;
    var tab = e.target.closest('[role="tab"]');
    var item = e.target.closest('[role="button"][aria-label="Messages"]');
    if (!(tab && tabName(tab) === 'messages') && !item) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openMessenger();
  }, true);

  // ---------------------------------------------------------------------------
  // 7. Bouton "Mode calme" sur la page Menu (/bookmarks/, le bouton ☰ en haut à droite)
  //    Les listes de Facebook sont redessinées en continu (vérifié le 2026-11-09 dans les
  //    paramètres : une ligne ajoutée dedans disparaît et décale les autres). Le bouton est
  //    donc posé par-dessus la page, en bas à droite, hors de la liste.
  // ---------------------------------------------------------------------------
  var BUTTON_ID = 'calmbook-button';
  var ICON = '<path d="M4 7h16M4 12h10M4 17h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  var calmButton = null;

  function ensureCalmButton() {
    var onMenu = /^\/bookmarks\/?$/.test(location.pathname) && !(panelHost && panelHost.isConnected);
    if (!onMenu) {
      if (calmButton) calmButton.remove();
      return;
    }
    if (!calmButton) {
      calmButton = document.createElement('button');
      calmButton.id = BUTTON_ID;
      calmButton.setAttribute('aria-label', 'Mode calme');
      calmButton.style.cssText = 'all:initial;position:fixed;z-index:2147483646;bottom:20px;right:16px;height:44px;' +
        'padding:0 18px;border-radius:22px;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;gap:6px;background:#4A6A8A;color:#fff;' +
        'font:600 15px system-ui,Roboto,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;';
      calmButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24">' + ICON + '</svg>Mode calme';
      calmButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPanel();
      }, true);
    }
    if (!calmButton.isConnected) root.appendChild(calmButton);
  }

  // ---------------------------------------------------------------------------
  // 8. Page des interrupteurs (dans un shadow DOM : le style de Facebook ne la touche pas)
  // ---------------------------------------------------------------------------
  var panelHost = null;
  var panelSwitches = [];

  function refreshPanel() {
    panelSwitches.forEach(function (button) {
      button.setAttribute('aria-checked', String(settings[button.getAttribute('data-key')]));
    });
  }

  function isDark() {
    var el = document.body;
    while (el) {
      var bg = getComputedStyle(el).backgroundColor;
      var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) return (+m[1] + +m[2] + +m[3]) / 3 < 128;
      el = el === document.body ? root : null;
    }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function openPanel() {
    if (panelHost && panelHost.isConnected) return;
    nativePush(history.state, '', location.pathname + location.search + PANEL_HASH);

    var c = isDark()
      ? { bg: '#18191a', fg: '#e4e6eb', sub: '#b0b3b8', line: '#3a3b3c', off: '#3a3b3c' }
      : { bg: '#ffffff', fg: '#080809', sub: '#65676b', line: '#dadde1', off: '#ccd0d5' };

    panelHost = document.createElement('div');
    var shadow = panelHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.page{position:fixed;inset:0;z-index:2147483647;overflow-y:auto;background:' + c.bg + ';color:' + c.fg + ';' +
        'font:16px/1.35 system-ui,Roboto,sans-serif}' +
      '.head{position:sticky;top:0;height:48px;display:flex;align-items:center;justify-content:center;' +
        'font-weight:600;font-size:17px;background:' + c.bg + ';border-bottom:1px solid ' + c.line + '}' +
      '.back{position:absolute;left:4px;top:2px;width:44px;height:44px;border:0;padding:0;background:none;' +
        'color:inherit;display:flex;align-items:center;justify-content:center}' +
      '.back svg{width:24px;height:24px}' +
      '.sec{padding:16px 16px 4px;color:' + c.sub + ';font-size:14px;font-weight:600}' +
      '.row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;border:0;background:none;' +
        'color:inherit;font:inherit;text-align:left;-webkit-tap-highlight-color:transparent}' +
      '.t{flex:1;min-width:0}.t b{display:block;font-weight:400}' +
      '.t span{display:block;color:' + c.sub + ';font-size:13px}' +
      '.sw{width:44px;height:26px;border-radius:13px;background:' + c.off + ';position:relative;flex:none;' +
        'transition:background .15s}' +
      '.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;' +
        'background:#fff;transition:transform .15s}' +
      '.row[aria-checked="true"] .sw{background:#4A6A8A}' +
      '.row[aria-checked="true"] .sw::after{transform:translateX(18px)}' +
      '.note{padding:16px;color:' + c.sub + ';font-size:12px}' +
      '</style>' +
      '<div class="page" role="dialog" aria-label="Mode calme">' +
        '<div class="head"><button class="back" aria-label="Retour">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>' +
        '</button>Mode calme</div>' +
        '<div class="sec">Dans le fil et la barre du haut</div>' +
        OPTIONS.map(function (o) {
          return '<button class="row" role="switch" data-key="' + o[0] + '" aria-checked="' + settings[o[0]] + '">' +
                 '<span class="t"><b>' + o[1] + '</b><span>' + o[2] + '</span></span><span class="sw"></span></button>';
        }).join('') +
        '<div class="note">Les liens ouverts dans le navigateur sont toujours nettoyés de leur pistage. ' +
          'Réglages enregistrés sur cet appareil. S\'ils sont effacés, tout revient en mode calme.</div>' +
      '</div>';

    shadow.querySelector('.back').addEventListener('click', function () {
      if (location.hash === PANEL_HASH) history.back(); else closePanel();
    });
    panelSwitches = Array.prototype.slice.call(shadow.querySelectorAll('.row'));
    panelSwitches.forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-key');
        settings[key] = !settings[key];
        button.setAttribute('aria-checked', String(settings[key]));
        saveSettings();
        applySettings();
      });
    });

    root.appendChild(panelHost);
    ensureCalmButton();
  }

  function closePanel() {
    if (panelHost) panelHost.remove();
    panelHost = null;
    panelSwitches = [];
    ensureCalmButton();
  }

  // ---------------------------------------------------------------------------
  // 9. Suivre les changements de page (Facebook mobile ne recharge pas la page)
  // ---------------------------------------------------------------------------
  var queued = false;

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      scanFeed();
      markChrome();
      lockReel();
      ensureSeekBars();
      ensureCalmButton();
    });
  }

  var lastUrl = null;

  function update() {
    ensureStyle();
    var url = location.pathname + location.search;
    if (url === lastUrl) return;
    lastUrl = url;
    if (settings.messenger && isMessagesPath(location.pathname)) {
      // Arrivé sur Messages par un autre chemin : Messenger, et retour au fil.
      openMessenger();
      location.replace('/');
      return;
    }
    var target = redirectTarget(location.pathname);
    if (target) {
      location.replace(target + (location.hash === PANEL_HASH ? PANEL_HASH : ''));
      return;
    }
    root.setAttribute('data-calm-page', pageOf(location.pathname));
    schedule();
  }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      update();
      return result;
    };
  });
  window.addEventListener('popstate', function () {
    if (location.hash !== PANEL_HASH) closePanel();
    update();
  });
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  setInterval(update, 500); // filet de sécurité

  applySettings();
  update();
  syncSettingsFromDisk();

  // Ouverture directe des réglages (raccourci Android "Mode calme")
  if (location.hash === PANEL_HASH) {
    nativeReplace(history.state, '', location.pathname + location.search);
    if (document.body) openPanel(); else document.addEventListener('DOMContentLoaded', openPanel);
  }
})();

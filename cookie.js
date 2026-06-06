;(() => {
  // =============================
  // CONFIGURAÇÕES
  // =============================
  const PRIVACY_URL = "https://hepso.com/politica-de-privacidade";
  // Ajuste para o SEU domínio raiz (inclua o ponto inicial):
  // Use ".pinacullo.com" OU ".pinaculo.com"
  const COOKIE_DOMAIN = ".hepso.com.br";

  // IDs opcionais de integrações (preencha se usar)
  const GA4_MEASUREMENT_ID = ""; // ex.: "G-ABCDE12345"
  const FB_PIXEL_ID = ""; // ex.: "123456789012345"

  // Nome e duração do cookie de preferências
  const CONSENT_COOKIE_NAME = "cookie_prefs";
  const CONSENT_COOKIE_DAYS = 180;

  // Chaves de categorias (você pode expandir se quiser)
  const CATEGORIES = {
    essential: true, // sempre ativo
    analytics: false,
    marketing: false,
  };

  // =============================
  // HELPERS DE COOKIE
  // =============================
  function setCookie(name, value, days, opts = {}) {
    let expires = "";
    if (typeof days === "number") {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    const domain = opts.domain ? `; domain=${opts.domain}` : "";
    const path = `; path=${opts.path || "/"}`;
    const samesite = `; samesite=${opts.samesite || "Lax"}`;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      expires +
      domain +
      path +
      samesite +
      secure;
  }

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(^| )" + name.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1") + "=([^;]+)")
    );
    return match ? decodeURIComponent(match[2]) : null;
  }

  function eraseCookie(name, opts = {}) {
    setCookie(name, "", -1, opts);
  }

  // =============================
  // ESTADO E APLICAÇÃO DE CONSENTIMENTO
  // =============================
  function getStoredPrefs() {
    try {
      const raw = getCookie(CONSENT_COOKIE_NAME);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function savePrefs(prefs) {
    setCookie(
      CONSENT_COOKIE_NAME,
      JSON.stringify({ ...prefs, ts: Date.now() }),
      CONSENT_COOKIE_DAYS,
      { domain: COOKIE_DOMAIN }
    );
  }

  function applyPrefs(prefs) {
    // ESSENCIAIS: sempre ativos (nada a fazer no front)
    // ANALYTICS
    if (prefs.analytics) {
      enableGA();
      updateConsentMode({ analytics: "granted" });
    } else {
      disableGA();
      removeAnalyticsCookies();
      updateConsentMode({ analytics: "denied" });
    }
    // MARKETING
    if (prefs.marketing) {
      enableFBPixel();
      updateConsentMode({ ad_storage: "granted" });
    } else {
      disableFBPixel();
      removeMarketingCookies();
      updateConsentMode({ ad_storage: "denied" });
    }

    // Evento para dataLayer (opcional)
    if (typeof window.dataLayer !== "undefined") {
      window.dataLayer.push({ event: "cookie_consent_update", prefs });
    }
  }

  // =============================
  // GOOGLE ANALYTICS (GA4) – OPCIONAL
  // =============================
  let gaLoaded = false;

  function enableGA() {
    if (!GA4_MEASUREMENT_ID || gaLoaded) return;
    // gtag base
    const s1 = document.createElement("script");
    s1.async = true;
    s1.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_MEASUREMENT_ID;
    document.head.appendChild(s1);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", GA4_MEASUREMENT_ID, { anonymize_ip: true });

    // Consent Mode básico inicial
    gtag("consent", "default", {
      ad_storage: "denied",
      analytics_storage: "granted", // será ajustado por updateConsentMode
      wait_for_update: 500
    });

    gaLoaded = true;
  }

  function disableGA() {
    if (!GA4_MEASUREMENT_ID) return;
    // Desativar coleta
    window["ga-disable-" + GA4_MEASUREMENT_ID] = true;
  }

  function removeAnalyticsCookies() {
    // Cookies típicos do GA
    const names = ["_ga", "_gid", "_gat", "_ga_" + GA4_MEASUREMENT_ID?.replace("G-", "")];
    names.forEach((n) => {
      eraseCookie(n, { domain: COOKIE_DOMAIN });
      eraseCookie(n, { domain: location.hostname });
    });
  }

  function updateConsentMode({ analytics, ad_storage } = {}) {
    if (typeof window.gtag !== "function") return;
    const update = {};
    if (typeof analytics === "string") update.analytics_storage = analytics;
    if (typeof ad_storage === "string") update.ad_storage = ad_storage;
    if (Object.keys(update).length) {
      gtag("consent", "update", update);
    }
  }

  // =============================
  // META PIXEL – OPCIONAL
  // =============================
  let fbLoaded = false;

  function enableFBPixel() {
    if (!FB_PIXEL_ID || fbLoaded) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = "https://connect.facebook.net/en_US/fbevents.js";
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script");
    fbq("init", FB_PIXEL_ID);
    fbq("track", "PageView");
    fbLoaded = true;
  }

  function disableFBPixel() {
    // Não há “desligar” oficial; o que podemos fazer é não carregar se não consentido
    // e remover cookies se criados anteriormente.
  }

  function removeMarketingCookies() {
    // Cookies típicos do Meta
    const names = ["_fbp", "_fbc"];
    names.forEach((n) => {
      eraseCookie(n, { domain: COOKIE_DOMAIN });
      eraseCookie(n, { domain: location.hostname });
    });
  }

  // =============================
  // UI (Banner + Modal de Preferências)
  // =============================
  const styles = `
.cc-wrap{position:fixed;inset:auto 0 0 0;z-index:2147483647;display:flex;justify-content:center;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.cc-box{max-width:940px;margin:16px;border-radius:16px;background:#0f172a;color:#e2e8f0;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.cc-content{padding:16px 18px}
.cc-title{font-weight:700;font-size:16px;margin:0 0 6px}
.cc-text{font-size:14px;line-height:1.45;margin:0 0 12px}
.cc-actions{display:flex;gap:8px;flex-wrap:wrap}
.cc-btn{appearance:none;border:0;border-radius:12px;padding:10px 14px;font-weight:600;cursor:pointer}
.cc-accept{background:#22c55e;color:#0a0f1e}
.cc-reject{background:#e11d48;color:#fff}
.cc-config{background:#1f2937;color:#e5e7eb;border:1px solid #334155}
.cc-link{color:#93c5fd;text-decoration:underline}
.cc-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.6);display:none;align-items:center;justify-content:center;z-index:2147483647}
.cc-modal{width:92vw;max-width:640px;background:#0b1220;color:#e2e8f0;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.cc-modal .cc-content{padding:18px}
.cc-row{display:flex;align-items:center;justify-content:space-between;border:1px solid #1f2a44;border-radius:12px;padding:12px 14px;margin:10px 0}
.cc-row h4{margin:0;font-size:14px}
.cc-switch{position:relative;width:48px;height:28px;background:#1f2a44;border-radius:999px;cursor:pointer;flex:0 0 auto}
.cc-switch input{display:none}
.cc-switch .dot{position:absolute;top:3px;left:3px;width:22px;height:22px;background:#e2e8f0;border-radius:50%;transition:.2s}
.cc-switch[data-on="true"]{background:#3b82f6}
.cc-switch[data-on="true"] .dot{left:23px}
.cc-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.cc-badge{font-size:12px;color:#94a3b8}
.lock{opacity:.6}
@media (prefers-reduced-motion:no-preference){
  .cc-box,.cc-modal{transition:transform .2s ease,opacity .2s ease}
}
`;

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function buildBanner() {
    const wrap = document.createElement("div");
    wrap.className = "cc-wrap";
    wrap.innerHTML = `
      <div class="cc-box" role="region" aria-label="Aviso de cookies">
        <div class="cc-content">
          <p class="cc-title">Usamos cookies</p>
          <p class="cc-text">
            Utilizamos cookies essenciais para o funcionamento do site e, com o seu consentimento, cookies de análise e marketing para melhorar sua experiência.
            Saiba mais em nossa <a class="cc-link" href="${PRIVACY_URL}" target="_blank" rel="noopener">Política de Privacidade</a>.
          </p>
          <div class="cc-actions">
            <button class="cc-btn cc-reject" id="ccRejectAll">Rejeitar</button>
            <button class="cc-btn cc-config" id="ccConfig">Configurar</button>
            <button class="cc-btn cc-accept" id="ccAcceptAll">Aceitar todos</button>
          </div>
          <p class="cc-badge">Preferências válidas por ${CONSENT_COOKIE_DAYS} dias.</p>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById("ccAcceptAll").addEventListener("click", () => {
      const prefs = { essential: true, analytics: true, marketing: true };
      savePrefs(prefs);
      applyPrefs(prefs);
      hideBanner();
    });

    document.getElementById("ccRejectAll").addEventListener("click", () => {
      const prefs = { essential: true, analytics: false, marketing: false };
      savePrefs(prefs);
      applyPrefs(prefs);
      hideBanner();
    });

    document.getElementById("ccConfig").addEventListener("click", () => {
      openModal();
    });

    return wrap;
  }

  function hideBanner() {
    const wrap = document.querySelector(".cc-wrap");
    if (wrap) wrap.remove();
  }

  function buildModal(prefs) {
    const backdrop = document.createElement("div");
    backdrop.className = "cc-modal-backdrop";
    backdrop.innerHTML = `
      <div class="cc-modal" role="dialog" aria-modal="true" aria-label="Preferências de cookies">
        <div class="cc-content">
          <p class="cc-title">Preferências de Cookies</p>
          <div class="cc-row lock">
            <h4>Essenciais</h4>
            <div class="cc-switch" data-on="true" aria-disabled="true" title="Sempre ativos">
              <span class="dot"></span>
            </div>
          </div>
          <div class="cc-row">
            <h4>Análise (Analytics)</h4>
            <div class="cc-switch" id="ccSwitchAnalytics" data-on="${prefs.analytics}">
              <input type="checkbox" ${prefs.analytics ? "checked" : ""} aria-label="Ativar cookies de análise">
              <span class="dot"></span>
            </div>
          </div>
          <div class="cc-row">
            <h4>Marketing</h4>
            <div class="cc-switch" id="ccSwitchMarketing" data-on="${prefs.marketing}">
              <input type="checkbox" ${prefs.marketing ? "checked" : ""} aria-label="Ativar cookies de marketing">
              <span class="dot"></span>
            </div>
          </div>
          <div class="cc-footer">
            <button class="cc-btn cc-config" id="ccCancel">Cancelar</button>
            <button class="cc-btn cc-reject" id="ccSaveReject">Salvar e rejeitar não essenciais</button>
            <button class="cc-btn cc-accept" id="ccSave">Salvar preferências</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    // Switch handlers
    function toggleSwitch(el) {
      const on = el.getAttribute("data-on") === "true";
      el.setAttribute("data-on", String(!on));
      const input = el.querySelector("input");
      if (input) input.checked = !on;
    }
    const sA = backdrop.querySelector("#ccSwitchAnalytics");
    const sM = backdrop.querySelector("#ccSwitchMarketing");
    sA?.addEventListener("click", () => toggleSwitch(sA));
    sM?.addEventListener("click", () => toggleSwitch(sM));

    document.getElementById("ccCancel").addEventListener("click", () => closeModal());
    document.getElementById("ccSaveReject").addEventListener("click", () => {
      const newPrefs = { essential: true, analytics: false, marketing: false };
      savePrefs(newPrefs);
      applyPrefs(newPrefs);
      closeModal();
      hideBanner();
    });
    document.getElementById("ccSave").addEventListener("click", () => {
      const newPrefs = {
        essential: true,
        analytics: sA?.getAttribute("data-on") === "true",
        marketing: sM?.getAttribute("data-on") === "true",
      };
      savePrefs(newPrefs);
      applyPrefs(newPrefs);
      closeModal();
      hideBanner();
    });

    return backdrop;
  }

  function openModal() {
    const prefs = getStoredPrefs() || { ...CATEGORIES };
    if (!document.querySelector(".cc-modal-backdrop")) {
      buildModal(prefs);
    }
    const bd = document.querySelector(".cc-modal-backdrop");
    if (bd) bd.style.display = "flex";
  }

  function closeModal() {
    const bd = document.querySelector(".cc-modal-backdrop");
    if (bd) {
      bd.style.display = "none";
      // Remover do DOM para não acumular
      setTimeout(() => bd.remove(), 150);
    }
  }

  // =============================
  // TELEMETRIA DE VISITA
  // =============================
  function sendVisitTelemetry() {
    try {
      const pathKey = `${location.pathname}${location.search}`;
      const sentKey = "visit_sent:" + pathKey;
      if (sessionStorage.getItem(sentKey) === "1") return;
      sessionStorage.setItem(sentKey, "1");

      const payload = {
        path: location.pathname,
        query: location.search.replace(/^\?/, ""),
        url: location.href,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      };

      fetch("/api/track-visit.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    } catch (_) {
      // silencioso por design
    }
  }

  // =============================
  // INICIALIZAÇÃO
  // =============================
  function init() {
    injectStyles();

    // API pública para reabrir preferências
    window.CookieConsent = {
      open: openModal,
      get: getStoredPrefs,
      reset: () => {
        eraseCookie(CONSENT_COOKIE_NAME, { domain: COOKIE_DOMAIN });
        // Opcional: remover cookies não essenciais
        removeAnalyticsCookies();
        removeMarketingCookies();
        showBanner();
      },
    };

    const prefs = getStoredPrefs();
    if (prefs) {
      applyPrefs(prefs);
    } else {
      showBanner();
    }

    sendVisitTelemetry();
  }

  function showBanner() {
    if (!document.querySelector(".cc-wrap")) {
      buildBanner();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

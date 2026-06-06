;(() => {
  // ============== CONFIG ==============
  const PRIVACY_URL = "https://hepso.com.br/politica-de-privacidade";
  const CONSENT_COOKIE_NAME = "cookie_prefs";
  const CONSENT_COOKIE_DAYS = 180;

  // calcula o domínio base correto (eTLD+1 simples)
  function baseDomain(h) {
    h = h || location.hostname;
    const parts = h.split('.');
    if (parts.length <= 2) return h; // ex.: hepso.com
    const last2 = parts.slice(-2).join('.');    // ex.: example.com
    const last3 = parts.slice(-3).join('.');    // ex.: example.com.br
    // heurística: domínios .com.br / .org.br / .net.br etc. usam 3 partes
    if (/(^|\.)\w+\.(com|org|net|gov|edu)\.br$/i.test(h)) return last3;
    return last2;
  }
  const COOKIE_DOMAIN = '.' + baseDomain();

  const CATEGORIES = { essential: true, analytics: false, marketing: false };

  // ============== COOKIE HELPERS ==============
  function setCookie(name, value, days, opts = {}) {
    let expires = "";
    if (typeof days === "number") {
      const date = new Date();
      date.setTime(date.getTime() + days * 864e5);
      expires = "; expires=" + date.toUTCString();
    }
    const domain = opts.domain ? `; domain=${opts.domain}` : "";
    const path = `; path=${opts.path || "/"}`;
    const samesite = `; samesite=${opts.samesite || "Lax"}`;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = name + "=" + encodeURIComponent(value) + expires + domain + path + samesite + secure;
  }
  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|;)\\s*" + name.replace(/([.*+?^${}()|[\]\\/])/g,"\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function eraseCookieEverywhere(name) {
    // tenta remover em hostname atual e no domínio base (sem gerar erro de “domínio inválido”)
    setCookie(name, "", -1);                                     // sem domain
    setCookie(name, "", -1, { domain: COOKIE_DOMAIN });          // no domínio base
  }

  // ============== ESTADO / APPLY ==============
  function getStoredPrefs() {
    try { const raw = getCookie(CONSENT_COOKIE_NAME); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  function savePrefs(prefs) {
    setCookie(CONSENT_COOKIE_NAME, JSON.stringify({ ...prefs, ts: Date.now() }), CONSENT_COOKIE_DAYS, { domain: COOKIE_DOMAIN });
  }
  function applyPrefs(prefs) {
    // Apenas notifica o analytics via dataLayer (analytics.js cuida do restante)
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "cookie_consent_update", prefs });

    // se usuário negou, limpamos cookies não essenciais (sem forçar domínio fixo)
    if (!prefs.analytics) {
      ["_ga","_gid","_gat"].forEach(eraseCookieEverywhere);
      // GA4 property cookie: _ga_<MEASUREMENT_ID> – remover genericamente por segurança
      Array.from(document.cookie.split(';')).forEach(c=>{
        const n = c.split('=')[0].trim();
        if (/^_ga_/.test(n)) eraseCookieEverywhere(n);
      });
    }
    if (!prefs.marketing) {
      ["_fbp","_fbc"].forEach(eraseCookieEverywhere);
    }
  }

  // ============== UI (banner + modal) ==============
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
@media (prefers-reduced-motion:no-preference){.cc-box,.cc-modal{transition:transform .2s ease,opacity .2s ease}}
`;
  function injectStyles(){ const s=document.createElement("style"); s.textContent=styles; document.head.appendChild(s); }

  function buildBanner(){
    const wrap=document.createElement("div");
    wrap.className="cc-wrap";
    wrap.innerHTML=`
      <div class="cc-box" role="region" aria-label="Aviso de cookies">
        <div class="cc-content">
          <p class="cc-title">Usamos cookies</p>
          <p class="cc-text">
            Utilizamos cookies essenciais e, com o seu consentimento, cookies de análise e marketing.
            Saiba mais em nossa <a class="cc-link" href="${PRIVACY_URL}" target="_blank" rel="noopener">Política de Privacidade</a>.
          </p>
          <div class="cc-actions">
            <button class="cc-btn cc-reject" id="ccRejectAll">Rejeitar</button>
            <button class="cc-btn cc-config" id="ccConfig">Configurar</button>
            <button class="cc-btn cc-accept" id="ccAcceptAll">Aceitar todos</button>
          </div>
          <p class="cc-badge">Preferências válidas por ${CONSENT_COOKIE_DAYS} dias.</p>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    document.getElementById("ccAcceptAll").addEventListener("click", ()=>{
      const prefs={ essential:true, analytics:true, marketing:true };
      savePrefs(prefs); applyPrefs(prefs); hideBanner();
    });
    document.getElementById("ccRejectAll").addEventListener("click", ()=>{
      const prefs={ essential:true, analytics:false, marketing:false };
      savePrefs(prefs); applyPrefs(prefs); hideBanner();
    });
    document.getElementById("ccConfig").addEventListener("click", openModal);
  }
  function hideBanner(){ const w=document.querySelector(".cc-wrap"); if(w) w.remove(); }

  function buildModal(prefs){
    const bd=document.createElement("div");
    bd.className="cc-modal-backdrop";
    bd.innerHTML=`
      <div class="cc-modal" role="dialog" aria-modal="true" aria-label="Preferências de cookies">
        <div class="cc-content">
          <p class="cc-title">Preferências de Cookies</p>
          <div class="cc-row lock">
            <h4>Essenciais</h4>
            <div class="cc-switch" data-on="true" aria-disabled="true" title="Sempre ativos"><span class="dot"></span></div>
          </div>
          <div class="cc-row">
            <h4>Análise (Analytics)</h4>
            <div class="cc-switch" id="ccSwitchAnalytics" data-on="${prefs.analytics}">
              <input type="checkbox" ${prefs.analytics?"checked":""} aria-label="Ativar cookies de análise"><span class="dot"></span>
            </div>
          </div>
          <div class="cc-row">
            <h4>Marketing</h4>
            <div class="cc-switch" id="ccSwitchMarketing" data-on="${prefs.marketing}">
              <input type="checkbox" ${prefs.marketing?"checked":""} aria-label="Ativar cookies de marketing"><span class="dot"></span>
            </div>
          </div>
          <div class="cc-footer">
            <button class="cc-btn cc-config" id="ccCancel">Cancelar</button>
            <button class="cc-btn cc-reject" id="ccSaveReject">Salvar e rejeitar não essenciais</button>
            <button class="cc-btn cc-accept" id="ccSave">Salvar preferências</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(bd);

    function toggle(el){ const on=el.getAttribute("data-on")==="true"; el.setAttribute("data-on",String(!on)); const i=el.querySelector("input"); if(i) i.checked=!on; }
    const sA=bd.querySelector("#ccSwitchAnalytics");
    const sM=bd.querySelector("#ccSwitchMarketing");
    sA&&sA.addEventListener("click",()=>toggle(sA));
    sM&&sM.addEventListener("click",()=>toggle(sM));

    document.getElementById("ccCancel").addEventListener("click", closeModal);
    document.getElementById("ccSaveReject").addEventListener("click", ()=>{
      const p={ essential:true, analytics:false, marketing:false }; savePrefs(p); applyPrefs(p); closeModal(); hideBanner();
    });
    document.getElementById("ccSave").addEventListener("click", ()=>{
      const p={ essential:true,
        analytics: sA?.getAttribute("data-on")==="true",
        marketing: sM?.getAttribute("data-on")==="true" };
      savePrefs(p); applyPrefs(p); closeModal(); hideBanner();
    });
  }
  function openModal(){
    const prefs=getStoredPrefs() || { ...CATEGORIES };
    if(!document.querySelector(".cc-modal-backdrop")) buildModal(prefs);
    const bd=document.querySelector(".cc-modal-backdrop"); if(bd) bd.style.display="flex";
  }
  function closeModal(){
    const bd=document.querySelector(".cc-modal-backdrop");
    if(bd){ bd.style.display="none"; setTimeout(()=>bd.remove(),150); }
  }

  // ============== INIT ==============
  function init(){
    injectStyles();
    window.CookieConsent = {
      open: openModal,
      get: getStoredPrefs,
      reset: () => { eraseCookieEverywhere(CONSENT_COOKIE_NAME); hideBanner(); showBanner(); }
    };
    const prefs=getStoredPrefs();
    if(prefs){ applyPrefs(prefs); }
    else { showBanner(); }
  }
  function showBanner(){ if(!document.querySelector(".cc-wrap")) buildBanner(); }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

<!-- TRGB · visite del sito (modulo sito, v1.0 2026-10-23). Niente cookie, niente dati personali. -->
<script>
(function () {
  var URL_EVENTO = "https://trgb.tregobbi.it/public/sito/evento";
  var CHIAVE = "trgb_nonconto";
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("nonconto") === "1") localStorage.setItem(CHIAVE, "1");
    if (q.get("nonconto") === "0") localStorage.removeItem(CHIAVE);
    if (localStorage.getItem(CHIAVE) === "1") return;          // browser escluso (Marco)
  } catch (e) { /* storage bloccato: si conta normalmente */ }
  var robots = document.querySelector('meta[name="robots"]');
  if (robots && /noindex/i.test(robots.content || "")) return; // pagine noindex: mai
  var u = new URLSearchParams(location.search), ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
  var base = {
    pagina: location.pathname,
    lingua: (document.documentElement.lang || "").slice(0, 2).toLowerCase(),
    provenienza: ref || "diretto",
    utm_source: u.get("utm_source") || undefined,
    utm_medium: u.get("utm_medium") || undefined,
    utm_campaign: u.get("utm_campaign") || undefined,
    dispositivo: window.innerWidth < 768 ? "mobile" : "desktop"
  };
  function invia(tipo, obiettivo) {
    var d = Object.assign({ tipo: tipo, obiettivo: obiettivo }, base);
    var corpo = JSON.stringify(d);
    if (navigator.sendBeacon && navigator.sendBeacon(URL_EVENTO, new Blob([corpo], { type: "text/plain" }))) return;
    try { fetch(URL_EVENTO, { method: "POST", body: corpo, keepalive: true, mode: "no-cors", headers: { "Content-Type": "text/plain" } }); } catch (e) {}
  }
  invia("vista");
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-obiettivo]");
    if (el) invia("clic", el.getAttribute("data-obiettivo"));
  }, true);
})();
</script>

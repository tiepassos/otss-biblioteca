/*!
 * Biblioteca OTSS — <otss-biblioteca>
 * Web Component que lê o CMS do site OTSS (Wix) em tempo real.
 * Coleções: BibliotecaAcervo, BibliotecaTecnologias, BibliotecaMidia,
 *           BibliotecaTipos, BibliotecaTemas. Submissões: Wix Forms.
 * Uso no Wix Studio: Elemento personalizado → URL do servidor → tag "otss-biblioteca".
 */
(() => {
  const DEFAULTS = {
    clientId: "cbb20194-95fa-4ccf-a02b-fce35da284af",
    formId: "2109677c-3891-4840-8823-dcd444c7fb8b",
    siteId: "eef6fc1a-2e9b-47d7-b175-68ea9b7828ab",
    youtube: "https://www.youtube.com/@otssbocaina",
    spotifyShow: "4zq9v5i9pvM3x7B8FNEJZm",
  };
  const API = "https://www.wixapis.com";
  const PAGE = 24;
  const TOKEN_KEY = "otss-biblioteca-token";

  const ODS_CORES = { 1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21", 6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367", 11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B", 16: "#00689D", 17: "#19486A" };
  const ODS_NOMES = { 1: "Erradicação da pobreza", 2: "Fome zero", 3: "Saúde e bem-estar", 4: "Educação de qualidade", 5: "Igualdade de gênero", 6: "Água potável e saneamento", 7: "Energia limpa", 8: "Trabalho decente", 9: "Indústria e inovação", 10: "Redução das desigualdades", 11: "Cidades sustentáveis", 12: "Consumo responsável", 13: "Ação climática", 14: "Vida na água", 15: "Vida terrestre", 16: "Paz e justiça", 17: "Parcerias" };

  /* ---------- utilidades ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plural = (n, um, varios) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
  const safeStore = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };

  function wixImage(uri, w = 640, h = 0) {
    if (!uri) return "";
    if (/^https?:/.test(uri)) return uri;
    const m = String(uri).match(/^wix:image:\/\/v1\/([^/]+)\/([^#]*)/);
    if (!m) return "";
    const id = m[1];
    const name = encodeURIComponent(decodeURIComponent(m[2] || "img.jpg")).replace(/%2F/g, "");
    return h
      ? `https://static.wixstatic.com/media/${id}/v1/fill/w_${w},h_${h},al_c,q_80,enc_auto/${name}`
      : `https://static.wixstatic.com/media/${id}/v1/fit/w_${w},h_${w * 2},q_80,enc_auto/${name}`;
  }
  function wixDocument(uri, siteId) {
    if (!uri) return "";
    if (/^https?:/.test(uri)) return uri;
    const m = String(uri).match(/^wix:document:\/\/v1\/(?:ugd\/)?([^/]+)/);
    return m ? `https://${siteId}.usrfiles.com/ugd/${m[1]}` : "";
  }
  const youtubeId = (url) => (String(url || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || [])[1] || "";
  const playlistId = (url) => (String(url || "").match(/[?&]list=([\w-]+)/) || [])[1] || "";
  const spotifyId = (url) => (String(url || "").match(/episode\/([A-Za-z0-9]{22})/) || [])[1] || "";

  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const ok = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "SPAN", "H3", "H4", "BLOCKQUOTE"]);
    const walk = (node) => {
      [...node.children].forEach((el) => {
        if (!ok.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        [...el.attributes].forEach((a) => { if (!(el.tagName === "A" && a.name === "href")) el.removeAttribute(a.name); });
        if (el.tagName === "A") {
          if (!/^https?:/i.test(el.getAttribute("href") || "")) el.removeAttribute("href");
          el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener");
        }
        walk(el);
      });
    };
    const root = doc.body.firstChild;
    walk(root);
    return root.innerHTML;
  }
  const stripHTML = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent || "";

  const fmtData = (d) => {
    if (!d) return "";
    const s = typeof d === "object" && d.$date ? d.$date : d;
    const dt = new Date(String(s).length === 10 ? s + "T12:00:00" : s);
    return isNaN(dt) ? "" : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  /* ---------- cliente Wix (token anônimo) ---------- */
  class WixClient {
    constructor(clientId) { this.clientId = clientId; this.tok = null; }
    async token() {
      const now = Date.now();
      if (this.tok && this.tok.exp > now) return this.tok.access;
      const saved = safeStore.get(TOKEN_KEY);
      if (saved && saved.clientId === this.clientId && saved.exp > now + 60000) { this.tok = saved; return saved.access; }
      const body = saved && saved.refresh && saved.clientId === this.clientId
        ? { clientId: this.clientId, grantType: "refresh_token", refreshToken: saved.refresh }
        : { clientId: this.clientId, grantType: "anonymous" };
      let r = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok && body.grantType === "refresh_token") {
        r = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: this.clientId, grantType: "anonymous" }) });
      }
      if (!r.ok) throw new Error("Falha ao autenticar com o CMS");
      const j = await r.json();
      this.tok = { clientId: this.clientId, access: j.access_token, refresh: j.refresh_token, exp: now + (j.expires_in - 120) * 1000 };
      safeStore.set(TOKEN_KEY, this.tok);
      return this.tok.access;
    }
    async call(path, body) {
      const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: await this.token() }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Erro ${r.status} em ${path}`);
      return r.json();
    }
    async queryAll(collection, refs = []) {
      const out = [];
      for (let offset = 0; ; offset += 1000) {
        const j = await this.call("/wix-data/v2/items/query", { dataCollectionId: collection, query: { paging: { limit: 1000, offset } }, includeReferencedItems: refs });
        const items = (j.dataItems || []).map((i) => i.data);
        out.push(...items);
        if (items.length < 1000) break;
      }
      return out;
    }
  }

  /* ---------- estilos ---------- */
  const CSS = String.raw`
:host{
  --ink:#16283b; --ink-2:#3b4d61; --ink-3:#6b7a8a;
  --paper:#fbf7ec; --paper-2:#f4eedd; --card:#fffdf7; --line:#e4dcc6;
  --azul:#276cb2; --azul-escuro:#123d7a; --noite:#0f2238; --ceu:#e0f0f8;
  --radius:18px; --radius-s:10px;
  --shadow:0 1px 2px rgba(22,40,59,.06),0 8px 24px -12px rgba(22,40,59,.18);
  --shadow-up:0 2px 4px rgba(22,40,59,.08),0 22px 44px -18px rgba(22,40,59,.35);
  --ease:cubic-bezier(.2,.8,.2,1); --ease-out:cubic-bezier(.16,1,.3,1);
  --f-display:"wfont_6eb6fc_e1f17bbabfd94baa82e75763b86d52ec","wf_e1f17bbabfd94baa82e75763b","orig_museo_700_regular","Museo","Bitter",Georgia,serif;
  --f-body:"wfont_6f9e71_807cc1ad0a5347b68f3464a7d59f4bbb","wf_807cc1ad0a5347b68f3464a7d","orig_museo_500","Museo Sans","Nunito Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --sticky-top:0px;
  display:block; color:var(--ink); background:var(--paper); font-family:var(--f-body);
  font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased; position:relative; container-type:inline-size;
}
*,*::before,*::after{box-sizing:border-box}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
a{color:inherit}
:focus-visible{outline:3px solid #f2b705;outline-offset:2px;border-radius:6px}
.wrap{max-width:1240px;margin:0 auto;padding:0 clamp(16px,4vw,40px)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* HERO */
.hero{position:relative;overflow:hidden;color:#fff;background:radial-gradient(120% 140% at 85% 0%,#276cb2 0%,#123d7a 45%,#0f2238 100%);padding:clamp(56px,9vw,112px) 0 clamp(40px,6vw,72px)}
.hero svg.topo{position:absolute;inset:-10% -5% auto auto;width:min(980px,120%);height:auto;opacity:.22;pointer-events:none}
.topo path{fill:none;stroke:#cfe6f5;stroke-width:1.1;stroke-dasharray:6 10;animation:drift 38s linear infinite}
.topo path:nth-child(2n){animation-duration:52s;animation-direction:reverse;opacity:.7}
@keyframes drift{to{stroke-dashoffset:-640}}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#bfe0f3}
.eyebrow::before{content:"";width:28px;height:2px;background:#f2b705;border-radius:2px}
.hero h1{font-family:var(--f-display);font-weight:700;font-size:clamp(40px,7.2vw,88px);line-height:.98;letter-spacing:-.02em;margin:18px 0 18px;max-width:14ch}
.hero h1 em{font-style:normal;color:#f2b705}
.lead{font-size:clamp(16px,1.6vw,19px);max-width:58ch;color:#dbeaf5;margin:0 0 32px}
.search{position:relative;max-width:760px}
.search input{width:100%;height:68px;border-radius:999px;border:2px solid transparent;background:#fff;color:var(--ink);padding:0 150px 0 64px;font-size:18px;box-shadow:0 18px 50px -20px rgba(0,0,0,.55);transition:border-color .25s var(--ease),box-shadow .25s var(--ease)}
.search input::placeholder{color:#8a96a3}
.search input:focus{outline:none;border-color:#f2b705;box-shadow:0 0 0 6px rgba(242,183,5,.25),0 18px 50px -20px rgba(0,0,0,.55)}
.search .ico{position:absolute;left:24px;top:50%;translate:0 -50%;width:24px;height:24px;color:var(--azul)}
.search .kbd{position:absolute;right:20px;top:50%;translate:0 -50%;display:flex;gap:8px;align-items:center;color:var(--ink-3);font-size:13px}
.search kbd{font:600 12px/1 var(--f-body);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:4px 7px;background:var(--paper)}
.search .clear{display:none;width:32px;height:32px;border-radius:50%;background:var(--paper-2);color:var(--ink-2)}
.search.has-q .clear{display:grid;place-items:center}
.search.has-q .hint{display:none}
@container (max-width:620px){.search .hint{display:none}.search input{height:60px;padding:0 56px 0 54px;font-size:16px}.search .ico{left:20px}}
.stats{display:flex;flex-wrap:wrap;gap:clamp(20px,4vw,56px);margin-top:40px}
.stat b{display:block;font-family:var(--f-display);font-size:clamp(30px,4vw,44px);line-height:1;color:#fff;font-variant-numeric:tabular-nums}
.stat span{font-size:13px;color:#a9cbe2;letter-spacing:.04em}

/* DESTAQUES */
.feat{padding-top:clamp(40px,6vw,72px);padding-bottom:8px}
.sec-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:22px}
.sec-head h2{font-family:var(--f-display);font-size:clamp(26px,3.2vw,38px);line-height:1.05;margin:0;letter-spacing:-.01em}
.sec-head p{margin:6px 0 0;color:var(--ink-3)}
.rail-ctrl{display:flex;gap:8px}
.round{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;background:var(--card);transition:transform .2s var(--ease),background .2s}
.round:hover{transform:translateY(-2px);background:#fff}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(280px,1fr);gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 2px 24px;scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
@container (min-width:900px){.rail{grid-auto-columns:calc((100% - 40px)/3)}}
.fcard{scroll-snap-align:start;position:relative;border-radius:var(--radius);overflow:hidden;min-height:400px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;background:var(--noite);text-align:left;box-shadow:var(--shadow);isolation:isolate;transition:transform .45s var(--ease-out),box-shadow .45s var(--ease-out)}
.fcard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform 1.2s var(--ease-out)}
.fcard::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(15,34,56,0) 25%,rgba(15,34,56,.92) 78%)}
.fcard:hover{transform:translateY(-6px);box-shadow:var(--shadow-up)}
.fcard:hover img{transform:scale(1.06)}
.fcard .in{padding:24px}
.fcard h3{font-family:var(--f-display);font-size:22px;line-height:1.15;margin:10px 0 8px}
.fcard p{margin:0;color:#d6e4ef;font-size:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* NAV (abas) */
.nav{position:sticky;top:var(--sticky-top);z-index:20;background:rgba(251,247,236,.9);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line);margin-top:24px}
.tabs{position:relative;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:12px 0}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 16px;border-radius:999px;font-weight:600;font-size:15px;color:var(--ink-2);white-space:nowrap;transition:color .25s var(--ease)}
.tab .dot{width:9px;height:9px;border-radius:50%;background:var(--c,var(--azul));box-shadow:0 0 0 3px color-mix(in srgb,var(--c,var(--azul)) 18%,transparent)}
.tab .n{font-size:12px;font-weight:700;min-width:24px;height:20px;padding:0 6px;border-radius:999px;background:rgba(22,40,59,.07);display:inline-grid;place-items:center;font-variant-numeric:tabular-nums;transition:background .25s}
.tab[aria-selected="true"]{color:#fff}
.tab[aria-selected="true"] .n{background:rgba(255,255,255,.22)}
.tab[aria-selected="true"] .dot{background:#fff;box-shadow:none}
.tab.zero{opacity:.45}
.pill{position:absolute;z-index:0;top:12px;height:42px;border-radius:999px;background:var(--c,var(--ink));transition:left .45s var(--ease-out),width .45s var(--ease-out),background-color .45s var(--ease)}

/* FILTROS */
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:18px 0 6px}
.fbtn,.sel{height:40px;border-radius:999px;border:1.5px solid var(--line);background:var(--card);padding:0 16px;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;transition:border-color .2s,background .2s}
.fbtn:hover,.sel:hover{border-color:#cdbf9b}
.fbtn[aria-expanded="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.fbtn .badge{background:#f2b705;color:var(--ink);border-radius:999px;font-size:11px;padding:1px 7px}
.sel{appearance:none;-webkit-appearance:none;padding-right:34px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2316283b' stroke-width='1.8' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.spacer{flex:1}
.count{font-size:14px;color:var(--ink-3)}
.count b{color:var(--ink)}
.views{display:inline-flex;border:1.5px solid var(--line);border-radius:999px;padding:3px;background:var(--card)}
.views button{width:36px;height:30px;border-radius:999px;display:grid;place-items:center;color:var(--ink-3);transition:background .2s,color .2s}
.views button[aria-pressed="true"]{background:var(--ink);color:#fff}
.panel{overflow:hidden;display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s var(--ease-out)}
.panel.open{grid-template-rows:1fr}
.panel>div{min-height:0}
.eixos{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));padding:14px 0 18px}
.eixo h4{margin:0 0 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--c);display:flex;align-items:center;gap:8px}
.eixo h4::before{content:"";width:14px;height:14px;border-radius:4px;background:var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;background:color-mix(in srgb,var(--c,#888) 10%,#fff);color:color-mix(in srgb,var(--c,#888) 75%,#000);border:1.5px solid color-mix(in srgb,var(--c,#888) 25%,transparent);transition:background .2s,color .2s,transform .2s var(--ease)}
.chip:hover{transform:translateY(-1px)}
.chip[aria-pressed="true"]{background:var(--c);color:#fff;border-color:var(--c)}
.chip .x{opacity:.8}
.active-row{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 8px}
.linkbtn{font-size:13px;font-weight:700;text-decoration:underline;text-underline-offset:3px;color:var(--ink-2)}

/* RESULTADOS */
.results{padding:18px 0 40px;min-height:50vh}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
.list{display:flex;flex-direction:column;gap:12px}
.card{position:relative;display:flex;flex-direction:column;text-align:left;background:var(--card);border-radius:var(--radius);border:1px solid var(--line);overflow:hidden;box-shadow:var(--shadow);transition:transform .4s var(--ease-out),box-shadow .4s var(--ease-out),border-color .3s;animation:rise .6s var(--ease-out) both;animation-delay:calc(var(--i,0) * 35ms)}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--c,var(--azul));transition:width .35s var(--ease-out)}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-up);border-color:color-mix(in srgb,var(--c) 40%,var(--line))}
.card:hover::before{width:10px}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
.card .body{padding:20px 20px 18px 26px;display:flex;flex-direction:column;gap:10px;flex:1}
.kicker{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c,var(--azul))}
.kicker .yr{color:var(--ink-3);letter-spacing:0}
.card h3{font-family:var(--f-display);font-size:19px;line-height:1.22;margin:0;letter-spacing:-.005em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.authors{font-size:14px;color:var(--ink-2);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.venue{font-size:13px;color:var(--ink-3);margin:0;font-style:italic;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:auto;padding-top:6px}
.tag{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,#fff);color:color-mix(in srgb,var(--c) 80%,#000)}
.acts{margin-left:auto;display:flex;gap:4px}
.ibtn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:var(--ink-2);transition:background .2s,color .2s}
.ibtn:hover{background:var(--paper-2);color:var(--ink)}
.card .media{position:relative;aspect-ratio:16/10;background:var(--paper-2);overflow:hidden}
.card .media img{width:100%;height:100%;object-fit:cover;transition:transform .9s var(--ease-out)}
.card:hover .media img{transform:scale(1.05)}
.card .media.portrait{aspect-ratio:4/5}
.play{position:absolute;inset:0;display:grid;place-items:center}
.play i{width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;color:#c4302b;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);transition:transform .35s var(--ease-out)}
.card:hover .play i{transform:scale(1.12)}
.dur{position:absolute;right:10px;bottom:10px;background:rgba(15,34,56,.85);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px}
.ods{display:flex;flex-wrap:wrap;gap:4px}
.ods span{width:26px;height:26px;border-radius:5px;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:800;background:var(--o)}
mark{background:#ffe58a;color:inherit;border-radius:3px;padding:0 1px}

/* lista compacta */
.list .card{flex-direction:row;align-items:stretch}
.list .card .media{display:none}
.list .card .body{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:4px 18px;padding:16px 18px 16px 24px}
.list .card .kicker{flex:0 0 190px}
.list .card .main{flex:1 1 420px;display:flex;flex-direction:column;gap:4px;min-width:0}
.list .card h3{font-size:17px;-webkit-line-clamp:2}
.list .card .foot{margin:0;padding:0;flex:0 0 auto}
.list .card .ods,.list .card .excerpt{display:none}
.excerpt{font-size:14px;color:var(--ink-2);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* podcast */
.show{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:28px;align-items:center;background:linear-gradient(135deg,#1e3750,#0f2238);color:#fff;border-radius:calc(var(--radius) + 6px);padding:clamp(20px,3vw,32px);margin-bottom:26px;overflow:hidden;position:relative}
.show h3{font-family:var(--f-display);font-size:clamp(26px,3vw,36px);margin:6px 0 10px;line-height:1.05}
.show p{color:#c8d9e6;margin:0 0 18px}
.show iframe{width:100%;height:232px;border:0;border-radius:14px;background:#000}
.wave{display:flex;gap:4px;align-items:end;height:28px;margin-bottom:12px}
.wave i{width:4px;border-radius:3px;background:#1ed760;animation:eq 1.1s var(--ease) infinite alternate}
.wave i:nth-child(2){animation-delay:.2s}.wave i:nth-child(3){animation-delay:.45s}.wave i:nth-child(4){animation-delay:.1s}.wave i:nth-child(5){animation-delay:.35s}
@keyframes eq{from{height:6px}to{height:28px}}
@container (max-width:760px){.show{grid-template-columns:1fr}}
.cta{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 20px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;transition:transform .25s var(--ease),box-shadow .25s}
.cta:hover{transform:translateY(-2px)}
.cta.spot{background:#1ed760;color:#0b2414}
.cta.yt{background:#ff0033;color:#fff}
.cta.dark{background:var(--ink);color:#fff}
.cta.light{background:#fff;color:var(--ink);border:1.5px solid var(--line)}

/* vazio / carregando */
.empty{text-align:center;padding:72px 16px;color:var(--ink-3)}
.empty h3{font-family:var(--f-display);color:var(--ink);font-size:24px;margin:16px 0 6px}
.sk{border-radius:var(--radius);background:linear-gradient(100deg,var(--paper-2) 30%,#fff8e6 50%,var(--paper-2) 70%);background-size:300% 100%;animation:shim 1.4s linear infinite;height:220px}
@keyframes shim{to{background-position:-100% 0}}
.more{display:flex;justify-content:center;padding:28px 0 0}
.err{background:#fff1f0;border:1px solid #f3c2bd;color:#8a2c22;border-radius:var(--radius-s);padding:16px 18px}

/* DRAWER */
.scrim{position:fixed;inset:0;background:rgba(15,34,56,.5);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .35s var(--ease);z-index:1000}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;z-index:1001;top:0;right:0;bottom:0;width:min(640px,100%);background:var(--paper);box-shadow:-30px 0 80px -30px rgba(0,0,0,.5);transform:translateX(104%);transition:transform .55s var(--ease-out);display:flex;flex-direction:column}
.drawer.on{transform:none}
@container (max-width:700px){.drawer{top:auto;width:100%;height:92vh;border-radius:22px 22px 0 0;transform:translateY(104%)}}
.dhead{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.dhead .kicker{flex:1}
.dbody{overflow-y:auto;padding:24px clamp(18px,4vw,36px) 48px;overscroll-behavior:contain}
.dbody h2{font-family:var(--f-display);font-size:clamp(24px,3vw,32px);line-height:1.1;margin:0 0 14px;letter-spacing:-.01em}
.meta{display:grid;grid-template-columns:120px 1fr;gap:8px 16px;margin:20px 0;font-size:14px}
.meta dt{color:var(--ink-3);font-weight:600}
.meta dd{margin:0}
.ref{position:relative;background:var(--card);border:1px dashed #cdbf9b;border-radius:var(--radius-s);padding:16px 18px;font-size:14px;line-height:1.55;margin:18px 0}
.ref small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;font-weight:700}
.btnrow{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.hero-img{width:100%;border-radius:var(--radius);margin-bottom:20px;box-shadow:var(--shadow)}
.embed{position:relative;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden;background:#000;margin-bottom:20px}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.block{margin:22px 0}
.block h4{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--c,var(--azul));margin:0 0 8px}
.block p,.rich{margin:0;color:var(--ink-2);white-space:pre-line}
.rich p{margin:0 0 .8em}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px}

/* SUBMISSÃO */
.submit{background:var(--ceu);padding:clamp(48px,7vw,88px) 0;margin-top:24px;position:relative;overflow:hidden}
.submit .grid2{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,5vw,64px);align-items:start}
@container (max-width:860px){.submit .grid2{grid-template-columns:1fr}}
.submit h2{font-family:var(--f-display);font-size:clamp(30px,4vw,48px);line-height:1.02;margin:12px 0 16px;letter-spacing:-.015em}
.submit .eyebrow{color:var(--azul-escuro)}
.steps{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:14px}
.steps li{display:flex;gap:14px;align-items:flex-start;color:var(--ink-2)}
.steps b{flex:none;width:30px;height:30px;border-radius:50%;background:var(--azul-escuro);color:#fff;display:grid;place-items:center;font-size:14px}
form{background:#fff;border-radius:calc(var(--radius) + 4px);padding:clamp(20px,3vw,32px);box-shadow:var(--shadow-up);display:grid;grid-template-columns:1fr 1fr;gap:14px}
@container (max-width:560px){form{grid-template-columns:1fr}}
.f{display:flex;flex-direction:column;gap:6px}
.f.full{grid-column:1/-1}
.f label{font-size:13px;font-weight:700;color:var(--ink-2)}
.f input,.f select,.f textarea{border:1.5px solid var(--line);border-radius:12px;background:var(--paper);padding:12px 14px;font-size:15px;transition:border-color .2s,background .2s}
.f input:focus,.f select:focus,.f textarea:focus{outline:none;border-color:var(--azul);background:#fff}
.f textarea{min-height:96px;resize:vertical}
.drop{grid-column:1/-1;border:2px dashed #9fc3dc;border-radius:16px;background:linear-gradient(180deg,#f6fbfe,#eef6fb);padding:24px;text-align:center;transition:border-color .25s,background .25s,transform .25s var(--ease)}
.drop.over{border-color:var(--azul);background:#e3f1fa;transform:scale(1.01)}
.drop .ic{width:52px;height:52px;margin:0 auto 10px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--azul);box-shadow:var(--shadow);animation:bob 2.6s var(--ease) infinite}
@keyframes bob{50%{transform:translateY(-5px)}}
.drop p{margin:0;color:var(--ink-2);font-size:14px}
.drop u{color:var(--azul);font-weight:700;cursor:pointer}
.files{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px;text-align:left}
.files li{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px}
.bar{grid-column:1/-1;height:4px;border-radius:4px;background:var(--paper-2);overflow:hidden}
.bar i{display:block;height:100%;width:0;background:var(--azul);transition:width .4s var(--ease)}
.files li.done .bar i{background:#2f9e5b}
.formfoot{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.formfoot small{color:var(--ink-3);max-width:40ch}
.ok{grid-column:1/-1;text-align:center;padding:30px 10px}
.ok .check{width:72px;height:72px;margin:0 auto 14px}
.ok .check circle{stroke:#2f9e5b;stroke-dasharray:190;stroke-dashoffset:190;animation:draw .7s var(--ease-out) forwards}
.ok .check path{stroke:#2f9e5b;stroke-dasharray:40;stroke-dashoffset:40;animation:draw .45s .5s var(--ease-out) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.hp{position:absolute;left:-9999px}

.toast{position:fixed;left:50%;bottom:24px;translate:-50% 20px;background:var(--ink);color:#fff;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:600;opacity:0;pointer-events:none;transition:opacity .3s,translate .4s var(--ease-out);z-index:1100}
.toast.on{opacity:1;translate:-50% 0}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .9s var(--ease-out),transform .9s var(--ease-out)}
.reveal.in{opacity:1;transform:none}
.foot-note{padding:28px 0 40px;text-align:center;font-size:13px;color:var(--ink-3)}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
  .reveal{opacity:1;transform:none}
}
`;

  /* ---------- ícones ---------- */
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
    grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
    list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    copy: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    ext: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    pdf: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15l3 3 3-3"/></svg>',
    link: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    upload: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    book: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#9fb3c4" stroke-width="1.4" stroke-linecap="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6"/></svg>',
  };

  const TOPO = `<svg class="topo" viewBox="0 0 900 600" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => {
    const r = 40 + i * 34, cx = 600, cy = 220;
    const pts = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      const w = r * (1 + 0.16 * Math.sin(a * 3 + i * 0.7) + 0.08 * Math.cos(a * 5 - i));
      return [cx + Math.cos(a) * w * 1.35, cy + Math.sin(a) * w * 0.85];
    });
    const d = pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + "Z";
    return `<path d="${d}"/>`;
  }).join("")}</svg>`;

  /* ---------- componente ---------- */
  class OtssBiblioteca extends HTMLElement {
    static get observedAttributes() { return ["sticky-offset"]; }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.cfg = { ...DEFAULTS };
      this.state = { tab: "tudo", q: "", temas: new Set(), de: "", ate: "", ordem: "relevancia", view: "grid", shown: PAGE, filtersOpen: false };
      this.data = null;
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      ["client-id", "form-id", "site-id"].forEach((a) => {
        const v = this.getAttribute(a);
        if (v) this.cfg[a.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
      });
      this.client = new WixClient(this.cfg.clientId);
      this.injectFonts();
      this.readHash();
      this.renderShell();
      this.load();
    }

    attributeChangedCallback(name, _o, v) {
      if (name === "sticky-offset") this.style.setProperty("--sticky-top", (parseInt(v, 10) || 0) + "px");
    }

    injectFonts() {
      if (document.getElementById("otss-bib-fonts")) return;
      const l = document.createElement("link");
      l.id = "otss-bib-fonts"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Bitter:wght@600;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap";
      document.head.appendChild(l);
    }

    /* ----- estado na URL ----- */
    readHash() {
      const h = new URLSearchParams(location.hash.replace(/^#/, ""));
      if (!h.has("aba") && !h.has("q") && !h.has("item")) return;
      this.state.tab = h.get("aba") || "tudo";
      this.state.q = h.get("q") || "";
      this.state.temas = new Set((h.get("temas") || "").split(",").filter(Boolean));
      this.state.de = h.get("de") || "";
      this.state.ate = h.get("ate") || "";
      this.state.ordem = h.get("ordem") || "relevancia";
      this.pendingItem = h.get("item") || "";
    }
    writeHash() {
      const s = this.state, h = new URLSearchParams();
      if (s.tab !== "tudo") h.set("aba", s.tab);
      if (s.q) h.set("q", s.q);
      if (s.temas.size) h.set("temas", [...s.temas].join(","));
      if (s.de) h.set("de", s.de);
      if (s.ate) h.set("ate", s.ate);
      if (s.ordem !== "relevancia") h.set("ordem", s.ordem);
      if (this.openId) h.set("item", this.openId);
      const str = h.toString();
      try { history.replaceState(null, "", str ? "#" + str : location.pathname + location.search); } catch { /* sandbox */ }
    }

    /* ----- dados ----- */
    async load() {
      try {
        const c = this.client;
        const [tipos, temas, acervo, tecs, midia] = await Promise.all([
          c.queryAll("BibliotecaTipos"),
          c.queryAll("BibliotecaTemas"),
          c.queryAll("BibliotecaAcervo", ["tipo", "temas"]),
          c.queryAll("BibliotecaTecnologias", ["temas"]),
          c.queryAll("BibliotecaMidia", ["temas"]),
        ]);
        this.prepare({ tipos, temas, acervo, tecs, midia });
        this.renderAll();
        if (this.pendingItem) { const it = this.byId.get(this.pendingItem); if (it) this.openItem(it); }
      } catch (e) {
        console.error("[otss-biblioteca]", e);
        this.$(".results").innerHTML = `<div class="err"><b>Não foi possível carregar a biblioteca agora.</b><br>Verifique sua conexão e tente novamente. <button class="linkbtn" data-act="retry">Tentar de novo</button></div>`;
      }
    }

    prepare({ tipos, temas, acervo, tecs, midia }) {
      const visible = (x) => x.visivel !== false;
      const tipoById = new Map(tipos.map((t) => [t._id, t]));
      this.temas = temas.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
      const eixos = new Map();
      this.temas.forEach((t) => {
        const k = t.eixo || "Outros";
        if (!eixos.has(k)) eixos.set(k, { nome: k, cor: t.cor || "#6b7a8a", temas: [] });
        eixos.get(k).temas.push(t);
      });
      this.eixos = [...eixos.values()];
      const temaRefs = (arr) => (Array.isArray(arr) ? arr.filter((t) => t && t._id) : []);
      const items = [];

      const outrosTipo = { _id: "outros", nome: "Outros", slug: "outros", cor: "#6b7a8a", ordem: 98 };
      acervo.filter(visible).forEach((d) => {
        const tp = (d.tipo && typeof d.tipo === "object" ? d.tipo : tipoById.get(d.tipo)) || outrosTipo;
        const tm = temaRefs(d.temas);
        items.push({
          id: d._id, kind: "acervo", tab: tp.slug, tipo: tp, cor: tp.cor || "#276cb2",
          titulo: d.titulo || "Sem título", autores: d.autores || "", ano: d.ano || (d.data ? +String(d.data).slice(0, 4) : null),
          data: d.data || "", resumo: d.resumo || "", referencia: d.referencia || "", veiculo: d.veiculo || "",
          editora: d.editora || "", cidade: d.cidade || "", link: d.link || "", arquivo: wixDocument(d.arquivo, this.cfg.siteId),
          capa: d.capa || "", video: d.video || "", projetos: d.projetos || [], palavras: d.palavrasChave || [],
          formato: d.formatoOriginal || "", destaque: !!d.destaque, temas: tm, created: d._createdDate?.$date || "",
        });
      });
      const tecTipo = { _id: "tecnologias", nome: "Tecnologias Sociais", slug: "tecnologias", cor: "#2f7d6d" };
      tecs.filter(visible).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)).forEach((d) => {
        items.push({
          id: d._id, kind: "tecnologia", tab: "tecnologias", tipo: tecTipo, cor: tecTipo.cor, titulo: d.title || "",
          resumo: stripHTML(d.descrio), resumoHTML: d.descrio || "", problema: d.problemaSolucionado || "", solucao: d.soluoAdotada || "",
          resultado: d.resultadoAlcanado || "", capa: d.fotoPrincipal || "", fotos: [d.fotosSecundriasFaixa2, d.foto3, d.foto4].filter(Boolean),
          ods: (d.odsNumeros || []).map((n) => +n).filter((n) => n >= 1 && n <= 17).sort((a, b) => a - b),
          link: d.linkPagina || "", arquivo: wixDocument(d.arquivo, this.cfg.siteId), temas: temaRefs(d.temas), ordem: d.ordem ?? 999,
          ano: null, autores: "",
        });
      });
      const vidTipo = { _id: "videos", nome: "Vídeos", slug: "videos", cor: "#c4302b" };
      const podTipo = { _id: "podcast", nome: "Podcast", slug: "podcast", cor: "#1a9e4b" };
      midia.filter(visible).forEach((d) => {
        const isPod = d.tipo === "podcast";
        const tp = isPod ? podTipo : vidTipo;
        items.push({
          id: d._id, kind: isPod ? "podcast" : "video", sub: d.tipo || "video", tab: tp.slug, tipo: tp, cor: tp.cor,
          titulo: d.titulo || "", resumo: d.descricao || "", url: d.url || "", data: d.data || "", ano: d.data ? +String(d.data).slice(0, 4) : null,
          duracao: d.duracao || "", capa: d.capa || "", serie: d.serie || "", destaque: !!d.destaque, ordem: d.ordem ?? 999,
          temas: temaRefs(d.temas), autores: d.serie || "",
        });
      });

      items.forEach((it) => {
        it.hay = norm([it.titulo, it.autores, it.resumo, it.referencia, it.veiculo, it.editora, it.cidade, it.serie, it.problema, it.solucao,
          it.resultado, it.tipo.nome, it.formato, it.ano, ...(it.projetos || []), ...(it.palavras || []), ...it.temas.map((t) => t.nome + " " + t.eixo),
          ...(it.ods || []).map((n) => "ods " + n + " " + ODS_NOMES[n])].filter(Boolean).join(" \u0001 "));
        it.hayTitle = norm(it.titulo);
      });
      this.items = items;
      this.byId = new Map(items.map((i) => [i.id, i]));

      const counts = {};
      items.forEach((i) => (counts[i.tab] = (counts[i.tab] || 0) + 1));
      const tabTipos = tipos.filter((t) => t.ativo !== false).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
      this.tabs = [
        { slug: "tudo", nome: "Tudo", cor: "#16283b" },
        ...tabTipos.map((t) => ({ slug: t.slug, nome: t.nome, cor: t.cor || "#276cb2" })),
        ...(counts.outros ? [{ slug: "outros", nome: "Outros", cor: "#6b7a8a" }] : []),
        { slug: "tecnologias", nome: "Tecnologias Sociais", cor: tecTipo.cor },
        { slug: "videos", nome: "Vídeos", cor: vidTipo.cor },
        { slug: "podcast", nome: "Podcast", cor: podTipo.cor },
      ];
      if (!this.tabs.some((t) => t.slug === this.state.tab)) this.state.tab = "tudo";
      const anos = items.map((i) => i.ano).filter((n) => n > 1900);
      this.anoMin = Math.min(...anos); this.anoMax = Math.max(...anos);
      this.stats = {
        acervo: items.filter((i) => i.kind === "acervo").length,
        tec: counts.tecnologias || 0,
        pod: counts.podcast || 0,
        vid: counts.videos || 0,
      };
    }

    /* ----- busca e filtros ----- */
    search(list) {
      const q = norm(this.state.q).trim();
      if (!q) return list.map((it) => ({ it, score: 0 }));
      const terms = q.split(/\s+/).filter(Boolean);
      const out = [];
      for (const it of list) {
        let score = 0, ok = true;
        for (const t of terms) {
          const pos = it.hay.indexOf(t);
          if (pos < 0) { ok = false; break; }
          score += it.hayTitle.includes(t) ? 10 : 1;
          if (it.hayTitle.startsWith(t)) score += 5;
        }
        if (ok) { if (it.hayTitle.includes(q)) score += 20; out.push({ it, score }); }
      }
      return out;
    }
    filterBase() {
      const s = this.state;
      const de = +s.de || 0, ate = +s.ate || 9999;
      return this.items.filter((it) => {
        if (s.temas.size && !it.temas.some((t) => s.temas.has(t.slug))) return false;
        if ((s.de || s.ate) && (!it.ano || it.ano < de || it.ano > ate)) return false;
        return true;
      });
    }
    sorted(res) {
      const o = this.state.ordem, s = this.state;
      const by = {
        recentes: (a, b) => (b.it.ano || 0) - (a.it.ano || 0) || String(b.it.data || b.it.created).localeCompare(String(a.it.data || a.it.created)),
        antigos: (a, b) => (a.it.ano || 9999) - (b.it.ano || 9999),
        az: (a, b) => a.it.titulo.localeCompare(b.it.titulo, "pt-BR"),
      };
      if (by[o]) return res.sort(by[o]);
      if (s.q) return res.sort((a, b) => b.score - a.score || by.recentes(a, b));
      const pri = (it) => (it.kind === "tecnologia" || it.kind === "podcast" || it.kind === "video" ? it.ordem : 0);
      return res.sort((a, b) => (b.it.destaque - a.it.destaque) || (s.tab === "tudo" ? 0 : pri(a.it) - pri(b.it)) || by.recentes(a, b));
    }
    compute() {
      const res = this.search(this.filterBase());
      const counts = { tudo: res.length };
      res.forEach(({ it }) => (counts[it.tab] = (counts[it.tab] || 0) + 1));
      const cur = this.state.tab === "tudo" ? res : res.filter((r) => r.it.tab === this.state.tab);
      return { counts, results: this.sorted(cur) };
    }

    /* ----- render ----- */
    $(sel) { return this.root.querySelector(sel); }
    $$(sel) { return [...this.root.querySelectorAll(sel)]; }

    renderShell() {
      this.root.innerHTML = `<style>${CSS}</style>
<section class="hero" part="hero">
  ${TOPO}
  <div class="wrap">
    <span class="eyebrow">OTSS · Biblioteca</span>
    <h1>Conhecimento que nasce do <em>território</em></h1>
    <p class="lead">Publicações, pesquisas, tecnologias sociais, vídeos e podcast do Observatório de Territórios Sustentáveis e Saudáveis da Bocaina — num só lugar, sempre atualizado.</p>
    <div class="search${this.state.q ? " has-q" : ""}" role="search">
      <span class="ico">${I.search}</span>
      <label class="sr" for="q">Buscar na biblioteca</label>
      <input id="q" type="search" autocomplete="off" placeholder="Busque por título, autoria, tema, ano…" value="${esc(this.state.q)}">
      <span class="kbd"><span class="hint">Atalho <kbd>/</kbd></span><button class="clear" data-act="clear-q" aria-label="Limpar busca">${I.x}</button></span>
    </div>
    <div class="stats" aria-live="polite">
      <div class="stat"><b data-count="acervo">—</b><span>publicações e pesquisas</span></div>
      <div class="stat"><b data-count="tec">—</b><span>tecnologias sociais</span></div>
      <div class="stat"><b data-count="pod">—</b><span>episódios de podcast</span></div>
      <div class="stat"><b data-count="vid">—</b><span>vídeos</span></div>
    </div>
  </div>
</section>
<section class="feat wrap reveal" aria-labelledby="dh" hidden>
  <div class="sec-head"><div><h2 id="dh">Em destaque</h2><p>Lançamentos e materiais selecionados pela equipe.</p></div>
  <div class="rail-ctrl"><button class="round" data-act="rail" data-dir="-1" aria-label="Anterior">${I.left}</button><button class="round" data-act="rail" data-dir="1" aria-label="Próximo">${I.right}</button></div></div>
  <div class="rail"></div>
</section>
<nav class="nav" aria-label="Seções da biblioteca"><div class="wrap"><div class="tabs" role="tablist"><span class="pill"></span></div></div></nav>
<div class="wrap">
  <div class="filters">
    <button class="fbtn" data-act="toggle-filters" aria-expanded="false" aria-controls="fp">${I.filter} Temas e eixos <span class="badge" hidden></span></button>
    <label class="sr" for="de">Ano inicial</label><select id="de" class="sel"></select>
    <label class="sr" for="ate">Ano final</label><select id="ate" class="sel"></select>
    <label class="sr" for="ordem">Ordenar</label>
    <select id="ordem" class="sel"><option value="relevancia">Relevância</option><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option><option value="az">A–Z</option></select>
    <span class="spacer"></span>
    <span class="count" aria-live="polite"></span>
    <div class="views" role="group" aria-label="Visualização"><button data-act="view" data-v="grid" aria-label="Grade">${I.grid}</button><button data-act="view" data-v="list" aria-label="Lista">${I.list}</button></div>
  </div>
  <div class="panel" id="fp"><div><div class="eixos"></div></div></div>
  <div class="active-row"></div>
  <div class="results" aria-live="polite"><div class="grid">${'<div class="sk"></div>'.repeat(6)}</div></div>
</div>
<section class="submit" id="enviar">
  <div class="wrap grid2">
    <div class="reveal">
      <span class="eyebrow">Faça parte do acervo</span>
      <h2>Envie sua publicação para a Biblioteca</h2>
      <p>Pesquisas, cartilhas, artigos, vídeos e materiais produzidos com ou sobre os territórios tradicionais da Bocaina são bem-vindos.</p>
      <ol class="steps"><li><b>1</b><span>Preencha os dados e anexe o arquivo (PDF, imagem ou ZIP) ou um link.</span></li><li><b>2</b><span>A equipe do OTSS faz a curadoria e a catalogação por tema.</span></li><li><b>3</b><span>O material é publicado e passa a aparecer na busca.</span></li></ol>
    </div>
    <div class="reveal">${this.formHTML()}</div>
  </div>
</section>
<p class="foot-note wrap">Acervo atualizado automaticamente a partir do CMS do OTSS.</p>
<div class="scrim" data-act="close"></div>
<aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do item" tabindex="-1"></aside>
<div class="toast" role="status"></div>`;
      this.bind();
      this.observeReveal();
    }

    formHTML() {
      const tipos = ["Publicação OTSS", "Livro", "Capítulo de livro", "Artigo", "Tese, dissertação ou TCC", "Trabalho em evento", "Caderno", "Tecnologia social", "Vídeo ou podcast", "Outro"];
      return `<form novalidate>
  <div class="f"><label for="s-nome">Seu nome *</label><input id="s-nome" name="first_name" required autocomplete="name"></div>
  <div class="f"><label for="s-email">E-mail *</label><input id="s-email" name="email" type="email" required autocomplete="email"></div>
  <div class="f full"><label for="s-tit">Título da publicação *</label><input id="s-tit" name="titulo_publicacao" required></div>
  <div class="f"><label for="s-aut">Autoria</label><input id="s-aut" name="autoria" placeholder="SOBRENOME, Nome; …"></div>
  <div class="f"><label for="s-inst">Instituição / comunidade</label><input id="s-inst" name="company" autocomplete="organization"></div>
  <div class="f"><label for="s-tipo">Tipo de material</label><select id="s-tipo" name="tipo"><option value="">Selecione</option>${tipos.map((t) => `<option>${t}</option>`).join("")}</select></div>
  <div class="f"><label for="s-ano">Ano</label><input id="s-ano" name="ano" type="number" min="1900" max="2100" inputmode="numeric"></div>
  <div class="f full"><label for="s-link">Link (DOI, Drive, site)</label><input id="s-link" name="link" type="url" placeholder="https://"></div>
  <div class="f full"><label for="s-res">Resumo</label><textarea id="s-res" name="resumo"></textarea></div>
  <div class="drop" data-drop>
    <div class="ic">${I.upload}</div>
    <p><b>Arraste o arquivo aqui</b> ou <u data-act="pick">escolha no computador</u></p>
    <p><small>PDF, imagem ou ZIP · até 3 arquivos · 25 MB cada</small></p>
    <input type="file" hidden multiple accept=".pdf,.doc,.docx,.odt,.zip,image/*">
    <ul class="files"></ul>
  </div>
  <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <div class="formfoot"><small>Os dados são usados apenas para contato sobre a curadoria do material.</small><button class="cta dark" type="submit">Enviar para curadoria</button></div>
</form>`;
    }

    renderAll() {
      this.renderStats();
      this.renderFeatured();
      this.renderFilterOptions();
      this.update(true);
    }

    renderStats() {
      this.$$("[data-count]").forEach((el) => {
        const target = this.stats[el.dataset.count] || 0;
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) { el.textContent = target; return; }
        const t0 = performance.now(), dur = 1400;
        const step = (t) => {
          const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.round(target * e).toLocaleString("pt-BR");
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    renderFeatured() {
      const feats = this.items.filter((i) => i.destaque).sort((a, b) => String(b.data || b.created).localeCompare(String(a.data || a.created))).slice(0, 9);
      const sec = this.$(".feat");
      if (!feats.length) { sec.hidden = true; return; }
      sec.hidden = false;
      this.$(".rail").innerHTML = feats.map((it) => {
        const img = this.thumb(it, 720, 900);
        return `<button class="fcard" data-open="${it.id}" style="--c:${it.cor}">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}
          <div class="in"><span class="tag" style="--c:#f2b705;background:#f2b705;color:#16283b">${esc(it.tipo.nome)}</span>
          <h3>${esc(it.titulo)}</h3><p>${esc(it.resumo)}</p></div></button>`;
      }).join("");
    }

    renderFilterOptions() {
      const years = [];
      for (let y = this.anoMax; y >= this.anoMin; y--) years.push(y);
      const opts = (lbl) => `<option value="">${lbl}</option>` + years.map((y) => `<option>${y}</option>`).join("");
      this.$("#de").innerHTML = opts("Desde");
      this.$("#ate").innerHTML = opts("Até");
      this.$("#de").value = this.state.de; this.$("#ate").value = this.state.ate; this.$("#ordem").value = this.state.ordem;
      this.$(".eixos").innerHTML = this.eixos.map((e) => `<div class="eixo" style="--c:${e.cor}"><h4>${esc(e.nome)}</h4><div class="chips">${e.temas.map((t) =>
        `<button class="chip" style="--c:${t.cor || e.cor}" data-act="tema" data-slug="${esc(t.slug)}" aria-pressed="${this.state.temas.has(t.slug)}">${esc(t.nome)}</button>`).join("")}</div></div>`).join("");
    }

    renderTabs(counts) {
      const tabsEl = this.$(".tabs");
      if (!tabsEl.querySelector(".tab")) {
        tabsEl.insertAdjacentHTML("beforeend", this.tabs.map((t) =>
          `<button class="tab" role="tab" data-act="tab" data-tab="${t.slug}" style="--c:${t.cor}" aria-selected="false"><span class="dot"></span>${esc(t.nome)}<span class="n">0</span></button>`).join(""));
      }
      this.$$(".tab").forEach((b) => {
        const n = counts[b.dataset.tab] || 0;
        b.querySelector(".n").textContent = n;
        b.classList.toggle("zero", n === 0 && b.dataset.tab !== this.state.tab);
        b.setAttribute("aria-selected", String(b.dataset.tab === this.state.tab));
      });
      this.movePill();
    }
    movePill() {
      const act = this.$(`.tab[aria-selected="true"]`), pill = this.$(".pill");
      if (!act || !pill) return;
      pill.style.left = act.offsetLeft + "px";
      pill.style.width = act.offsetWidth + "px";
      pill.style.setProperty("--c", getComputedStyle(act).getPropertyValue("--c"));
      const tabs = this.$(".tabs");
      const target = act.offsetLeft - tabs.clientWidth / 2 + act.offsetWidth / 2;
      tabs.scrollTo({ left: target, behavior: "smooth" });
    }

    update(resetPage) {
      if (!this.items) return;
      if (resetPage) this.state.shown = PAGE;
      const { counts, results } = this.compute();
      this.lastResults = results;
      this.renderTabs(counts);
      const s = this.state;
      this.$(".search").classList.toggle("has-q", !!s.q);
      this.$$('[data-act="tema"]').forEach((c) => c.setAttribute("aria-pressed", String(s.temas.has(c.dataset.slug))));
      const badge = this.$(".fbtn .badge");
      badge.hidden = !s.temas.size; badge.textContent = s.temas.size;
      const view = this.effectiveView();
      this.$$('[data-act="view"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === view)));
      this.$(".count").innerHTML = `<b>${results.length.toLocaleString("pt-BR")}</b> ${results.length === 1 ? "resultado" : "resultados"}`;

      const temaBySlug = new Map(this.temas.map((t) => [t.slug, t]));
      const active = [
        ...(s.q ? [`<button class="chip" style="--c:#16283b" aria-pressed="true" data-act="clear-q">“${esc(s.q)}” <span class="x">${I.x}</span></button>`] : []),
        ...[...s.temas].map((sl) => { const t = temaBySlug.get(sl); return t ? `<button class="chip" style="--c:${t.cor}" aria-pressed="true" data-act="tema" data-slug="${esc(sl)}">${esc(t.nome)} <span class="x">${I.x}</span></button>` : ""; }),
        ...(s.de || s.ate ? [`<button class="chip" style="--c:#3b4d61" aria-pressed="true" data-act="clear-anos">${s.de || "…"}–${s.ate || "…"} <span class="x">${I.x}</span></button>`] : []),
      ];
      this.$(".active-row").innerHTML = active.length ? active.join("") + `<button class="linkbtn" data-act="clear-all">Limpar tudo</button>` : "";
      this.renderResults(results, view);
      this.writeHash();
    }

    effectiveView() {
      if (this.state.viewTouched) return this.state.view;
      return ["tecnologias", "videos", "podcast", "publicacoes-otss"].includes(this.state.tab) ? "grid" : (this.state.tab === "tudo" && !this.state.q ? "grid" : "list");
    }

    renderResults(results, view) {
      const box = this.$(".results");
      const s = this.state;
      let head = "";
      if (s.tab === "podcast") head = this.showHTML();
      if (s.tab === "videos") head = this.ytHTML();
      if (!results.length) {
        box.innerHTML = head + `<div class="empty">${I.book}<h3>Nada encontrado</h3><p>Tente outras palavras, remova filtros ou explore outra aba.</p><p><button class="cta light" data-act="clear-all">Limpar busca e filtros</button></p></div>`;
        return;
      }
      const slice = results.slice(0, s.shown);
      box.innerHTML = head + `<div class="${view === "list" ? "list" : "grid"}">${slice.map((r, i) => this.cardHTML(r.it, i % PAGE)).join("")}</div>` +
        (results.length > s.shown ? `<div class="more"><button class="cta light" data-act="more">Mostrar mais ${Math.min(PAGE, results.length - s.shown)} de ${results.length - s.shown}</button></div>` : "");
      this.observeMore();
    }

    hl(text) {
      const q = norm(this.state.q).trim();
      const t = esc(text);
      if (!q) return t;
      const terms = q.split(/\s+/).filter((x) => x.length > 1);
      if (!terms.length) return t;
      const src = String(text ?? "");
      const nsrc = norm(src);
      const marks = [];
      terms.forEach((term) => { let p = 0; while ((p = nsrc.indexOf(term, p)) >= 0) { marks.push([p, p + term.length]); p += term.length; } });
      if (!marks.length) return t;
      marks.sort((a, b) => a[0] - b[0]);
      let out = "", last = 0;
      marks.forEach(([a, b]) => { if (a < last) return; out += esc(src.slice(last, a)) + "<mark>" + esc(src.slice(a, b)) + "</mark>"; last = b; });
      return out + esc(src.slice(last));
    }

    thumb(it, w, h) {
      if (it.kind === "video") {
        const id = youtubeId(it.url);
        if (it.capa) return wixImage(it.capa, w, h);
        return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
      }
      return it.capa ? wixImage(it.capa, w, h) : "";
    }

    cardHTML(it, i) {
      const temas = it.temas.slice(0, 3).map((t) => `<span class="tag" style="--c:${t.cor}">${esc(t.nome)}</span>`).join("");
      const acts = [];
      if (it.referencia) acts.push(`<button class="ibtn" data-act="copy-ref" data-id="${it.id}" title="Copiar referência" aria-label="Copiar referência">${I.copy}</button>`);
      if (it.arquivo) acts.push(`<a class="ibtn" href="${esc(it.arquivo)}" target="_blank" rel="noopener" title="Baixar arquivo" aria-label="Baixar arquivo">${I.pdf}</a>`);
      else if (it.link) acts.push(`<a class="ibtn" href="${esc(it.link)}" target="_blank" rel="noopener" title="Acessar" aria-label="Acessar">${I.ext}</a>`);
      const kick = `<div class="kicker">${esc(it.kind === "acervo" && it.formato && it.formato !== it.tipo.nome && it.tipo.slug !== "publicacoes-otss" ? it.formato : it.tipo.nome)}${it.ano ? ` <span class="yr">· ${it.ano}</span>` : ""}${it.duracao ? ` <span class="yr">· ${esc(it.duracao)}</span>` : ""}</div>`;
      let media = "";
      if (it.kind === "video" || it.kind === "podcast" || it.kind === "tecnologia" || (it.capa && it.kind === "acervo")) {
        const img = this.thumb(it, 640, it.kind === "acervo" ? 800 : 400);
        media = `<div class="media${it.kind === "acervo" ? " portrait" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}${it.kind === "video" ? `<span class="play"><i>${I.play}</i></span>` : ""}${it.kind === "podcast" ? `<span class="play"><i style="color:#1a9e4b">${I.play}</i></span>` : ""}${it.duracao && it.kind === "video" ? `<span class="dur">${esc(it.duracao)}</span>` : ""}</div>`;
      }
      const ods = it.ods && it.ods.length ? `<div class="ods">${it.ods.map((n) => `<span style="--o:${ODS_CORES[n]}" title="ODS ${n} · ${ODS_NOMES[n]}">${n}</span>`).join("")}</div>` : "";
      const sub = it.autores ? `<p class="authors">${this.hl(it.autores)}</p>` : "";
      const venue = it.veiculo ? `<p class="venue">${this.hl(it.veiculo)}</p>` : "";
      const excerpt = (it.kind !== "acervo" || it.tipo.slug === "publicacoes-otss") && it.resumo ? `<p class="excerpt">${this.hl(it.resumo.slice(0, 260))}</p>` : "";
      return `<article class="card" style="--c:${it.cor};--i:${i}" data-open="${it.id}" tabindex="0" role="button" aria-label="${esc(it.titulo)}">
        ${media}<div class="body">${kick}<div class="main"><h3>${this.hl(it.titulo)}</h3>${sub}${venue}${excerpt}</div>${ods}
        <div class="foot">${temas}<span class="acts">${acts.join("")}</span></div></div></article>`;
    }

    showHTML() {
      return `<div class="show reveal in"><div><div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <span class="eyebrow" style="color:#9fe3b5">Podcast</span><h3>Vozes do Território</h3>
        <p>Histórias, lutas e saberes de pescadores, educadoras e lideranças de comunidades tradicionais.</p>
        <a class="cta spot" href="https://open.spotify.com/show/${this.cfg.spotifyShow}" target="_blank" rel="noopener">Seguir no Spotify ${I.ext}</a></div>
        <iframe title="Vozes do Território no Spotify" loading="lazy" src="https://open.spotify.com/embed/show/${this.cfg.spotifyShow}?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`;
    }
    ytHTML() {
      return `<div class="show reveal in" style="background:linear-gradient(135deg,#3a1414,#16283b)"><div>
        <span class="eyebrow" style="color:#ffb3b3">YouTube</span><h3>OTSS Bocaina</h3>
        <p>Encontros, plenárias, formações e registros dos territórios. Inscreva-se para acompanhar novos vídeos.</p>
        <a class="cta yt" href="${this.cfg.youtube}?sub_confirmation=1" target="_blank" rel="noopener">Inscrever-se no canal ${I.ext}</a></div>
        <div style="color:#d6e4ef;font-size:14px">Os vídeos e playlists desta seção são gerenciados no CMS (coleção <b>Biblioteca · Vídeos e Podcast</b>): basta colar o link do YouTube.</div></div>`;
    }

    /* ----- detalhe ----- */
    openItem(it) {
      this.openId = it.id;
      this.lastFocus = this.root.activeElement;
      const d = this.$(".drawer");
      d.style.setProperty("--c", it.cor);
      d.innerHTML = `<div class="dhead"><div class="kicker" style="--c:${it.cor}">${esc(it.tipo.nome)}${it.ano ? ` <span class="yr">· ${it.ano}</span>` : ""}</div>
        <button class="ibtn" data-act="share" title="Copiar link" aria-label="Copiar link deste item">${I.link}</button>
        <button class="ibtn" data-act="close" aria-label="Fechar">${I.x}</button></div><div class="dbody">${this.detailHTML(it)}</div>`;
      this.$(".scrim").classList.add("on");
      requestAnimationFrame(() => { d.classList.add("on"); d.focus({ preventScroll: true }); });
      this.writeHash();
    }
    closeItem() {
      const d = this.$(".drawer");
      d.classList.remove("on");
      this.$(".scrim").classList.remove("on");
      setTimeout(() => { if (!d.classList.contains("on")) d.innerHTML = ""; }, 600);
      this.openId = "";
      this.writeHash();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
    }

    detailHTML(it) {
      const temas = it.temas.length ? `<div class="chips" style="margin:14px 0">${it.temas.map((t) => `<button class="chip" style="--c:${t.cor}" data-act="tema-go" data-slug="${esc(t.slug)}">${esc(t.nome)}</button>`).join("")}</div>` : "";
      const btn = [];
      if (it.arquivo) btn.push(`<a class="cta dark" href="${esc(it.arquivo)}" target="_blank" rel="noopener">${I.pdf} Baixar arquivo</a>`);
      if (it.link) btn.push(`<a class="cta ${it.arquivo ? "light" : "dark"}" href="${esc(it.link)}" target="_blank" rel="noopener">${I.ext} ${it.kind === "tecnologia" ? "Ver página completa" : "Acessar"}</a>`);

      if (it.kind === "video") {
        const vid = youtubeId(it.url), pl = playlistId(it.url);
        const src = pl ? `https://www.youtube-nocookie.com/embed/videoseries?list=${pl}` : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`;
        return `<div class="embed"><iframe src="${src}" title="${esc(it.titulo)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
          <h2>${esc(it.titulo)}</h2>${it.data ? `<p class="venue">${fmtData(it.data)}</p>` : ""}${temas}<p class="rich">${esc(it.resumo)}</p>
          <div class="btnrow"><a class="cta yt" href="${esc(it.url)}" target="_blank" rel="noopener">Ver no YouTube ${I.ext}</a></div>`;
      }
      if (it.kind === "podcast") {
        const ep = spotifyId(it.url);
        return `${ep ? `<iframe style="width:100%;height:232px;border:0;border-radius:14px;margin-bottom:20px" loading="lazy" src="https://open.spotify.com/embed/episode/${ep}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="${esc(it.titulo)}"></iframe>` : ""}
          <h2>${esc(it.titulo)}</h2><p class="venue">${esc(it.serie)}${it.data ? " · " + fmtData(it.data) : ""}${it.duracao ? " · " + esc(it.duracao) : ""}</p>${temas}
          <p class="rich">${esc(it.resumo)}</p><div class="btnrow"><a class="cta spot" href="${esc(it.url)}" target="_blank" rel="noopener">Ouvir no Spotify ${I.ext}</a></div>`;
      }
      if (it.kind === "tecnologia") {
        const img = wixImage(it.capa, 1200, 700);
        return `${img ? `<img class="hero-img" src="${esc(img)}" alt="">` : ""}<h2>${esc(it.titulo)}</h2>${temas}
          ${it.ods.length ? `<div class="block"><h4>Objetivos de Desenvolvimento Sustentável</h4><div class="ods">${it.ods.map((n) => `<span style="--o:${ODS_CORES[n]};width:auto;padding:0 8px" title="${ODS_NOMES[n]}">${n} · ${ODS_NOMES[n]}</span>`).join("")}</div></div>` : ""}
          <div class="block rich">${sanitizeHTML(it.resumoHTML)}</div>
          ${it.problema ? `<div class="block"><h4>Problema enfrentado</h4><p>${esc(it.problema)}</p></div>` : ""}
          ${it.solucao ? `<div class="block"><h4>Solução adotada</h4><p>${esc(it.solucao)}</p></div>` : ""}
          ${it.resultado ? `<div class="block"><h4>Resultados alcançados</h4><p>${esc(it.resultado)}</p></div>` : ""}
          ${it.fotos.length ? `<div class="gallery">${it.fotos.map((f) => `<img src="${esc(wixImage(f, 400, 400))}" alt="" loading="lazy">`).join("")}</div>` : ""}
          <div class="btnrow">${btn.join("")}</div>`;
      }
      const capa = it.capa ? wixImage(it.capa, 900) : "";
      const vid = youtubeId(it.video);
      const rows = [["Autoria", it.autores], ["Formato", it.formato && it.formato !== it.tipo.nome ? it.formato : ""], ["Publicado em", it.veiculo], ["Editora", it.editora], ["Local", it.cidade],
        ["Ano", it.ano], ["Projetos", (it.projetos || []).join(", ")], ["Palavras-chave", (it.palavras || []).join(", ")]].filter((r) => r[1]);
      return `${capa ? `<img class="hero-img" src="${esc(capa)}" alt="Capa de ${esc(it.titulo)}" style="max-width:320px">` : ""}
        <h2>${esc(it.titulo)}</h2>${temas}
        ${it.resumo ? `<p class="rich">${esc(it.resumo)}</p>` : ""}
        <dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        ${it.referencia ? `<div class="ref"><small>Como citar (ABNT)</small>${esc(it.referencia)}<div class="btnrow" style="margin:12px 0 0"><button class="cta light" data-act="copy-ref" data-id="${it.id}">${I.copy} Copiar referência</button></div></div>` : ""}
        ${vid ? `<div class="embed"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${vid}?rel=0" title="Vídeo relacionado" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ""}
        <div class="btnrow">${btn.join("")}</div>`;
    }

    /* ----- eventos ----- */
    bind() {
      const r = this.root;
      const input = this.$("#q");
      let t;
      input.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => { this.state.q = input.value.trim(); this.update(true); }, 140);
      });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.scrollToResults(); } });
      this._onKey = (e) => {
        const path = e.composedPath ? e.composedPath() : [];
        const typing = path.some((n) => n && (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable));
        if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); input.select(); }
        if (e.key === "Escape" && this.openId) this.closeItem();
      };
      document.addEventListener("keydown", this._onKey);
      this._onResize = () => this.movePill();
      addEventListener("resize", this._onResize);

      r.addEventListener("change", (e) => {
        const id = e.target.id;
        if (id === "de" || id === "ate" || id === "ordem") {
          this.state[id] = e.target.value;
          if (this.state.de && this.state.ate && +this.state.de > +this.state.ate) [this.state.de, this.state.ate] = [this.state.ate, this.state.de];
          this.$("#de").value = this.state.de; this.$("#ate").value = this.state.ate;
          this.update(true);
        }
      });

      r.addEventListener("click", (e) => {
        const actEl = e.target.closest("[data-act]");
        const act = actEl && actEl.dataset.act;
        if (act) {
          const s = this.state;
          switch (act) {
            case "tab": s.tab = actEl.dataset.tab; this.update(true); return;
            case "tema": s.temas.has(actEl.dataset.slug) ? s.temas.delete(actEl.dataset.slug) : s.temas.add(actEl.dataset.slug); this.update(true); return;
            case "tema-go": s.temas = new Set([actEl.dataset.slug]); this.closeItem(); this.update(true); this.scrollToResults(); return;
            case "clear-q": s.q = ""; this.$("#q").value = ""; this.update(true); return;
            case "clear-anos": s.de = s.ate = ""; this.$("#de").value = this.$("#ate").value = ""; this.update(true); return;
            case "clear-all": s.q = ""; s.temas.clear(); s.de = s.ate = ""; s.ordem = "relevancia"; this.$("#q").value = ""; this.renderFilterOptions(); this.update(true); return;
            case "toggle-filters": s.filtersOpen = !s.filtersOpen; this.$(".panel").classList.toggle("open", s.filtersOpen); actEl.setAttribute("aria-expanded", String(s.filtersOpen)); return;
            case "view": s.view = actEl.dataset.v; s.viewTouched = true; this.update(false); return;
            case "more": s.shown += PAGE; this.renderResults(this.lastResults, this.effectiveView()); return;
            case "rail": { const rail = this.$(".rail"); rail.scrollBy({ left: +actEl.dataset.dir * rail.clientWidth * 0.9, behavior: "smooth" }); return; }
            case "close": this.closeItem(); return;
            case "copy-ref": { e.stopPropagation(); const it = this.byId.get(actEl.dataset.id); if (it) this.copy(it.referencia, "Referência copiada"); return; }
            case "share": { const u = location.href.split("#")[0] + "#item=" + this.openId; this.copy(u, "Link copiado"); return; }
            case "retry": this.load(); return;
            case "pick": this.$('.drop input[type="file"]').click(); return;
            case "rm-file": this.removeFile(+actEl.dataset.i); return;
          }
        }
        if (e.target.closest("a")) return;
        const open = e.target.closest("[data-open]");
        if (open) { const it = this.byId.get(open.dataset.open); if (it) this.openItem(it); }
      });
      r.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("article[data-open]")) { e.preventDefault(); e.target.click(); }
      });
      this.bindForm();
    }

    disconnectedCallback() {
      document.removeEventListener("keydown", this._onKey);
      removeEventListener("resize", this._onResize);
      this._io && this._io.disconnect();
      this._ioMore && this._ioMore.disconnect();
    }

    scrollToResults() {
      const nav = this.$(".nav");
      const y = nav.getBoundingClientRect().top + scrollY - (parseInt(this.getAttribute("sticky-offset"), 10) || 0);
      scrollTo({ top: y, behavior: "smooth" });
    }

    copy(text, msg) {
      const done = () => this.toast(msg);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
      else this.fallbackCopy(text, done);
    }
    fallbackCopy(text, done) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch { this.toast("Não foi possível copiar"); }
      ta.remove();
    }
    toast(msg) {
      const t = this.$(".toast");
      t.textContent = msg; t.classList.add("on");
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove("on"), 2200);
    }

    observeReveal() {
      if (!("IntersectionObserver" in window)) { this.$$(".reveal").forEach((e) => e.classList.add("in")); return; }
      this._io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); this._io.unobserve(en.target); } }), { threshold: 0.12 });
      this.$$(".reveal").forEach((e) => this._io.observe(e));
    }
    observeMore() {
      this._ioMore && this._ioMore.disconnect();
      const btn = this.$('[data-act="more"]');
      if (!btn || !("IntersectionObserver" in window)) return;
      this._ioMore = new IntersectionObserver((ents) => { if (ents[0].isIntersecting) btn.click(); }, { rootMargin: "400px" });
      this._ioMore.observe(btn);
    }

    /* ----- formulário de submissão (Wix Forms + upload) ----- */
    bindForm() {
      this.files = [];
      const form = this.$("form"), drop = this.$("[data-drop]"), fi = drop.querySelector('input[type="file"]');
      fi.addEventListener("change", () => { this.addFiles(fi.files); fi.value = ""; });
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => this.addFiles(e.dataTransfer.files));
      form.addEventListener("submit", (e) => { e.preventDefault(); this.submitForm(form); });
    }
    addFiles(list) {
      for (const f of list) {
        if (this.files.length >= 3) { this.toast("Máximo de 3 arquivos"); break; }
        if (f.size > 25 * 1024 * 1024) { this.toast(`${f.name}: maior que 25 MB`); continue; }
        this.files.push({ file: f, progress: 0, state: "pronto" });
      }
      this.renderFiles();
    }
    removeFile(i) { this.files.splice(i, 1); this.renderFiles(); }
    renderFiles() {
      this.$(".files").innerHTML = this.files.map((f, i) => `<li class="${f.state === "enviado" ? "done" : ""}"><span>${esc(f.file.name)} <small style="color:var(--ink-3)">· ${(f.file.size / 1048576).toFixed(1)} MB · ${f.state}</small></span>
        ${f.state === "pronto" ? `<button type="button" class="ibtn" data-act="rm-file" data-i="${i}" aria-label="Remover ${esc(f.file.name)}">${I.x}</button>` : "<span></span>"}
        <span class="bar"><i style="width:${f.progress}%"></i></span></li>`).join("");
    }
    uploadOne(entry) {
      return new Promise(async (resolve, reject) => {
        try {
          const f = entry.file, mime = f.type || "application/octet-stream";
          const { uploadUrl } = await this.client.call("/form-submission-service/v4/submissions/media-upload-url", { formId: this.cfg.formId, filename: f.name, mimeType: mime });
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl + (uploadUrl.includes("?") ? "&" : "?") + "filename=" + encodeURIComponent(f.name));
          xhr.setRequestHeader("Content-Type", mime);
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) { entry.progress = Math.round((e.loaded / e.total) * 100); this.renderFiles(); } };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const file = JSON.parse(xhr.responseText).file;
              entry.progress = 100; entry.state = "enviado"; this.renderFiles();
              resolve({ fileId: file.id, displayName: file.displayName, url: file.url, fileType: file.mediaType || "DOCUMENT" });
            } else reject(new Error("upload " + xhr.status));
          };
          xhr.onerror = () => reject(new Error("upload falhou"));
          entry.state = "enviando"; this.renderFiles();
          xhr.send(f);
        } catch (e) { reject(e); }
      });
    }
    async submitForm(form) {
      const fd = new FormData(form);
      if (fd.get("website")) return;
      const req = ["first_name", "email", "titulo_publicacao"];
      for (const k of req) {
        const el = form.elements[k];
        if (!String(fd.get(k) || "").trim() || (k === "email" && !el.checkValidity())) { el.focus(); this.toast("Preencha nome, e-mail válido e título"); return; }
      }
      if (!this.files.length && !String(fd.get("link") || "").trim()) { this.toast("Anexe um arquivo ou informe um link"); return; }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = "Enviando…";
      try {
        const arquivos = [];
        for (const f of this.files) {
          if (!f.result) f.result = await this.uploadOne(f);
          arquivos.push(f.result);
        }
        const sub = {};
        ["first_name", "email", "company", "titulo_publicacao", "autoria", "tipo", "link", "resumo"].forEach((k) => { const v = String(fd.get(k) || "").trim(); if (v) sub[k] = v; });
        if (sub.link && !/^https?:\/\//i.test(sub.link)) sub.link = "https://" + sub.link;
        const ano = parseInt(fd.get("ano"), 10); if (ano) sub.ano = ano;
        if (arquivos.length) sub.arquivo = arquivos;
        await this.client.call("/form-submission-service/v4/submissions", { submission: { formId: this.cfg.formId, submissions: sub } });
        form.innerHTML = `<div class="ok"><svg class="check" viewBox="0 0 72 72" fill="none" stroke-width="4" stroke-linecap="round"><circle cx="36" cy="36" r="30"/><path d="M23 37l9 9 17-19"/></svg>
          <h3 style="font-family:var(--f-display);font-size:26px;margin:0 0 6px">Recebemos sua publicação!</h3><p style="color:var(--ink-2);margin:0">A equipe do OTSS fará a curadoria e entrará em contato pelo e-mail informado.</p></div>`;
      } catch (e) {
        console.error("[otss-biblioteca] envio", e);
        this.toast("Não foi possível enviar. Tente novamente.");
        btn.disabled = false; btn.textContent = "Enviar para curadoria";
        this.files.forEach((f) => { if (f.state !== "enviado") { f.state = "pronto"; f.progress = 0; } });
        this.renderFiles();
      }
    }
  }

  if (!customElements.get("otss-biblioteca")) customElements.define("otss-biblioteca", OtssBiblioteca);
})();

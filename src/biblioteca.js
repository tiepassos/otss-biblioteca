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
  const PAGE = 30;
  const TOKEN_KEY = "otss-biblioteca-token";
  // índice de texto completo gerado por scripts/indexar.mjs, publicado ao lado deste arquivo
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "https://tiepassos.github.io/otss-biblioteca/src/biblioteca.js";
  const INDEX_URL = new URL("../index/textos.json", SCRIPT_SRC).href;

  const SECOES = [
    { slug: "academico", nome: "Produção acadêmica", curto: "Acadêmico", cor: "#123d7a", desc: "Artigos, livros, capítulos, teses, dissertações e trabalhos em eventos de pesquisadoras e pesquisadores do OTSS e parceiros." },
    { slug: "publicacoes", nome: "Publicações OTSS", curto: "Publicações", cor: "#0f766e", desc: "Cartilhas, atlas, guias e livros produzidos com as comunidades tradicionais da Bocaina." },
    { slug: "tecnologias", nome: "Tecnologias Sociais", curto: "Tecnologias", cor: "#4d7c0f", desc: "Soluções construídas nos territórios: o problema enfrentado, a solução adotada e os resultados alcançados." },
    { slug: "multimidia", nome: "Vídeos e Podcast", curto: "Multimídia", cor: "#be123c", desc: "Encontros, formações e histórias do território no YouTube OTSS Bocaina e no podcast Vozes do Território." },
  ];
  const SUGESTOES = ["Pesca artesanal", "Educação diferenciada", "Cartografia social", "Quilombo", "Guarani", "Turismo de base comunitária", "Saneamento ecológico", "Caiçara"];

  const ODS_CORES = { 1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21", 6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367", 11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B", 16: "#00689D", 17: "#19486A" };
  const ODS_NOMES = { 1: "Erradicação da pobreza", 2: "Fome zero", 3: "Saúde e bem-estar", 4: "Educação de qualidade", 5: "Igualdade de gênero", 6: "Água potável e saneamento", 7: "Energia limpa", 8: "Trabalho decente", 9: "Indústria e inovação", 10: "Redução das desigualdades", 11: "Cidades sustentáveis", 12: "Consumo responsável", 13: "Ação climática", 14: "Vida na água", 15: "Vida terrestre", 16: "Paz e justiça", 17: "Parcerias" };

  /* ---------- utilidades ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
  const safeStore = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  /* autoria: "NOBRE, D. B.; GALLO, Edmundo" → chaves normalizadas sobrenome|inicial */
  function parseAutores(str) {
    return String(str || "").replace(/\bet al\.?/gi, "").split(/;|\s&\s|\be\s(?=[A-ZÀ-Ú]{2,},)/).map((raw) => {
      const s = raw.replace(/\(org[s]?\.?\)/gi, "").replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
      if (s.length < 2) return null;
      let sobrenome, nomes;
      if (s.includes(",")) { [sobrenome, nomes] = [s.slice(0, s.indexOf(",")), s.slice(s.indexOf(",") + 1)]; }
      else { const p = s.split(" "); sobrenome = p.pop(); nomes = p.join(" "); }
      sobrenome = sobrenome.trim(); nomes = nomes.trim();
      if (!sobrenome || /^\d/.test(sobrenome)) return null;
      const ini = norm(nomes).replace(/[^a-z]/g, "").charAt(0);
      const key = norm(sobrenome).replace(/[^a-z ]/g, "").trim() + "|" + ini;
      const iniciais = nomes.split(/[\s.]+/).filter(Boolean).map((n) => (/^(de|da|do|dos|das)$/i.test(n) ? "" : n.charAt(0).toUpperCase() + ".")).join(" ").replace(/\s+/g, " ").trim();
      const display = `${sobrenome.toUpperCase()}${iniciais ? ", " + iniciais : ""}`;
      return { key, display, sobrenome: sobrenome.toUpperCase() };
    }).filter(Boolean);
  }

  /* ---------- cliente Wix (token anônimo) ---------- */
  class WixClient {
    constructor(clientId) { this.clientId = clientId; this.tok = null; }
    async token() {
      const now = Date.now();
      if (this.tok && this.tok.exp > now) return this.tok.access;
      const saved = safeStore.get(TOKEN_KEY);
      if (saved && saved.clientId === this.clientId && saved.exp > now + 60000) { this.tok = saved; return saved.access; }
      const post = (body) => fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      let r = saved && saved.refresh && saved.clientId === this.clientId
        ? await post({ clientId: this.clientId, grantType: "refresh_token", refreshToken: saved.refresh })
        : null;
      if (!r || !r.ok) r = await post({ clientId: this.clientId, grantType: "anonymous" });
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
  --ink:#16283b; --ink-2:#3b4d61; --ink-3:#66778a;
  --paper:#fbf7ec; --paper-2:#f3ecd8; --card:#fffdf7; --line:#e4dcc6; --line-2:#d6cbad;
  --azul:#276cb2; --azul-escuro:#123d7a; --noite:#0f2238; --ceu:#e0f0f8; --sol:#f2b705;
  --radius:18px; --radius-s:10px;
  --shadow:0 1px 2px rgba(22,40,59,.06),0 8px 24px -12px rgba(22,40,59,.18);
  --shadow-up:0 2px 4px rgba(22,40,59,.08),0 22px 44px -18px rgba(22,40,59,.35);
  --ease:cubic-bezier(.2,.8,.2,1); --ease-out:cubic-bezier(.16,1,.3,1);
  --f-hero:var(--f-hero-custom,"OTSS Museo 900"),"OTSS Museo 900","Museo 900","Museo-900","Museo900","MuseoW01-900","museo-w01-900","Museo","Bitter",Georgia,serif;
  --f-display:"wfont_6eb6fc_e1f17bbabfd94baa82e75763b86d52ec","wf_e1f17bbabfd94baa82e75763b","orig_museo_700_regular","Museo","Bitter",Georgia,serif;
  --f-body:"wfont_6f9e71_807cc1ad0a5347b68f3464a7d59f4bbb","wf_807cc1ad0a5347b68f3464a7d","orig_museo_500","Museo Sans","Nunito Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --sticky-top:0px;
  display:block;color:var(--ink);background:var(--paper);font-family:var(--f-body);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;position:relative;container-type:inline-size;
}
*,*::before,*::after{box-sizing:border-box}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
a{color:inherit}
:focus-visible{outline:3px solid var(--sol);outline-offset:2px;border-radius:6px}
.wrap{max-width:1240px;margin:0 auto;padding-left:clamp(16px,4vw,40px);padding-right:clamp(16px,4vw,40px)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.disp{font-family:var(--f-display);letter-spacing:-.015em}

/* ===== HERO ===== */
.hero{position:relative;color:#fff;background:radial-gradient(120% 140% at 85% 0%,#276cb2 0%,#123d7a 45%,#0f2238 100%);padding:clamp(56px,9vw,120px) 0 clamp(28px,4vw,48px);z-index:5}
.hero .bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.hero-in{position:relative;z-index:2}
/* botânicos das ilustrações do OTSS: uma parte visível, o resto vazando da página */
.flora .bot{position:absolute;display:block;width:var(--w);transform:rotate(var(--r));transform-origin:var(--o);z-index:1}
.flora .bot img{display:block;width:100%;height:auto;transform-origin:var(--o);filter:drop-shadow(0 18px 30px rgba(5,15,30,.45));opacity:0;animation:botIn 1.8s var(--ease-out) var(--d) forwards,sway var(--t) ease-in-out calc(var(--d) + 1.8s) infinite alternate}
@keyframes botIn{from{opacity:0;transform:translate(var(--fx),var(--fy)) rotate(var(--s1))}to{opacity:var(--op,1);transform:rotate(var(--s1))}}
@keyframes sway{0%{opacity:var(--op,1);transform:rotate(var(--s1)) translateY(0)}50%{opacity:var(--op,1);transform:rotate(calc((var(--s1) + var(--s2)) / 2)) translateY(-6px)}100%{opacity:var(--op,1);transform:rotate(var(--s2)) translateY(0)}}
@container (max-width:1500px){.flora .bot.l{--op:.7}}
@container (max-width:1280px){.flora .bot{width:calc(var(--w) * .78)}.flora .bot.l{--op:.5}}
@container (max-width:900px){.flora .bot{width:calc(var(--w) * .6);--op:.5}.flora .bot.m{display:none}}
@container (max-width:600px){.flora .bot.l{display:none}.flora .bot{--op:.35}}
@media (prefers-reduced-motion:reduce){.flora .bot img{animation:none;opacity:var(--op,1);transform:none}}
.hero svg.topo{position:absolute;right:-6%;top:-12%;width:min(1000px,125%);height:auto;opacity:.22}
.topo path{fill:none;stroke:#cfe6f5;stroke-width:1.1;stroke-dasharray:6 10;animation:drift 38s linear infinite}
.topo path:nth-child(2n){animation-duration:52s;animation-direction:reverse;opacity:.7}
@keyframes drift{to{stroke-dashoffset:-640}}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#bfe0f3}
.eyebrow::before{content:"";width:28px;height:2px;background:var(--sol);border-radius:2px}
.hero h1{font-family:var(--f-hero);font-weight:900;font-synthesis:none;font-size:clamp(40px,7vw,86px);line-height:.98;letter-spacing:-.02em;margin:18px 0 16px;max-width:15ch}
.hero h1 em{font-style:normal;color:var(--sol)}
.lead{font-size:clamp(16px,1.6vw,19px);max-width:60ch;color:#dbeaf5;margin:0 0 30px}
.hero-in>*{animation:heroIn .9s var(--ease-out) both}
.hero-in>*:nth-child(2){animation-delay:.08s}.hero-in>*:nth-child(3){animation-delay:.16s}.hero-in>*:nth-child(4){animation-delay:.24s}.hero-in>*:nth-child(5){animation-delay:.32s}.hero-in>*:nth-child(6){animation-delay:.4s}
@keyframes heroIn{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}

/* busca (hero e compacta) */
.sbox{position:relative;max-width:820px}
.sfield{position:relative;display:flex;align-items:center;background:#fff;border-radius:999px;box-shadow:0 18px 50px -20px rgba(0,0,0,.55);border:2px solid transparent;transition:border-color .25s var(--ease),box-shadow .25s var(--ease),border-radius .2s}
.sfield:focus-within{border-color:var(--sol);box-shadow:0 0 0 6px rgba(242,183,5,.22),0 18px 50px -20px rgba(0,0,0,.55)}
.sbox.open .sfield{border-radius:30px 30px 0 0}
.sfield .ico{flex:none;width:24px;height:24px;margin-left:24px;color:var(--azul)}
.sfield input{flex:1;min-width:0;height:68px;border:0;background:transparent;color:var(--ink);padding:0 14px;font-size:18px}
.sfield input:focus{outline:none}
.sfield input::-webkit-search-cancel-button,.sfield input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none}
.hero-in>.sbox{z-index:30}
.hero:has(.sbox.open){z-index:50}
.nav:has(.sbox.open){z-index:55}
.sfield input::placeholder{color:#8a96a3}
.sfield .right{display:flex;align-items:center;gap:8px;padding-right:12px}
.kbd{font:700 12px/1 var(--f-body);color:var(--ink-3);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:4px 7px;background:var(--paper)}
.sclear{display:none;width:34px;height:34px;border-radius:50%;background:var(--paper-2);color:var(--ink-2);place-items:center}
.sbox.has-q .sclear{display:grid}
.sbox.has-q .kbd{display:none}
.sgo{height:48px;padding:0 22px;border-radius:999px;background:var(--azul-escuro);color:#fff;font-weight:700;transition:background .2s,transform .2s var(--ease)}
.sgo:hover{background:var(--azul);transform:translateY(-1px)}
.scope{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px;font-size:14px;color:#bfd6e8}
.scope button{height:32px;padding:0 14px;border-radius:999px;border:1.5px solid rgba(255,255,255,.28);color:#e7f1f8;font-weight:600;font-size:13px;transition:background .2s,color .2s,border-color .2s}
.scope button[aria-pressed="true"]{background:#fff;color:var(--ink);border-color:#fff}
.sugg{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center;font-size:13px;color:#a9cbe2}
.sugg button{padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-size:13px;font-weight:600;transition:background .2s,transform .2s var(--ease)}
.sugg button:hover{background:rgba(255,255,255,.2);transform:translateY(-1px)}

/* autocompletar */
.ac{position:absolute;left:0;right:0;top:100%;background:#fff;color:var(--ink);border-radius:0 0 22px 22px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);overflow:hidden;z-index:60;display:none;border:2px solid var(--sol);border-top:1px solid var(--line)}
.sbox.open .ac{display:block;animation:acIn .25s var(--ease-out)}
@keyframes acIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.ac h5{margin:0;padding:12px 22px 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ac .opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:9px 22px;font-size:15px;line-height:1.3}
.ac .opt .d{flex:none;width:10px;height:10px;border-radius:50%;background:var(--c)}
.ac .opt .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ac .opt small{flex:none;color:var(--ink-3);font-size:12px}
.ac .opt[aria-selected="true"],.ac .opt:hover{background:var(--ceu)}
.sbox.open .ac{max-height:min(460px,62vh);overflow-y:auto}
.ac .all{border-top:1px solid var(--line);font-weight:700;color:var(--azul-escuro);padding:14px 22px}
.ac .none{padding:16px 22px;color:var(--ink-3)}
.hit{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:var(--ink-2);background:#fff8dc;border-left:3px solid var(--sol);border-radius:0 8px 8px 0;padding:7px 10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hit span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8a6a00;margin-right:6px}
.hits{display:grid;gap:8px}
.hits a,.hits div{display:block;text-decoration:none;font-size:14px;line-height:1.55;color:var(--ink-2);background:#fff8dc;border-left:3px solid var(--sol);border-radius:0 10px 10px 0;padding:10px 12px}
.hits b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a00;margin-bottom:2px}
.fttag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#2f6b3a;background:#e8f4ea;border-radius:999px;padding:4px 10px;margin:4px 0 8px}
.ftnote{font-size:13px;color:var(--ink-3);margin:8px 0 0}

/* entradas de seção no hero */
.entries{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:clamp(28px,4vw,44px)}
@container (max-width:860px){.entries{grid-template-columns:repeat(2,minmax(0,1fr))}}
.entry{position:relative;text-align:left;padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:#fff;overflow:hidden;transition:background .3s,transform .35s var(--ease-out),border-color .3s}
.entry::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c2)}
.entry:hover{background:rgba(255,255,255,.14);transform:translateY(-3px);border-color:rgba(255,255,255,.3)}
.entry b{display:block;font-family:var(--f-display);font-size:clamp(28px,3.4vw,40px);line-height:1;font-variant-numeric:tabular-nums}
.entry span{display:block;font-size:13px;color:#cfe2ef;margin-top:6px;font-weight:600}
.entry i{position:absolute;right:14px;top:14px;opacity:.5;transition:transform .3s var(--ease),opacity .3s}
.entry:hover i{transform:translateX(3px);opacity:1}

/* ===== NAV fixa ===== */
.nav{position:sticky;top:var(--sticky-top);z-index:40;background:rgba(251,247,236,.92);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;gap:12px}
.tabs{position:relative;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:10px 0;flex:1;min-width:0}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 16px;border-radius:999px;font-weight:700;font-size:15px;color:var(--ink-2);white-space:nowrap;transition:color .25s var(--ease)}
.tab .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}
.tab .n{font-size:12px;font-weight:800;min-width:24px;height:20px;padding:0 6px;border-radius:999px;background:rgba(22,40,59,.07);display:inline-grid;place-items:center;font-variant-numeric:tabular-nums}
.tab[aria-selected="true"]{color:#fff}
.tab[aria-selected="true"] .n{background:rgba(255,255,255,.22)}
.tab[aria-selected="true"] .dot{background:#fff}
.pill{position:absolute;z-index:0;top:10px;height:42px;border-radius:999px;background:var(--c,var(--ink));transition:left .45s var(--ease-out),width .45s var(--ease-out),background-color .45s var(--ease)}
.mini{flex:none;width:min(320px,34vw);transition:width .35s var(--ease-out)}
.mini .sfield{box-shadow:none;border:1.5px solid var(--line);background:var(--card)}
.mini .sfield:focus-within{box-shadow:0 0 0 4px rgba(39,108,178,.15);border-color:var(--azul)}
.mini .sfield .ico{width:18px;height:18px;margin-left:14px}
.mini .sfield input{height:42px;font-size:15px;padding:0 10px}
.mini.open .sfield{border-radius:22px 22px 0 0}
.mini .ac{border-width:1.5px;border-color:var(--azul);border-radius:0 0 18px 18px;left:auto;width:min(520px,92vw)}
.mini .kbd{display:none}
.mini .sclear{width:28px;height:28px}
@container (max-width:760px){.mini{width:44px}.mini .sfield input,.mini .right{display:none}.mini .sfield .ico{margin:0 auto}.mini .sfield{height:44px;cursor:pointer}}
.mini.expand{width:min(100%,420px)}
.mini.expand .sfield input,.mini.expand .right{display:flex}
.mini.expand .sfield .ico{margin-left:14px}

/* ===== VIEW ===== */
.view{min-height:60vh}
.view.enter>*{animation:fadeUp .6s var(--ease-out) both}
.view.enter>*:nth-child(2){animation-delay:.06s}.view.enter>*:nth-child(3){animation-delay:.12s}.view.enter>*:nth-child(4){animation-delay:.18s}.view.enter>*:nth-child(5){animation-delay:.24s}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
section.block{padding:clamp(36px,5vw,64px) 0 8px}
.sec-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.sec-head h2{font-family:var(--f-display);font-size:clamp(26px,3.2vw,38px);line-height:1.05;margin:0;letter-spacing:-.01em}
.sec-head p{margin:6px 0 0;color:var(--ink-3);max-width:60ch}
.more-link{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:var(--c,var(--azul-escuro));padding:8px 0;border-bottom:2px solid currentColor;transition:gap .25s var(--ease)}
.more-link:hover{gap:12px}
.round{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;background:var(--card);transition:transform .2s var(--ease),background .2s}
.round:hover{transform:translateY(-2px);background:#fff}
.rail-ctrl{display:flex;gap:8px}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(270px,1fr);gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 2px 24px;scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
@container (min-width:900px){.rail{grid-auto-columns:calc((100% - 60px)/4)}}
.fcard{scroll-snap-align:start;position:relative;border-radius:var(--radius);overflow:hidden;min-height:380px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;background:var(--noite);text-align:left;box-shadow:var(--shadow);isolation:isolate;transition:transform .45s var(--ease-out),box-shadow .45s var(--ease-out)}
.fcard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform 1.2s var(--ease-out)}
.fcard::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(15,34,56,0) 30%,rgba(15,34,56,.94) 80%)}
.fcard:hover{transform:translateY(-6px);box-shadow:var(--shadow-up)}
.fcard:hover img{transform:scale(1.06)}
.fcard .in{padding:22px}
.fcard h3{font-family:var(--f-display);font-size:20px;line-height:1.15;margin:10px 0 0}

/* home: grade de seções */
.home-sec{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
@container (max-width:900px){.home-sec{grid-template-columns:1fr}}
.panel-card{background:var(--card);border:1px solid var(--line);border-radius:calc(var(--radius) + 4px);padding:clamp(20px,3vw,28px);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden}
.panel-card::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:var(--c)}
.panel-card h3{font-family:var(--f-display);font-size:24px;margin:0;line-height:1.1}
.panel-card .psub{margin:0;color:var(--ink-3);font-size:14px}
.panel-card.wide{grid-column:1/-1}

/* ===== CABEÇALHO DE SEÇÃO ===== */
.sh{position:relative;padding:clamp(32px,5vw,56px) 0 clamp(20px,3vw,28px);border-bottom:1px solid var(--line);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 7%,var(--paper)),var(--paper))}
.sh .crumb{font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--c);display:flex;align-items:center;gap:10px}
.sh .crumb::before{content:"";width:22px;height:4px;border-radius:2px;background:var(--c)}
.sh h2{font-family:var(--f-display);font-size:clamp(34px,5vw,60px);line-height:1;margin:12px 0 12px;letter-spacing:-.02em}
.sh p.d{margin:0;color:var(--ink-2);max-width:62ch;font-size:clamp(15px,1.4vw,17px)}
.facts{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:18px;font-size:14px;color:var(--ink-3)}
.facts b{font-family:var(--f-display);font-size:24px;color:var(--ink);margin-right:6px;font-variant-numeric:tabular-nums}
.dash{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px;margin-top:26px}
@container (max-width:900px){.dash{grid-template-columns:1fr}}
.dcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow)}
.dcard h4{margin:0 0 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);display:flex;justify-content:space-between;align-items:center;gap:10px}
.dcard h4 button{font-size:12px;letter-spacing:0;text-transform:none;text-decoration:underline;text-underline-offset:3px;color:var(--ink-2);font-weight:700}
.hist{display:flex;align-items:flex-end;gap:3px;height:120px;padding-top:6px}
.hist button{position:relative;flex:1;min-width:4px;height:100%;display:flex;align-items:flex-end;border-radius:4px}
.hist button i{display:block;width:100%;border-radius:4px 4px 2px 2px;background:color-mix(in srgb,var(--c) 55%,#fff);height:var(--h);min-height:2px;transform-origin:bottom;animation:grow .8s var(--ease-out) both;animation-delay:calc(var(--k) * 12ms);transition:background .2s}
@keyframes grow{from{transform:scaleY(0)}to{transform:none}}
.hist button:hover i,.hist button.on i{background:var(--c)}
.hist button.off i{background:color-mix(in srgb,var(--c) 18%,#fff)}
.hist button .tip{position:absolute;bottom:calc(var(--h) + 8px);left:50%;translate:-50% 0;background:var(--ink);color:#fff;font-size:12px;font-weight:700;padding:4px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;z-index:3}
.hist button:hover .tip,.hist button:focus-visible .tip{opacity:1}
.hist-ax{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3);margin-top:6px;font-variant-numeric:tabular-nums}
.authors-cloud{display:flex;flex-wrap:wrap;gap:6px;max-height:142px;overflow:hidden;transition:max-height .5s var(--ease-out)}
.authors-cloud.all{max-height:2000px}
.au{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:3px 10px;border-radius:999px;border:1.5px solid var(--line);background:#fff;font-size:12.5px;font-weight:700;color:var(--ink-2);transition:border-color .2s,background .2s,color .2s}
.au small{color:var(--ink-3);font-weight:800}
.au:hover{border-color:var(--c)}
.au[aria-pressed="true"]{background:var(--c);border-color:var(--c);color:#fff}
.au[aria-pressed="true"] small{color:#fff}

/* subabas */
.subtabs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:20px 0 4px}
.subtabs::-webkit-scrollbar{display:none}
.sub{flex:none;display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);font-weight:700;font-size:14px;color:var(--ink-2);transition:all .25s var(--ease)}
.sub .sw{width:10px;height:10px;border-radius:3px;background:var(--c)}
.sub .n{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.sub:hover{border-color:var(--c)}
.sub[aria-pressed="true"]{background:var(--c);color:#fff;border-color:var(--c)}
.sub[aria-pressed="true"] .sw{background:#fff}
.sub[aria-pressed="true"] .n{color:rgba(255,255,255,.8)}
.sub.zero{opacity:.45}

/* barra de ferramentas */
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:16px 0 6px}
.fbtn,.sel{height:40px;border-radius:999px;border:1.5px solid var(--line);background:var(--card);padding:0 16px;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;transition:border-color .2s,background .2s}
.fbtn:hover,.sel:hover{border-color:var(--line-2)}
.fbtn[aria-expanded="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.fbtn .badge{background:var(--sol);color:var(--ink);border-radius:999px;font-size:11px;padding:1px 7px}
.sel{appearance:none;-webkit-appearance:none;padding-right:34px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2316283b' stroke-width='1.8' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.spacer{flex:1}
[hidden]{display:none!important}
@container (max-width:620px){.toolbar{gap:8px}.toolbar .sel,.toolbar .fbtn{height:36px;font-size:13px;padding-left:12px}.toolbar .sel{padding-right:28px;background-position:right 10px center}.toolbar .spacer{display:none}.toolbar .count{order:9;width:100%}}
.count{font-size:14px;color:var(--ink-3)}
.count b{color:var(--ink);font-variant-numeric:tabular-nums}
.seg{display:inline-flex;border:1.5px solid var(--line);border-radius:999px;padding:3px;background:var(--card);position:relative}
.seg button{position:relative;z-index:1;height:32px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:7px;color:var(--ink-3);font-size:13px;font-weight:700;transition:color .25s}
.seg button[aria-pressed="true"]{color:#fff}
.seg .knob{position:absolute;z-index:0;top:3px;height:32px;border-radius:999px;background:var(--ink);transition:left .35s var(--ease-out),width .35s var(--ease-out)}
@container (max-width:620px){.seg button span{display:none}}
.fpanel{overflow:hidden;display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s var(--ease-out)}
.fpanel.open{grid-template-rows:1fr}
.fpanel>div{min-height:0}
.eixos{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));padding:14px 0 18px}
.eixo h4{margin:0 0 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--c);display:flex;align-items:center;gap:8px}
.eixo h4::before{content:"";width:14px;height:14px;border-radius:4px;background:var(--c)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:700;background:color-mix(in srgb,var(--c,#888) 10%,#fff);color:color-mix(in srgb,var(--c,#888) 75%,#000);border:1.5px solid color-mix(in srgb,var(--c,#888) 25%,transparent);transition:background .2s,color .2s,transform .2s var(--ease)}
.chip:hover{transform:translateY(-1px)}
.chip[aria-pressed="true"]{background:var(--c);color:#fff;border-color:var(--c)}
.active-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0 6px;min-height:8px}
.linkbtn{font-size:13px;font-weight:800;text-decoration:underline;text-underline-offset:3px;color:var(--ink-2)}

/* ===== RESULTADOS ===== */
.results{padding:14px 0 48px}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))}
.card{position:relative;display:flex;flex-direction:column;text-align:left;background:var(--card);border-radius:var(--radius);border:1px solid var(--line);overflow:hidden;box-shadow:var(--shadow);transition:transform .4s var(--ease-out),box-shadow .4s var(--ease-out),border-color .3s;animation:rise .6s var(--ease-out) both;animation-delay:calc(var(--i,0) * 30ms);cursor:pointer}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--c);z-index:1;transition:width .35s var(--ease-out)}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-up);border-color:color-mix(in srgb,var(--c) 40%,var(--line))}
.card:hover::before{width:10px}
@keyframes rise{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}
.card .body{padding:18px 20px 16px 26px;display:flex;flex-direction:column;gap:9px;flex:1}
.kicker{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}
.kicker .yr{color:var(--ink-3);letter-spacing:0}
.card h3{font-family:var(--f-display);font-size:19px;line-height:1.22;margin:0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.authors{font-size:14px;color:var(--ink-2);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.venue{font-size:13px;color:var(--ink-3);margin:0;font-style:italic}
.excerpt{font-size:14px;color:var(--ink-2);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:auto;padding-top:4px}
.tag{font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--c) 12%,#fff);color:color-mix(in srgb,var(--c) 80%,#000)}
.acts{margin-left:auto;display:flex;gap:2px}
.ibtn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:var(--ink-2);transition:background .2s,color .2s}
.ibtn:hover{background:var(--paper-2);color:var(--ink)}
.card .media{position:relative;aspect-ratio:16/10;background:var(--paper-2);overflow:hidden}
.card .media img{width:100%;height:100%;object-fit:cover;transition:transform .9s var(--ease-out)}
.card:hover .media img{transform:scale(1.05)}
.card .media.portrait{aspect-ratio:4/5}
.play{position:absolute;inset:0;display:grid;place-items:center}
.play i{width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;color:var(--pc,#c4302b);box-shadow:0 10px 30px -8px rgba(0,0,0,.5);transition:transform .35s var(--ease-out)}
.card:hover .play i{transform:scale(1.12)}
.dur{position:absolute;right:10px;bottom:10px;background:rgba(15,34,56,.85);color:#fff;font-size:12px;font-weight:800;padding:3px 8px;border-radius:6px}
.ods{display:flex;flex-wrap:wrap;gap:4px}
.ods span{min-width:26px;height:26px;padding:0 5px;border-radius:5px;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:800;background:var(--o)}
mark{background:#ffe58a;color:inherit;border-radius:3px;padding:0 1px}

/* linha do tempo (lista acadêmica) */
.tl-group{display:grid;grid-template-columns:120px minmax(0,1fr);gap:0 28px;position:relative}
.tl-group+.tl-group{margin-top:8px}
.tl-year{position:relative}
.tl-year span{position:sticky;top:calc(var(--sticky-top) + 84px);display:block;font-family:var(--f-display);font-size:40px;line-height:1;color:var(--ink);padding:18px 0;font-variant-numeric:tabular-nums}
.tl-year small{display:block;font-family:var(--f-body);font-size:12px;font-weight:700;color:var(--ink-3);margin-top:6px}
.tl-items{border-left:2px solid var(--line);padding:6px 0 18px}
@container (max-width:700px){.tl-group{grid-template-columns:1fr}.tl-year span{position:static;font-size:28px;padding:20px 0 8px}.tl-items{border-left:0}}
.row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;padding:16px 8px 16px 28px;border-radius:14px;cursor:pointer;transition:background .25s;animation:rise .55s var(--ease-out) both;animation-delay:calc(var(--i,0) * 22ms)}
.row::before{content:"";position:absolute;left:-7px;top:24px;width:12px;height:12px;border-radius:50%;background:var(--paper);border:3px solid var(--c);transition:transform .3s var(--ease-out)}
@container (max-width:700px){.row{padding-left:16px}.row::before{left:0;top:0;bottom:0;width:4px;height:auto;border:0;border-radius:4px;background:var(--c)}}
.row:hover{background:var(--card)}
.row:hover::before{transform:scale(1.35)}
.row .kicker{grid-column:1/-1}
.row h3{font-family:var(--f-display);font-size:18px;line-height:1.25;margin:2px 0 4px}
.row .authors{-webkit-line-clamp:1}
.row .venue{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.row .foot{grid-column:1/-1;padding:4px 0 0;margin:0}
.row .acts{grid-row:2;grid-column:2;align-self:start;margin:0}
.tl-flat{display:flex;flex-direction:column}
.tl-flat .row{border-bottom:1px solid var(--line);border-radius:0}
.tl-flat .row::before{display:none}
.tl-flat .row{padding-left:20px;border-left:5px solid var(--c)}
.grp-h{font-family:var(--f-display);font-size:22px;margin:28px 0 10px;display:flex;align-items:center;gap:10px}
.grp-h::before{content:"";width:14px;height:14px;border-radius:4px;background:var(--c)}
.grp-h small{font-family:var(--f-body);font-size:13px;color:var(--ink-3);font-weight:700}

/* referências ABNT */
.refs-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;background:var(--card);border:1px dashed var(--line-2);border-radius:var(--radius-s);padding:12px 16px;margin-bottom:10px;font-size:14px;color:var(--ink-2)}
ol.refs{list-style:none;margin:0;padding:0;counter-reset:r}
ol.refs li{counter-increment:r;position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;padding:14px 4px;border-bottom:1px solid var(--line);font-size:15px;line-height:1.6;animation:rise .5s var(--ease-out) both;animation-delay:calc(var(--i,0) * 18ms)}
ol.refs li::before{content:counter(r);font-family:var(--f-display);font-size:15px;color:var(--c);text-align:right;padding-top:1px}
ol.refs .rt{cursor:pointer}
ol.refs .rt b{font-weight:800}
ol.refs .rt:hover{color:var(--azul-escuro)}

/* busca: página de resultados */
.sr-head{padding:clamp(28px,4vw,44px) 0 0}
.sr-head h2{font-family:var(--f-display);font-size:clamp(28px,4vw,44px);margin:0;line-height:1.1}
.sr-head h2 q{color:var(--azul-escuro)}
.sr-sum{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}
.sr-sum button{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:color-mix(in srgb,var(--c) 10%,#fff);color:color-mix(in srgb,var(--c) 85%,#000);font-weight:800;font-size:13px;border:1.5px solid color-mix(in srgb,var(--c) 30%,transparent);transition:transform .2s var(--ease)}
.sr-sum button:hover{transform:translateY(-1px)}
.sr-group{margin-top:34px}
.sr-group .sec-head{border-bottom:2px solid var(--c);padding-bottom:10px;margin-bottom:6px}
.sr-group .sec-head h2{font-size:24px;display:flex;align-items:center;gap:10px}
.sr-group .sec-head h2 small{font-family:var(--f-body);font-size:14px;color:var(--ink-3);font-weight:700}

/* podcast/youtube */
.show{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:28px;align-items:center;background:linear-gradient(135deg,#1e3750,#0f2238);color:#fff;border-radius:calc(var(--radius) + 6px);padding:clamp(20px,3vw,32px);margin:8px 0 24px;overflow:hidden}
.show h3{font-family:var(--f-display);font-size:clamp(26px,3vw,36px);margin:6px 0 10px;line-height:1.05}
.show p{color:#c8d9e6;margin:0 0 18px}
.show iframe{width:100%;height:232px;border:0;border-radius:14px;background:#000}
.wave{display:flex;gap:4px;align-items:end;height:28px;margin-bottom:12px}
.wave i{width:4px;border-radius:3px;background:#1ed760;animation:eq 1.1s var(--ease) infinite alternate}
.wave i:nth-child(2){animation-delay:.2s}.wave i:nth-child(3){animation-delay:.45s}.wave i:nth-child(4){animation-delay:.1s}.wave i:nth-child(5){animation-delay:.35s}
@keyframes eq{from{height:6px}to{height:28px}}
@container (max-width:760px){.show{grid-template-columns:1fr}}
.cta{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 20px;border-radius:999px;font-weight:800;font-size:15px;text-decoration:none;transition:transform .25s var(--ease)}
.cta:hover{transform:translateY(-2px)}
.cta.spot{background:#1ed760;color:#0b2414}
.cta.yt{background:#ff0033;color:#fff}
.cta.dark{background:var(--ink);color:#fff}
.cta.light{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
.cta.sm{height:38px;font-size:14px;padding:0 16px}

.empty{text-align:center;padding:64px 16px;color:var(--ink-3)}
.empty h3{font-family:var(--f-display);color:var(--ink);font-size:24px;margin:16px 0 6px}
.sk{border-radius:var(--radius);background:linear-gradient(100deg,var(--paper-2) 30%,#fff8e6 50%,var(--paper-2) 70%);background-size:300% 100%;animation:shim 1.4s linear infinite;height:200px}
@keyframes shim{to{background-position:-100% 0}}
.more{display:flex;justify-content:center;padding:28px 0 0}
.err{background:#fff1f0;border:1px solid #f3c2bd;color:#8a2c22;border-radius:var(--radius-s);padding:16px 18px;margin:32px 0}

/* ===== DRAWER ===== */
.scrim{position:fixed;inset:0;background:rgba(15,34,56,.5);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .35s var(--ease);z-index:1000}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;z-index:1001;top:0;right:0;bottom:0;width:min(660px,100%);background:var(--paper);box-shadow:-30px 0 80px -30px rgba(0,0,0,.5);transform:translateX(104%);transition:transform .55s var(--ease-out);display:flex;flex-direction:column}
.drawer.on{transform:none}
@container (max-width:700px){.drawer{top:auto;width:100%;height:92vh;border-radius:22px 22px 0 0;transform:translateY(104%)}}
.dhead{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);border-top:5px solid var(--c)}
.dhead .kicker{flex:1}
.dbody{overflow-y:auto;padding:24px clamp(18px,4vw,36px) 48px;overscroll-behavior:contain}
.dbody h2{font-family:var(--f-display);font-size:clamp(24px,3vw,32px);line-height:1.12;margin:0 0 14px}
.meta{display:grid;grid-template-columns:130px 1fr;gap:8px 16px;margin:20px 0;font-size:14px}
.meta dt{color:var(--ink-3);font-weight:700}
.meta dd{margin:0}
.ref{background:var(--card);border:1px dashed var(--line-2);border-radius:var(--radius-s);padding:16px 18px;font-size:14px;line-height:1.55;margin:18px 0}
.ref small{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px;font-weight:800}
.btnrow{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
.hero-img{width:100%;border-radius:var(--radius);margin-bottom:20px;box-shadow:var(--shadow)}
.embed{position:relative;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden;background:#000;margin-bottom:20px}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.blk{margin:22px 0}
.blk h4{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--c);margin:0 0 8px}
.blk p,.rich{margin:0;color:var(--ink-2);white-space:pre-line}
.rich p{margin:0 0 .8em}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px}
.related{display:grid;gap:8px}
.related button{text-align:left;padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--c);transition:transform .25s var(--ease),box-shadow .25s}
.related button:hover{transform:translateX(3px);box-shadow:var(--shadow)}
.related b{display:block;font-family:var(--f-display);font-size:15px;line-height:1.3}
.related small{color:var(--ink-3);font-size:12px;font-weight:700}

/* ===== SUBMISSÃO ===== */
.submit{background:var(--ceu);padding:clamp(48px,7vw,88px) 0;margin-top:24px}
.submit .grid2{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(24px,5vw,64px);align-items:start}
@container (max-width:860px){.submit .grid2{grid-template-columns:1fr}}
.submit h2{font-family:var(--f-display);font-size:clamp(30px,4vw,48px);line-height:1.02;margin:12px 0 16px}
.submit .eyebrow{color:var(--azul-escuro)}
.steps{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:14px}
.steps li{display:flex;gap:14px;align-items:flex-start;color:var(--ink-2)}
.steps b{flex:none;width:30px;height:30px;border-radius:50%;background:var(--azul-escuro);color:#fff;display:grid;place-items:center;font-size:14px}
form{background:#fff;border-radius:calc(var(--radius) + 4px);padding:clamp(20px,3vw,32px);box-shadow:var(--shadow-up);display:grid;grid-template-columns:1fr 1fr;gap:14px}
@container (max-width:560px){form{grid-template-columns:1fr}}
.f{display:flex;flex-direction:column;gap:6px}
.f.full{grid-column:1/-1}
.f label{font-size:13px;font-weight:800;color:var(--ink-2)}
.f input,.f select,.f textarea{border:1.5px solid var(--line);border-radius:12px;background:var(--paper);padding:12px 14px;font-size:15px;transition:border-color .2s,background .2s}
.f input:focus,.f select:focus,.f textarea:focus{outline:none;border-color:var(--azul);background:#fff}
.f textarea{min-height:96px;resize:vertical}
.drop{grid-column:1/-1;border:2px dashed #9fc3dc;border-radius:16px;background:linear-gradient(180deg,#f6fbfe,#eef6fb);padding:24px;text-align:center;transition:border-color .25s,background .25s,transform .25s var(--ease)}
.drop.over{border-color:var(--azul);background:#e3f1fa;transform:scale(1.01)}
.drop .ic{width:52px;height:52px;margin:0 auto 10px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--azul);box-shadow:var(--shadow);animation:bob 2.6s var(--ease) infinite}
@keyframes bob{50%{transform:translateY(-5px)}}
.drop p{margin:0;color:var(--ink-2);font-size:14px}
.drop u{color:var(--azul);font-weight:800;cursor:pointer}
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

.toast{position:fixed;left:50%;bottom:24px;translate:-50% 20px;background:var(--ink);color:#fff;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .3s,translate .4s var(--ease-out);z-index:1100}
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
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    grid: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
    list: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor"/></svg>',
    quote: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18v-5.5C4 8.4 6 6 10 5l.8 1.6C8.6 7.5 7.6 9 7.5 11H10v7zm10 0v-5.5C14 8.4 16 6 20 5l.8 1.6c-2.2.9-3.2 2.4-3.3 4.4H20v7z"/></svg>',
    filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    copy: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    ext: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    pdf: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9 15l3 3 3-3"/></svg>',
    link: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    upload: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    book: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#9fb3c4" stroke-width="1.4" stroke-linecap="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6"/></svg>',
  };

  const BOT = (id, w) => `https://static.wixstatic.com/media/8d49b9_${id}~mv2.png/v1/fit/w_${w},h_${Math.round(w * 1.4)},q_85,enc_auto/botanico.png`;
  // posições pensadas para a planta entrar pela borda; --o é o ponto de apoio do balanço
  const BOTANICOS = [
    { id: "b7e80bbb609a409a86f48882b4e63c5f", cls: "r", w: "620px", pos: "right:-270px;bottom:-175px", r: "-6deg", o: "60% 100%", s: ["-2deg", "2.2deg"], t: "9s", d: ".2s", f: ["60px", "60px"] },
    { id: "f2a34af41ebc43e49e7ea272df7a355a", cls: "r m", w: "400px", pos: "right:-40px;top:-210px", r: "165deg", o: "50% 100%", s: ["-3deg", "2.5deg"], t: "11s", d: ".5s", f: ["40px", "-60px"] },
    { id: "8ef082c085d447c59e23f0bbf6fb20d5", cls: "l", w: "330px", pos: "left:-205px;top:-195px", r: "135deg", o: "50% 100%", s: ["-2.5deg", "3deg"], t: "12s", d: ".35s", f: ["-60px", "-40px"] },
    { id: "6760da4398fc4e9d98cb303a431512d8", cls: "l", w: "360px", pos: "left:-170px;bottom:-130px", r: "24deg", o: "30% 100%", s: ["2deg", "-2.5deg"], t: "10s", d: ".6s", f: ["-60px", "40px"] },
  ];
  const FLORA = `<div class="flora" aria-hidden="true">${BOTANICOS.map((b) => `<span class="bot ${b.cls}" style="${b.pos};--w:${b.w};--r:${b.r};--o:${b.o};--s1:${b.s[0]};--s2:${b.s[1]};--t:${b.t};--d:${b.d};--fx:${b.f[0]};--fy:${b.f[1]}"><img src="${BOT(b.id, 700)}" alt="" loading="eager" decoding="async"></span>`).join("")}</div>`;
  const TOPO = `<svg class="topo" viewBox="0 0 900 600" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => {
    const r = 40 + i * 34, cx = 600, cy = 220;
    const pts = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      const w = r * (1 + 0.16 * Math.sin(a * 3 + i * 0.7) + 0.08 * Math.cos(a * 5 - i));
      return [cx + Math.cos(a) * w * 1.35, cy + Math.sin(a) * w * 0.85];
    });
    return `<path d="${pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")}Z"/>`;
  }).join("")}</svg>`;

  const VIEWS = {
    academico: [["timeline", "Linha do tempo", I.list], ["refs", "Referências", I.quote], ["cards", "Cards", I.grid]],
    publicacoes: [["cards", "Cards", I.grid], ["timeline", "Lista", I.list]],
    tecnologias: [["cards", "Cards", I.grid], ["timeline", "Lista", I.list]],
    multimidia: [["cards", "Cards", I.grid], ["timeline", "Lista", I.list]],
  };

  /* ---------- componente ---------- */
  class OtssBiblioteca extends HTMLElement {
    static get observedAttributes() { return ["sticky-offset"]; }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.cfg = { ...DEFAULTS };
      this.state = this.blankState();
      this.prefs = { view: {}, group: "ano" };
    }
    blankState() {
      return { sec: "inicio", sub: "", q: "", scope: "tudo", temas: new Set(), de: "", ate: "", autor: "", ordem: "relevancia", shown: PAGE, filtersOpen: false };
    }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      ["client-id", "form-id", "site-id"].forEach((a) => {
        const v = this.getAttribute(a);
        if (v) this.cfg[a.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
      });
      const saved = safeStore.get("otss-biblioteca-prefs");
      if (saved) this.prefs = { ...this.prefs, ...saved };
      this.client = new WixClient(this.cfg.clientId);
      this.injectFonts();
      this.readHash();
      this.renderShell();
      this.load();
    }
    attributeChangedCallback(name, _o, v) {
      if (name === "sticky-offset") this.style.setProperty("--sticky-top", (parseInt(v, 10) || 0) + "px");
    }
    disconnectedCallback() {
      document.removeEventListener("keydown", this._onKey);
      document.removeEventListener("click", this._onDocClick);
      removeEventListener("resize", this._onResize);
      clearInterval(this._phTimer);
      this._io && this._io.disconnect();
      this._ioMore && this._ioMore.disconnect();
    }
    injectFonts() {
      // Título do hero em Museo 900: arquivo licenciado via atributo "fonte-titulo" (URL .woff2/.woff/.otf)
      // ou nome de uma família já carregada na página via "fonte-titulo-familia".
      const fam = this.getAttribute("fonte-titulo-familia");
      if (fam) this.style.setProperty("--f-hero-custom", `"${fam.replace(/"/g, "")}"`);
      const url = this.getAttribute("fonte-titulo");
      if (url && "FontFace" in window && !OtssBiblioteca._heroFont) {
        OtssBiblioteca._heroFont = new FontFace("OTSS Museo 900", `url("${url.replace(/"/g, "")}")`, { weight: "900", style: "normal", display: "swap" });
        OtssBiblioteca._heroFont.load().then((f) => document.fonts.add(f)).catch((e) => console.warn("[otss-biblioteca] fonte do título não carregou", e));
      }
      if (document.getElementById("otss-bib-fonts")) return;
      const ff = document.createElement("style");
      ff.textContent = `@font-face{font-family:"OTSS Museo 900";src:local("Museo900-Regular"),local("Museo 900");font-weight:900;font-style:normal;font-display:swap}`;
      document.head.appendChild(ff);
      const l = document.createElement("link");
      l.id = "otss-bib-fonts"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Bitter:wght@600;700;900&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap";
      document.head.appendChild(l);
    }
    $(sel) { return this.root.querySelector(sel); }
    $$(sel) { return [...this.root.querySelectorAll(sel)]; }

    /* ----- URL ----- */
    readHash() {
      const h = new URLSearchParams(location.hash.replace(/^#/, ""));
      const s = this.state;
      s.sec = h.get("secao") || "inicio";
      s.sub = h.get("tipo") || "";
      s.q = h.get("q") || "";
      s.scope = h.get("em") || "tudo";
      s.temas = new Set((h.get("temas") || "").split(",").filter(Boolean));
      s.de = h.get("de") || ""; s.ate = h.get("ate") || "";
      s.autor = h.get("autor") || "";
      s.ordem = h.get("ordem") || "relevancia";
      this.pendingItem = h.get("item") || "";
    }
    writeHash() {
      const s = this.state, h = new URLSearchParams();
      if (s.sec !== "inicio") h.set("secao", s.sec);
      if (s.sub) h.set("tipo", s.sub);
      if (s.q) h.set("q", s.q);
      if (s.scope !== "tudo") h.set("em", s.scope);
      if (s.temas.size) h.set("temas", [...s.temas].join(","));
      if (s.de) h.set("de", s.de);
      if (s.ate) h.set("ate", s.ate);
      if (s.autor) h.set("autor", s.autor);
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
          c.queryAll("BibliotecaTipos"), c.queryAll("BibliotecaTemas"),
          c.queryAll("BibliotecaAcervo", ["tipo", "temas"]), c.queryAll("BibliotecaTecnologias", ["temas"]), c.queryAll("BibliotecaMidia", ["temas"]),
        ]);
        this.prepare({ tipos, temas, acervo, tecs, midia });
        this.ready = true;
        if (this._ftApply) { this._ftApply(); this._ftApply = null; }
        if (this.state.q) this.loadFulltext();
        this.renderEntries();
        this.render(true);
        if (this.pendingItem) { const it = this.byId.get(this.pendingItem); if (it) this.openItem(it); }
      } catch (e) {
        console.error("[otss-biblioteca]", e);
        this.$(".view").innerHTML = `<div class="wrap"><div class="err"><b>Não foi possível carregar a biblioteca agora.</b><br>Verifique sua conexão e tente novamente. <button class="linkbtn" data-act="retry">Tentar de novo</button></div></div>`;
      }
    }

    prepare({ tipos, temas, acervo, tecs, midia }) {
      const visible = (x) => x.visivel !== false;
      const tipoById = new Map(tipos.map((t) => [t._id, t]));
      this.temas = temas.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
      this.temaBySlug = new Map(this.temas.map((t) => [t.slug, t]));
      const eixos = new Map();
      this.temas.forEach((t) => {
        const k = t.eixo || "Outros";
        if (!eixos.has(k)) eixos.set(k, { nome: k, cor: t.cor || "#6b7a8a", temas: [] });
        eixos.get(k).temas.push(t);
      });
      this.eixos = [...eixos.values()];
      const temaRefs = (arr) => (Array.isArray(arr) ? arr.filter((t) => t && t._id) : []);
      const secaoDoTipo = (t) => t.secao || (t.slug === "publicacoes-otss" ? "publicacoes" : "academico");
      const items = [];

      const outros = { _id: "outros", nome: "Outros", slug: "outros", cor: "#6b7a8a", secao: "academico" };
      acervo.filter(visible).forEach((d) => {
        const tp = (d.tipo && typeof d.tipo === "object" ? d.tipo : tipoById.get(d.tipo)) || outros;
        items.push({
          id: d._id, kind: "acervo", sec: secaoDoTipo(tp), sub: tp.slug, tipo: tp, cor: tp.cor || "#276cb2",
          titulo: d.titulo || "Sem título", autores: d.autores || "", ano: d.ano || (d.data ? +String(d.data).slice(0, 4) : null),
          data: d.data || "", resumo: d.resumo || "", referencia: (d.referencia || "").trim(), veiculo: d.veiculo || "",
          editora: d.editora || "", cidade: d.cidade || "", link: d.link || "", arquivo: wixDocument(d.arquivo, this.cfg.siteId),
          capa: d.capa || "", video: d.video || "", projetos: d.projetos || [], palavras: d.palavrasChave || [],
          formato: d.formatoOriginal || "", destaque: !!d.destaque, temas: temaRefs(d.temas), created: d._createdDate?.$date || "",
        });
      });
      const tecTipo = { nome: "Tecnologia social", slug: "tecnologias", cor: "#4d7c0f" };
      tecs.filter(visible).forEach((d) => {
        items.push({
          id: d._id, kind: "tecnologia", sec: "tecnologias", sub: "", tipo: tecTipo, cor: tecTipo.cor, titulo: d.title || "",
          resumo: stripHTML(d.descrio), resumoHTML: d.descrio || "", problema: d.problemaSolucionado || "", solucao: d.soluoAdotada || "",
          resultado: d.resultadoAlcanado || "", capa: d.fotoPrincipal || "", fotos: [d.fotosSecundriasFaixa2, d.foto3, d.foto4].filter(Boolean),
          ods: (d.odsNumeros || []).map((n) => +n).filter((n) => n >= 1 && n <= 17).sort((a, b) => a - b),
          link: d.linkPagina || "", arquivo: wixDocument(d.arquivo, this.cfg.siteId), temas: temaRefs(d.temas), ordem: d.ordem ?? 999, ano: null, autores: "",
        });
      });
      const vidTipo = { nome: "Vídeo", slug: "videos", cor: "#c4302b" };
      const podTipo = { nome: "Podcast", slug: "podcast", cor: "#15803d" };
      midia.filter(visible).forEach((d) => {
        const isPod = d.tipo === "podcast";
        const tp = isPod ? podTipo : vidTipo;
        items.push({
          id: d._id, kind: isPod ? "podcast" : "video", sec: "multimidia", sub: tp.slug, tipo: tp, cor: tp.cor,
          titulo: d.titulo || "", resumo: d.descricao || "", url: d.url || "", data: d.data || "", ano: d.data ? +String(d.data).slice(0, 4) : null,
          duracao: d.duracao || "", capa: d.capa || "", serie: d.serie || "", destaque: !!d.destaque, ordem: d.ordem ?? 999, temas: temaRefs(d.temas), autores: d.serie || "",
        });
      });

      items.forEach((it) => { it.aut = it.kind === "acervo" ? parseAutores(it.autores) : []; });
      // sobrenome sem iniciais ("NOBRE") → une ao único autor com esse sobrenome ("NOBRE, D. B.")
      const porSobrenome = new Map();
      items.forEach((it) => it.aut.forEach((a) => {
        const [sob, ini] = a.key.split("|");
        if (!ini) return;
        const m = porSobrenome.get(sob) || new Map();
        m.set(a.key, a.display); porSobrenome.set(sob, m);
      }));
      items.forEach((it) => it.aut.forEach((a) => {
        const [sob, ini] = a.key.split("|");
        const cands = porSobrenome.get(sob);
        if (!ini && cands && cands.size === 1) { const [k, disp] = [...cands.entries()][0]; a.key = k; a.display = disp; }
      }));
      const autores = new Map();
      items.forEach((it) => {
        it.aut = it.aut.filter((a, i, arr) => arr.findIndex((b) => b.key === a.key) === i);
        it.autKeys = new Set(it.aut.map((a) => a.key));
        if (it.sec === "academico") it.aut.forEach((a) => {
          const e = autores.get(a.key) || { key: a.key, n: 0, names: new Map() };
          e.n++; e.names.set(a.display, (e.names.get(a.display) || 0) + 1);
          autores.set(a.key, e);
        });
        it.hay = norm([it.titulo, it.autores, it.resumo, it.referencia, it.veiculo, it.editora, it.cidade, it.serie, it.problema, it.solucao,
          it.resultado, it.tipo.nome, it.formato, it.ano, ...(it.projetos || []), ...(it.palavras || []), ...it.temas.map((t) => t.nome + " " + t.eixo),
          ...(it.ods || []).map((n) => "ods " + n + " " + ODS_NOMES[n])].filter(Boolean).join(" \u0001 "));
        it.hayTitle = norm(it.titulo);
        it.hayAut = norm(it.autores + " " + it.aut.map((a) => a.display).join(" "));
      });
      this.autores = [...autores.values()].map((e) => ({ key: e.key, n: e.n, nome: [...e.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0] }))
        .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
      this.autorByKey = new Map(this.autores.map((a) => [a.key, a]));
      this.items = items;
      this.byId = new Map(items.map((i) => [i.id, i]));

      this.subtipos = {};
      tipos.filter((t) => t.ativo !== false).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).forEach((t) => {
        const sec = secaoDoTipo(t);
        (this.subtipos[sec] = this.subtipos[sec] || []).push({ slug: t.slug, nome: t.nome, cor: t.cor || "#276cb2" });
      });
      if (items.some((i) => i.sub === "outros")) (this.subtipos.academico = this.subtipos.academico || []).push({ slug: "outros", nome: "Outros", cor: "#6b7a8a" });
      if ((this.subtipos.publicacoes || []).length < 2) delete this.subtipos.publicacoes;
      this.subtipos.multimidia = [{ slug: "videos", nome: "Vídeos", cor: vidTipo.cor }, { slug: "podcast", nome: "Podcast", cor: podTipo.cor }];

      const anos = items.filter((i) => i.sec === "academico").map((i) => i.ano).filter((n) => n > 1900);
      this.anoMin = Math.min(...anos); this.anoMax = Math.max(...anos);
      this.countSec = {};
      items.forEach((i) => (this.countSec[i.sec] = (this.countSec[i.sec] || 0) + 1));
      if (!SECOES.some((x) => x.slug === this.state.sec)) this.state.sec = "inicio";
    }

    /* ----- busca e filtros ----- */
    matchQ(list, q = this.state.q, scope = this.state.scope) {
      q = norm(q).trim();
      if (!q) return list.map((it) => ({ it, score: 0 }));
      const terms = q.split(/\s+/).filter(Boolean);
      const field = scope === "titulo" ? "hayTitle" : scope === "autoria" ? "hayAut" : "hay";
      const useText = scope === "tudo" || scope === "texto";
      const out = [];
      for (const it of list) {
        let score = 0, ok = true, inText = false;
        for (const t of terms) {
          const meta = scope !== "texto" && it[field].indexOf(t) >= 0;
          const txt = useText && it.ftAll ? it.ftAll.indexOf(t) >= 0 : false;
          if (!meta && !txt) { ok = false; break; }
          if (meta) {
            if (it.hayTitle.includes(t)) score += 10;
            if (it.hayTitle.startsWith(t)) score += 4;
            if (it.hayAut.includes(t)) score += 3;
            score += 1;
          } else score += 0.6;
          if (txt) inText = true;
        }
        if (ok) {
          if (it.hayTitle.includes(q)) score += 25;
          if (inText && it.ftAll.includes(q)) score += 2;
          out.push({ it, score, inText });
        }
      }
      return out;
    }

    /* ----- texto completo (índice gerado por scripts/indexar.mjs) ----- */
    loadFulltext() {
      if (this._ftPromise) return this._ftPromise;
      const url = this.getAttribute("indice-url") || INDEX_URL;
      this.ftState = "carregando";
      this._ftPromise = fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("índice " + r.status)))).then((j) => {
        let n = 0;
        const apply = () => {
          for (const [id, d] of Object.entries(j.itens || {})) {
            const it = this.byId && this.byId.get(id);
            const paginas = d.paginas || (j.docs || {})[d.doc];
            if (!it || !Array.isArray(paginas)) continue;
            it.ft = { tipo: d.tipo, fonte: d.fonte, pages: paginas.map((p) => String(p).normalize("NFC")) };
            it.ft.npages = it.ft.pages.map(norm);
            it.ftAll = it.ft.npages.join(" \u0002 ");
            n++;
          }
          this.ftCount = n; this.ftState = "ok";
          if (this.state.q) this.render(false);
        };
        if (this.ready) apply(); else this._ftApply = apply;
      }).catch((e) => { this.ftState = "erro"; console.warn("[otss-biblioteca] índice de texto completo indisponível", e); });
      return this._ftPromise;
    }
    // trechos do texto completo que contêm os termos buscados
    textHits(it, max = 1) {
      if (!it.ft || !this.state.q || this.state.scope === "titulo" || this.state.scope === "autoria") return [];
      const terms = norm(this.state.q).trim().split(/\s+/).filter((t) => t.length > 1);
      if (!terms.length || (this.state.scope !== "texto" && terms.every((t) => it.hayTitle.includes(t)))) return [];
      const phrase = norm(this.state.q).trim();
      const sumario = /(?:\.\s?){8,}/;
      const ranked = it.ft.npages.map((p, i) => ({ i, k: terms.filter((t) => p.includes(t)).length + (p.includes(phrase) ? 1 : 0), toc: sumario.test(p) ? 1 : 0 }))
        .filter((x) => x.k > 0).sort((a, b) => b.k - a.k || a.toc - b.toc || a.i - b.i).slice(0, max);
      return ranked.map(({ i }) => {
        const np = it.ft.npages[i], op = it.ft.pages[i];
        let pos = np.indexOf(phrase); if (pos < 0) pos = Math.min(...terms.map((t) => np.indexOf(t)).filter((x) => x >= 0));
        let a = Math.max(0, pos - 90), b = Math.min(op.length, pos + 170);
        if (a > 0) { const sp = op.indexOf(" ", a); if (sp > 0 && sp < pos) a = sp + 1; }
        if (b < op.length) { const sp = op.lastIndexOf(" ", b); if (sp > pos) b = sp; }
        const txt = op.slice(a, b).replace(/(?:\.\s?){4,}/g, " … ").replace(/\s{2,}/g, " ");
        return { page: it.ft.tipo === "pdf" ? i + 1 : 0, text: (a > 0 ? "…" : "") + txt + (b < op.length ? "…" : "") };
      });
    }
    hitHTML(it) {
      const [h] = this.textHits(it, 1);
      if (!h) return "";
      const onde = it.ft.tipo === "resumo" ? "No resumo da revista" : "No texto" + (h.page ? ` · p. ${h.page}` : "");
      return `<p class="hit"><span>${onde}</span>${this.hl(h.text)}</p>`;
    }
    passFilters(it, { ignoreYear = false, ignoreAutor = false } = {}) {
      const s = this.state;
      if (s.temas.size && !it.temas.some((t) => s.temas.has(t.slug))) return false;
      if (!ignoreYear && (s.de || s.ate)) { const de = +s.de || 0, ate = +s.ate || 9999; if (!it.ano || it.ano < de || it.ano > ate) return false; }
      if (!ignoreAutor && s.autor && !it.autKeys.has(s.autor)) return false;
      return true;
    }
    sortRes(res, sec) {
      const o = this.state.ordem;
      const recentes = (a, b) => (b.it.ano || 0) - (a.it.ano || 0) || String(b.it.data || b.it.created || "").localeCompare(String(a.it.data || a.it.created || "")) || a.it.titulo.localeCompare(b.it.titulo, "pt-BR");
      if (o === "recentes") return res.sort(recentes);
      if (o === "antigos") return res.sort((a, b) => (a.it.ano || 9999) - (b.it.ano || 9999) || a.it.titulo.localeCompare(b.it.titulo, "pt-BR"));
      if (o === "az") return res.sort((a, b) => a.it.titulo.localeCompare(b.it.titulo, "pt-BR"));
      if (o === "autor") return res.sort((a, b) => (a.it.aut[0]?.display || "~").localeCompare(b.it.aut[0]?.display || "~", "pt-BR"));
      if (this.state.q) return res.sort((a, b) => b.score - a.score || recentes(a, b));
      if (sec === "tecnologias" || sec === "multimidia") return res.sort((a, b) => (b.it.destaque - a.it.destaque) || (a.it.ordem ?? 999) - (b.it.ordem ?? 999) || recentes(a, b));
      return res.sort((a, b) => (sec === "publicacoes" ? b.it.destaque - a.it.destaque : 0) || recentes(a, b));
    }
    sectionData() {
      const s = this.state;
      const inSec = this.items.filter((it) => it.sec === s.sec);
      const matched = this.matchQ(inSec.filter((it) => this.passFilters(it)));
      const subCounts = {};
      matched.forEach(({ it }) => (subCounts[it.sub] = (subCounts[it.sub] || 0) + 1));
      const results = this.sortRes(s.sub ? matched.filter((r) => r.it.sub === s.sub) : matched, s.sec);
      const histBase = this.matchQ(inSec.filter((it) => (!s.sub || it.sub === s.sub) && this.passFilters(it, { ignoreYear: true })));
      const autBase = this.matchQ(inSec.filter((it) => (!s.sub || it.sub === s.sub) && this.passFilters(it, { ignoreAutor: true })));
      return { results, subCounts, total: matched.length, histBase, autBase };
    }
    viewFor(sec) {
      const opts = VIEWS[sec] || VIEWS.publicacoes;
      const v = this.prefs.view[sec];
      return opts.some((o) => o[0] === v) ? v : opts[0][0];
    }
    savePrefs() { safeStore.set("otss-biblioteca-prefs", this.prefs); }

    /* ----- casca ----- */
    renderShell() {
      this.root.innerHTML = `<style>${CSS}</style>
<header class="hero" part="hero">
  <div class="bg">${TOPO}${FLORA}</div>
  <div class="wrap hero-in">
    <span class="eyebrow">OTSS · Biblioteca</span>
    <h1>Conhecimento que nasce do <em>território</em></h1>
    <p class="lead">Pesquisas, publicações, tecnologias sociais, vídeos e podcast do Observatório de Territórios Sustentáveis e Saudáveis da Bocaina, num só lugar e sempre atualizados.</p>
    ${this.searchBox("hero")}
    <div class="sugg"><span>Experimente:</span>${SUGESTOES.map((t) => `<button data-act="suggest" data-q="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="entries">${SECOES.map((x) => `<button class="entry" data-act="sec" data-sec="${x.slug}" style="--c2:${x.cor === "#123d7a" ? "#7fb2e5" : x.cor}"><b data-count="${x.slug}">—</b><span>${esc(x.nome)}</span><i>${I.arrow}</i></button>`).join("")}</div>
  </div>
</header>
<nav class="nav" aria-label="Seções da biblioteca"><div class="wrap">
  <div class="tabs" role="tablist"><span class="pill"></span>
    <button class="tab" role="tab" data-act="sec" data-sec="inicio" style="--c:#16283b" aria-selected="false"><span class="dot"></span>Início</button>
    ${SECOES.map((x) => `<button class="tab" role="tab" data-act="sec" data-sec="${x.slug}" style="--c:${x.cor}" aria-selected="false"><span class="dot"></span>${esc(x.nome)}<span class="n">0</span></button>`).join("")}
  </div>
  ${this.searchBox("mini")}
</div></nav>
<main class="view" aria-live="polite"><div class="wrap" style="padding-top:40px"><div class="grid">${'<div class="sk"></div>'.repeat(6)}</div></div></main>
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
      this.startPlaceholder();
    }

    searchBox(id) {
      const hero = id === "hero";
      return `<div class="sbox ${hero ? "" : "mini"}" data-sbox="${id}" role="search">
  <div class="sfield"><span class="ico">${I.search}</span>
    <label class="sr" for="q-${id}">Buscar na biblioteca</label>
    <input id="q-${id}" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="ac-${id}" aria-autocomplete="list" placeholder="${hero ? "Busque por título, autoria, tema, ano…" : "Buscar…"}" value="${esc(this.state.q)}">
    <span class="right"><kbd class="kbd">/</kbd><button class="sclear" data-act="clear-q" aria-label="Limpar busca">${I.x}</button>${hero ? `<button class="sgo" data-act="go">Buscar</button>` : ""}</span>
  </div>
  <div class="ac" id="ac-${id}" role="listbox"></div>
</div>${hero ? `<div class="scope" role="group" aria-label="Buscar em"><span>Buscar em:</span>${[["tudo", "Tudo"], ["titulo", "Títulos"], ["autoria", "Autoria"], ["texto", "Texto completo"]].map(([v, l]) => `<button data-act="scope" data-v="${v}" aria-pressed="${this.state.scope === v}">${l}</button>`).join("")}</div>` : ""}`;
    }

    startPlaceholder() {
      const ex = ["Busque por título, autoria, tema, ano…", "Ex.: educação diferenciada", "Ex.: NOBRE, D. B.", "Ex.: cartografia social 2024", "Ex.: saneamento ecológico"];
      let i = 0;
      const input = this.$("#q-hero");
      if (reduceMotion()) return;
      this._phTimer = setInterval(() => {
        if (this.root.activeElement === input || input.value) return;
        i = (i + 1) % ex.length;
        input.placeholder = ex[i];
      }, 3200);
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

    renderEntries() {
      this.$$("[data-count]").forEach((el) => {
        const target = this.countSec[el.dataset.count] || 0;
        if (reduceMotion()) { el.textContent = fmtN(target); return; }
        const t0 = performance.now(), dur = 1300;
        const step = (t) => {
          const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
          el.textContent = fmtN(Math.round(target * e));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      this.$$(".tab[data-sec]").forEach((b) => { const n = b.querySelector(".n"); if (n) n.textContent = fmtN(this.countSec[b.dataset.sec] || 0); });
    }

    /* ----- roteamento de visão ----- */
    mode() {
      const s = this.state;
      if (s.sec === "inicio") return s.q ? "busca" : "home";
      return "secao";
    }
    render(full) {
      if (!this.ready) return;
      const m = this.mode();
      const key = m + "|" + this.state.sec;
      const v = this.$(".view");
      if (full || key !== this._lastKey) {
        this._lastKey = key;
        this.state.shown = PAGE;
        v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
        v.innerHTML = m === "home" ? this.homeHTML() : m === "busca" ? `<div class="wrap" data-slot="busca"></div>` : this.sectionShellHTML();
        if (m === "home") this.afterHome();
      }
      if (m === "busca") this.renderSearchPage();
      if (m === "secao") this.renderSection();
      this.syncChrome();
      this.writeHash();
    }
    go(patch, { scroll = true } = {}) {
      const before = this.state.sec;
      Object.assign(this.state, patch);
      this.state.shown = PAGE;
      this.render(false);
      if (scroll && (patch.sec !== undefined && patch.sec !== before || patch.scrollTop)) this.scrollToView();
    }
    syncChrome() {
      const s = this.state;
      this.$$(".tab[data-sec]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.sec === s.sec)));
      this.movePill();
      this.$$(".sbox").forEach((b) => b.classList.toggle("has-q", !!s.q));
      this.$$('.sbox input[type="search"]').forEach((i) => { if (this.root.activeElement !== i) i.value = s.q; });
      this.$$('[data-act="scope"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.scope)));
    }
    movePill() {
      const act = this.$(`.tab[aria-selected="true"]`), pill = this.$(".pill");
      if (!act || !pill) return;
      pill.style.left = act.offsetLeft + "px";
      pill.style.width = act.offsetWidth + "px";
      pill.style.setProperty("--c", getComputedStyle(act).getPropertyValue("--c"));
      const tabs = this.$(".tabs");
      tabs.scrollTo({ left: act.offsetLeft - tabs.clientWidth / 2 + act.offsetWidth / 2, behavior: "smooth" });
    }
    scrollToView() {
      const nav = this.$(".nav");
      const off = parseInt(this.getAttribute("sticky-offset"), 10) || 0;
      const top = this.$(".view").getBoundingClientRect().top + scrollY - nav.offsetHeight - off;
      if (scrollY > top || this.$(".hero").getBoundingClientRect().bottom > 0) scrollTo({ top, behavior: reduceMotion() ? "auto" : "smooth" });
    }

    /* ----- HOME ----- */
    homeHTML() {
      const acad = this.items.filter((i) => i.sec === "academico").sort((a, b) => (b.ano || 0) - (a.ano || 0)).slice(0, 6);
      const feats = this.items.filter((i) => i.destaque).sort((a, b) => String(b.data || b.created).localeCompare(String(a.data || a.created))).slice(0, 10);
      const tecs = this.items.filter((i) => i.sec === "tecnologias").sort((a, b) => a.ordem - b.ordem).slice(0, 3);
      const pod = this.items.filter((i) => i.kind === "podcast").sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 3);
      const vid = this.items.filter((i) => i.kind === "video").slice(0, 1);
      const sec = Object.fromEntries(SECOES.map((x) => [x.slug, x]));
      const subs = (this.subtipos.academico || []).map((t) => ({ ...t, n: this.items.filter((i) => i.sub === t.slug).length })).filter((t) => t.n);
      return `
${feats.length ? `<section class="block wrap"><div class="sec-head"><div><h2>Em destaque</h2><p>Lançamentos e materiais selecionados pela equipe.</p></div>
  <div class="rail-ctrl"><button class="round" data-act="rail" data-dir="-1" aria-label="Anterior">${I.left}</button><button class="round" data-act="rail" data-dir="1" aria-label="Próximo">${I.right}</button></div></div>
  <div class="rail">${feats.map((it) => { const img = this.thumb(it, 640, 820); return `<button class="fcard" data-open="${it.id}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}<div class="in"><span class="tag" style="--c:${it.cor};background:#fff;color:${it.cor}">${esc(it.tipo.nome)}</span><h3>${esc(it.titulo)}</h3></div></button>`; }).join("")}</div></section>` : ""}
<section class="block wrap">
  <div class="panel-card wide" style="--c:${sec.academico.cor}">
    <div class="sec-head" style="margin:0"><div><h3>${sec.academico.nome}</h3><p class="psub">${fmtN(this.countSec.academico)} trabalhos de ${fmtN(this.autores.length)} autoras e autores, de ${this.anoMin} a ${this.anoMax}.</p></div>
    <button class="more-link" style="--c:${sec.academico.cor}" data-act="sec" data-sec="academico">Explorar a produção ${I.arrow}</button></div>
    <div class="subtabs" style="padding-top:4px">${subs.map((t) => `<button class="sub" style="--c:${t.cor}" data-act="sec-sub" data-sec="academico" data-sub="${t.slug}"><span class="sw"></span>${esc(t.nome)} <span class="n">${t.n}</span></button>`).join("")}</div>
    <div class="tl-flat">${acad.map((it, i) => this.rowHTML(it, i)).join("")}</div>
  </div>
</section>
<section class="block wrap"><div class="home-sec">
  <div class="panel-card" style="--c:${sec.tecnologias.cor}">
    <div class="sec-head" style="margin:0"><div><h3>${sec.tecnologias.nome}</h3><p class="psub">${fmtN(this.countSec.tecnologias)} soluções construídas nos territórios.</p></div><button class="more-link" style="--c:${sec.tecnologias.cor}" data-act="sec" data-sec="tecnologias">Ver todas ${I.arrow}</button></div>
    <div class="related">${tecs.map((it) => `<button style="--c:${it.cor}" data-open="${it.id}"><b>${esc(it.titulo)}</b><small>${it.temas.map((t) => esc(t.nome)).slice(0, 2).join(" · ") || "Tecnologia social"}</small></button>`).join("")}</div>
  </div>
  <div class="panel-card" style="--c:${sec.multimidia.cor}">
    <div class="sec-head" style="margin:0"><div><h3>Ouça e assista</h3><p class="psub">Podcast Vozes do Território e canal OTSS Bocaina.</p></div><button class="more-link" style="--c:${sec.multimidia.cor}" data-act="sec" data-sec="multimidia">Ver tudo ${I.arrow}</button></div>
    <div class="related">${[...vid, ...pod].map((it) => `<button style="--c:${it.cor}" data-open="${it.id}"><b>${esc(it.titulo)}</b><small>${esc(it.tipo.nome)}${it.duracao ? " · " + esc(it.duracao) : ""}${it.data ? " · " + fmtData(it.data) : ""}</small></button>`).join("")}</div>
  </div>
</div></section>
<section class="block wrap">
  <div class="sec-head"><div><h2>${sec.publicacoes.nome}</h2><p>${esc(sec.publicacoes.desc)}</p></div><button class="more-link" style="--c:${sec.publicacoes.cor}" data-act="sec" data-sec="publicacoes">Ver todas (${fmtN(this.countSec.publicacoes)}) ${I.arrow}</button></div>
  <div class="grid">${this.items.filter((i) => i.sec === "publicacoes").sort((a, b) => String(b.data || b.created).localeCompare(String(a.data || a.created))).slice(0, 4).map((it, i) => this.cardHTML(it, i)).join("")}</div>
</section>`;
    }
    afterHome() { /* espaço para efeitos pós-render */ }

    /* ----- PÁGINA DE BUSCA ----- */
    renderSearchPage() {
      const s = this.state;
      const slot = this.$('[data-slot="busca"]');
      const all = this.matchQ(this.items.filter((it) => this.passFilters(it)));
      const by = {};
      all.forEach((r) => (by[r.it.sec] = by[r.it.sec] || []).push(r));
      const scopeTxt = s.scope === "titulo" ? " nos títulos" : s.scope === "autoria" ? " na autoria" : s.scope === "texto" ? " no texto completo" : "";
      if (!all.length) {
        slot.innerHTML = `<div class="sr-head"><h2>Nenhum resultado para <q>${esc(s.q)}</q>${scopeTxt}</h2></div>${this.emptyHTML(true)}`;
        return;
      }
      slot.innerHTML = `<div class="sr-head"><h2>${fmtN(all.length)} ${all.length === 1 ? "resultado" : "resultados"} para <q>${esc(s.q)}</q>${scopeTxt}</h2>${this.ftNote()}
        <div class="sr-sum">${SECOES.filter((x) => by[x.slug]).map((x) => `<button style="--c:${x.cor}" data-act="sec" data-sec="${x.slug}" data-keepq="1">${esc(x.nome)} · ${by[x.slug].length} ${I.arrow}</button>`).join("")}</div></div>
        ${this.activeRowHTML()}
        ${SECOES.filter((x) => by[x.slug]).map((x) => {
          const res = this.sortRes(by[x.slug], x.slug);
          const n = x.slug === "academico" ? 6 : 4;
          const body = x.slug === "academico"
            ? `<div class="tl-flat">${res.slice(0, n).map((r, i) => this.rowHTML(r.it, i)).join("")}</div>`
            : `<div class="grid">${res.slice(0, n).map((r, i) => this.cardHTML(r.it, i)).join("")}</div>`;
          return `<section class="sr-group" style="--c:${x.cor}"><div class="sec-head"><h2>${esc(x.nome)} <small>${res.length}</small></h2>
            ${res.length > n ? `<button class="more-link" style="--c:${x.cor}" data-act="sec" data-sec="${x.slug}" data-keepq="1">Ver todos os ${res.length} ${I.arrow}</button>` : ""}</div>${body}</section>`;
        }).join("")}<div style="height:48px"></div>`;
    }

    ftNote() {
      if (this.state.scope === "titulo" || this.state.scope === "autoria") return "";
      if (this.ftState === "ok") return `<p class="ftnote">Inclui busca dentro do texto completo de ${fmtN(this.ftCount)} documentos.</p>`;
      if (this.ftState === "carregando") return `<p class="ftnote">Carregando o texto completo dos documentos…</p>`;
      return "";
    }

    /* ----- SEÇÃO ----- */
    sectionShellHTML() {
      const s = this.state, x = SECOES.find((z) => z.slug === s.sec);
      const views = VIEWS[s.sec] || VIEWS.publicacoes;
      const acad = s.sec === "academico";
      const years = []; for (let y = this.anoMax; y >= Math.min(this.anoMin, 2000); y--) years.push(y);
      const yOpts = (lbl) => `<option value="">${lbl}</option>` + years.map((y) => `<option>${y}</option>`).join("");
      return `<header class="sh" style="--c:${x.cor}"><div class="wrap">
    <span class="crumb">Biblioteca OTSS</span>
    <h2>${esc(x.nome)}</h2><p class="d">${esc(x.desc)}</p>
    <div class="facts" data-slot="facts"></div>
    ${acad ? `<div class="dash">
      <div class="dcard" style="--c:${x.cor}"><h4><span>Trabalhos por ano</span><button data-act="clear-anos" data-slot="hist-clear" hidden>Todos os anos</button></h4><div class="hist" data-slot="hist"></div><div class="hist-ax" data-slot="hist-ax"></div></div>
      <div class="dcard" style="--c:${x.cor}"><h4><span>Autoras e autores</span><button data-act="toggle-authors">Ver todos</button></h4><div class="authors-cloud" data-slot="authors"></div></div>
    </div>` : ""}
  </div></header>
  <div class="wrap" style="--c:${x.cor}">
    ${this.subtipos[s.sec] ? `<div class="subtabs" data-slot="subtabs"></div>` : ""}
    <div class="toolbar">
      <button class="fbtn" data-act="toggle-filters" aria-expanded="${s.filtersOpen}" aria-controls="fp">${I.filter} Temas e eixos <span class="badge" hidden></span></button>
      ${acad || s.sec === "publicacoes" || s.sec === "multimidia" ? `<label class="sr" for="de">Ano inicial</label><select id="de" class="sel">${yOpts("Desde")}</select><label class="sr" for="ate">Ano final</label><select id="ate" class="sel">${yOpts("Até")}</select>` : ""}
      <label class="sr" for="ordem">Ordenar</label>
      <select id="ordem" class="sel"><option value="relevancia">${acad ? "Mais recentes" : "Relevância"}</option><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option><option value="az">Título A–Z</option>${acad ? `<option value="autor">Autoria A–Z</option>` : ""}</select>
      ${acad ? `<label class="sr" for="grp">Agrupar</label><select id="grp" class="sel"><option value="ano">Agrupar por ano</option><option value="tipo">Agrupar por tipo</option><option value="nenhum">Sem agrupar</option></select>` : ""}
      <span class="spacer"></span>
      <span class="count" data-slot="count"></span>
      <div class="seg" role="group" aria-label="Modo de visualização"><span class="knob"></span>${views.map(([v, l, ic]) => `<button data-act="view" data-v="${v}" aria-pressed="false" title="${l}">${ic}<span>${l}</span></button>`).join("")}</div>
    </div>
    <div class="fpanel ${s.filtersOpen ? "open" : ""}" id="fp"><div><div class="eixos">${this.eixos.map((e) => `<div class="eixo" style="--c:${e.cor}"><h4>${esc(e.nome)}</h4><div class="chips">${e.temas.map((t) =>
        `<button class="chip" style="--c:${t.cor || e.cor}" data-act="tema" data-slug="${esc(t.slug)}" aria-pressed="false">${esc(t.nome)}</button>`).join("")}</div></div>`).join("")}</div></div></div>
    <div class="active-row" data-slot="active"></div>
    <div class="results" data-slot="results"></div>
  </div>`;
    }

    renderSection() {
      const s = this.state, x = SECOES.find((z) => z.slug === s.sec);
      const acad = s.sec === "academico";
      const { results, subCounts, total, histBase, autBase } = this.sectionData();
      this.lastResults = results;
      const slot = (n) => this.$(`[data-slot="${n}"]`);

      // fatos
      const anos = results.map((r) => r.it.ano).filter(Boolean);
      const nAut = new Set(results.flatMap((r) => r.it.aut.map((a) => a.key))).size;
      slot("facts").innerHTML = `<span><b>${fmtN(results.length)}</b>${results.length === 1 ? "item" : "itens"}</span>` +
        (acad && nAut ? `<span><b>${fmtN(nAut)}</b>autoras e autores</span>` : "") +
        (anos.length ? `<span><b>${Math.min(...anos)}–${Math.max(...anos)}</b>período</span>` : "");

      // subabas
      const st = slot("subtabs");
      if (st) {
        const subs = this.subtipos[s.sec];
        st.innerHTML = `<button class="sub" style="--c:${x.cor}" data-act="sub" data-sub="" aria-pressed="${!s.sub}"><span class="sw"></span>Todos <span class="n">${fmtN(total)}</span></button>` +
          subs.map((t) => `<button class="sub ${subCounts[t.slug] ? "" : "zero"}" style="--c:${t.cor}" data-act="sub" data-sub="${t.slug}" aria-pressed="${s.sub === t.slug}"><span class="sw"></span>${esc(t.nome)} <span class="n">${fmtN(subCounts[t.slug] || 0)}</span></button>`).join("");
      }

      if (acad) { this.renderHist(histBase, x.cor); this.renderAuthors(autBase); }

      // controles
      const set = (id, v) => { const el = this.$("#" + id); if (el) el.value = v; };
      set("de", s.de); set("ate", s.ate); set("ordem", s.ordem); set("grp", this.prefs.group);
      this.$$('[data-act="tema"]').forEach((c) => c.setAttribute("aria-pressed", String(s.temas.has(c.dataset.slug))));
      const badge = this.$(".fbtn .badge"); if (badge) { badge.hidden = !s.temas.size; badge.textContent = s.temas.size; }
      const view = this.viewFor(s.sec);
      this.$$('[data-act="view"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === view)));
      this.moveKnob();
      const grp = this.$("#grp"); if (grp) grp.hidden = view !== "timeline";
      slot("count").innerHTML = `<b>${fmtN(results.length)}</b> ${results.length === 1 ? "resultado" : "resultados"}`;
      slot("active").innerHTML = this.activeRowHTML(true);
      this.renderResults();
    }

    moveKnob() {
      const seg = this.$(".seg"); if (!seg) return;
      const on = seg.querySelector('[aria-pressed="true"]'), k = seg.querySelector(".knob");
      if (on && k) { k.style.left = on.offsetLeft + "px"; k.style.width = on.offsetWidth + "px"; }
    }

    renderHist(base, cor) {
      const s = this.state;
      const counts = {};
      base.forEach(({ it }) => { if (it.ano) counts[it.ano] = (counts[it.ano] || 0) + 1; });
      const from = this.anoMin, to = this.anoMax;
      const max = Math.max(1, ...Object.values(counts));
      const de = +s.de || 0, ate = +s.ate || 9999, filt = !!(s.de || s.ate);
      let k = 0, html = "";
      for (let y = from; y <= to; y++) {
        const n = counts[y] || 0;
        const on = filt && y >= de && y <= ate;
        html += `<button data-act="year" data-y="${y}" class="${on ? "on" : filt ? "off" : ""}" style="--h:${Math.max(2, (n / max) * 100)}%;--k:${k++}" aria-label="${y}: ${n} trabalhos" ${n ? "" : "tabindex='-1'"}><i></i><span class="tip">${y} · ${n}</span></button>`;
      }
      this.$('[data-slot="hist"]').innerHTML = html;
      this.$('[data-slot="hist"]').style.setProperty("--c", cor);
      const mid = Math.round((from + to) / 2);
      this.$('[data-slot="hist-ax"]').innerHTML = `<span>${from}</span><span>${mid}</span><span>${to}</span>`;
      this.$('[data-slot="hist-clear"]').hidden = !filt;
    }
    renderAuthors(base) {
      const s = this.state;
      const counts = new Map();
      base.forEach(({ it }) => it.aut.forEach((a) => counts.set(a.key, (counts.get(a.key) || 0) + 1)));
      const list = [...counts.entries()].map(([key, n]) => ({ key, n, nome: (this.autorByKey.get(key) || {}).nome || key }))
        .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
      if (s.autor && !counts.has(s.autor)) list.unshift({ key: s.autor, n: 0, nome: (this.autorByKey.get(s.autor) || {}).nome || s.autor });
      const el = this.$('[data-slot="authors"]');
      el.classList.toggle("all", !!this._authorsAll);
      el.innerHTML = list.map((a) => `<button class="au" data-act="autor" data-k="${esc(a.key)}" aria-pressed="${s.autor === a.key}">${esc(a.nome)} <small>${a.n}</small></button>`).join("") || `<span class="count">Sem autoria registrada nesta seleção.</span>`;
      const tgl = this.$('[data-act="toggle-authors"]');
      if (tgl) tgl.textContent = this._authorsAll ? "Mostrar menos" : `Ver todos (${list.length})`;
    }

    activeRowHTML(inSection) {
      const s = this.state;
      const chips = [
        ...(s.q && inSection ? [`<button class="chip" style="--c:#16283b" aria-pressed="true" data-act="clear-q">“${esc(s.q)}”${s.scope !== "tudo" ? ` em ${({ titulo: "títulos", autoria: "autoria", texto: "texto completo" })[s.scope]}` : ""} ${I.x}</button>`] : []),
        ...(s.autor ? [`<button class="chip" style="--c:#123d7a" aria-pressed="true" data-act="autor" data-k="${esc(s.autor)}">Autoria: ${esc((this.autorByKey.get(s.autor) || {}).nome || s.autor)} ${I.x}</button>`] : []),
        ...[...s.temas].map((sl) => { const t = this.temaBySlug.get(sl); return t ? `<button class="chip" style="--c:${t.cor}" aria-pressed="true" data-act="tema" data-slug="${esc(sl)}">${esc(t.nome)} ${I.x}</button>` : ""; }),
        ...(s.de || s.ate ? [`<button class="chip" style="--c:#3b4d61" aria-pressed="true" data-act="clear-anos">${s.de === s.ate ? s.de : `${s.de || "…"}–${s.ate || "…"}`} ${I.x}</button>`] : []),
      ];
      return chips.length ? `<div class="active-row">${chips.join("")}<button class="linkbtn" data-act="clear-all">Limpar ${chips.length > 1 ? "tudo" : ""}</button></div>` : "";
    }

    renderResults() {
      const s = this.state, box = this.$('[data-slot="results"]');
      const res = this.lastResults || [];
      let head = "";
      if (s.sec === "multimidia" && s.sub !== "videos") head += this.showHTML();
      if (s.sec === "multimidia" && s.sub === "videos") head += this.ytHTML();
      if (!res.length) { box.innerHTML = head + this.emptyHTML(); return; }
      const view = this.viewFor(s.sec);
      const slice = res.slice(0, s.shown).map((r) => r.it);
      let body = "";
      if (view === "cards") body = `<div class="grid">${slice.map((it, i) => this.cardHTML(it, i % PAGE)).join("")}</div>`;
      else if (view === "refs") body = this.refsHTML(slice, res.length);
      else body = this.timelineHTML(slice);
      const rest = res.length - s.shown;
      box.innerHTML = head + body + (rest > 0 ? `<div class="more"><button class="cta light" data-act="more">Mostrar mais ${Math.min(PAGE, rest)} de ${fmtN(rest)}</button></div>` : "");
      this.observeMore();
    }

    timelineHTML(items) {
      const s = this.state;
      const group = s.sec === "academico" ? this.prefs.group : (s.ordem === "az" ? "nenhum" : "ano");
      if (group === "nenhum" || s.ordem === "az" || s.ordem === "autor") return `<div class="tl-flat">${items.map((it, i) => this.rowHTML(it, i % PAGE)).join("")}</div>`;
      const groups = [];
      const keyOf = (it) => (group === "tipo" ? it.tipo.slug : it.ano || "s/d");
      items.forEach((it) => {
        const k = keyOf(it);
        let g = groups.find((x) => x.k === k);
        if (!g) { g = { k, items: [], tipo: it.tipo }; groups.push(g); }
        g.items.push(it);
      });
      if (group === "tipo") {
        const order = (this.subtipos[s.sec] || []).map((t) => t.slug);
        groups.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
        return groups.map((g) => `<h3 class="grp-h" style="--c:${g.tipo.cor}">${esc(g.tipo.nome)} <small>${g.items.length}</small></h3><div class="tl-flat">${g.items.map((it, i) => this.rowHTML(it, i % PAGE)).join("")}</div>`).join("");
      }
      let i = 0;
      return groups.map((g) => `<div class="tl-group"><div class="tl-year"><span>${g.k}<small>${g.items.length} ${g.items.length === 1 ? "trabalho" : "trabalhos"}</small></span></div>
        <div class="tl-items">${g.items.map((it) => this.rowHTML(it, i++ % PAGE)).join("")}</div></div>`).join("");
    }

    refOf(it) {
      if (it.referencia) return it.referencia;
      const parts = [it.autores ? it.autores.replace(/\.$/, "") + "." : "", it.titulo + ".", it.veiculo ? it.veiculo + "." : "", [it.cidade, it.editora].filter(Boolean).join(": "), it.ano ? it.ano + "." : ""];
      return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }
    refsHTML(items, total) {
      return `<div class="refs-bar"><span>Referências no formato ABNT, como cadastradas no acervo.</span><button class="cta light sm" data-act="copy-all">${I.copy} Copiar ${fmtN(total)} ${total === 1 ? "referência" : "referências"}</button></div>
        <ol class="refs">${items.map((it, i) => `<li style="--c:${it.cor};--i:${i % PAGE}"><span class="rt" data-open="${it.id}">${this.hl(this.refOf(it))}</span><span class="acts">
        <button class="ibtn" data-act="copy-ref" data-id="${it.id}" aria-label="Copiar referência" title="Copiar referência">${I.copy}</button>
        ${it.arquivo || it.link ? `<a class="ibtn" href="${esc(it.arquivo || it.link)}" target="_blank" rel="noopener" aria-label="Acessar" title="Acessar">${I.ext}</a>` : ""}</span></li>`).join("")}</ol>`;
    }

    emptyHTML(home) {
      return `<div class="empty">${I.book}<h3>Nada encontrado</h3><p>Tente outras palavras, busque em “Tudo” ou remova filtros.</p><p><button class="cta light" data-act="clear-all">${home ? "Limpar busca" : "Limpar busca e filtros"}</button></p></div>`;
    }

    hl(text) {
      const q = norm(this.state.q).trim();
      const src = String(text ?? "");
      if (!q) return esc(src);
      const terms = q.split(/\s+/).filter((x) => x.length > 1);
      const nsrc = norm(src), marks = [];
      terms.forEach((term) => { let p = 0; while ((p = nsrc.indexOf(term, p)) >= 0) { marks.push([p, p + term.length]); p += term.length; } });
      if (!marks.length) return esc(src);
      marks.sort((a, b) => a[0] - b[0]);
      let out = "", last = 0;
      marks.forEach(([a, b]) => { if (a < last) return; out += esc(src.slice(last, a)) + "<mark>" + esc(src.slice(a, b)) + "</mark>"; last = b; });
      return out + esc(src.slice(last));
    }
    thumb(it, w, h) {
      if (it.kind === "video") { const id = youtubeId(it.url); return it.capa ? wixImage(it.capa, w, h) : id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""; }
      return it.capa ? wixImage(it.capa, w, h) : "";
    }
    kickerOf(it) {
      const lbl = it.kind === "acervo" && it.formato && it.sec === "academico" ? it.formato : it.tipo.nome;
      return `<div class="kicker" style="--c:${it.cor}">${esc(lbl)}${it.ano ? ` <span class="yr">· ${it.ano}</span>` : ""}${it.duracao ? ` <span class="yr">· ${esc(it.duracao)}</span>` : ""}</div>`;
    }
    actsHTML(it) {
      const a = [];
      if (it.kind === "acervo") a.push(`<button class="ibtn" data-act="copy-ref" data-id="${it.id}" title="Copiar referência" aria-label="Copiar referência">${I.copy}</button>`);
      if (it.arquivo) a.push(`<a class="ibtn" href="${esc(it.arquivo)}" target="_blank" rel="noopener" title="Baixar arquivo" aria-label="Baixar arquivo">${I.pdf}</a>`);
      else if (it.link) a.push(`<a class="ibtn" href="${esc(it.link)}" target="_blank" rel="noopener" title="Acessar" aria-label="Acessar">${I.ext}</a>`);
      return `<span class="acts">${a.join("")}</span>`;
    }
    rowHTML(it, i) {
      const temas = it.temas.slice(0, 3).map((t) => `<span class="tag" style="--c:${t.cor}">${esc(t.nome)}</span>`).join("");
      const venue = [it.veiculo, it.editora, it.cidade].filter(Boolean).join(" · ");
      return `<article class="row" style="--c:${it.cor};--i:${i}" data-open="${it.id}" tabindex="0" role="button" aria-label="${esc(it.titulo)}">
        ${this.kickerOf(it)}<div><h3>${this.hl(it.titulo)}</h3>${it.autores ? `<p class="authors">${this.hl(it.autores)}</p>` : ""}${venue ? `<p class="venue">${this.hl(venue)}</p>` : ""}${!it.autores && it.resumo ? `<p class="excerpt">${this.hl(it.resumo.slice(0, 200))}</p>` : ""}${this.hitHTML(it)}</div>
        ${this.actsHTML(it)}${temas ? `<div class="foot">${temas}</div>` : ""}</article>`;
    }
    cardHTML(it, i) {
      const temas = it.temas.slice(0, 3).map((t) => `<span class="tag" style="--c:${t.cor}">${esc(t.nome)}</span>`).join("");
      let media = "";
      if (it.kind !== "acervo" || it.capa) {
        const img = this.thumb(it, 640, it.kind === "acervo" ? 800 : 400);
        media = `<div class="media${it.kind === "acervo" ? " portrait" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}${it.kind === "video" ? `<span class="play"><i>${I.play}</i></span>` : ""}${it.kind === "podcast" ? `<span class="play" style="--pc:#15803d"><i>${I.play}</i></span>` : ""}${it.duracao && it.kind === "video" ? `<span class="dur">${esc(it.duracao)}</span>` : ""}</div>`;
      }
      const ods = it.ods && it.ods.length ? `<div class="ods">${it.ods.map((n) => `<span style="--o:${ODS_CORES[n]}" title="ODS ${n} · ${ODS_NOMES[n]}">${n}</span>`).join("")}</div>` : "";
      const hit = this.hitHTML(it);
      const excerpt = hit || (it.sec !== "academico" && it.resumo ? `<p class="excerpt">${this.hl(it.resumo.slice(0, 240))}</p>` : "");
      return `<article class="card" style="--c:${it.cor};--i:${i}" data-open="${it.id}" tabindex="0" role="button" aria-label="${esc(it.titulo)}">
        ${media}<div class="body">${this.kickerOf(it)}<h3>${this.hl(it.titulo)}</h3>${it.autores && it.kind === "acervo" ? `<p class="authors">${this.hl(it.autores)}</p>` : ""}${it.veiculo ? `<p class="venue">${this.hl(it.veiculo)}</p>` : ""}${excerpt}${ods}
        <div class="foot">${temas}${this.actsHTML(it)}</div></div></article>`;
    }
    showHTML() {
      return `<div class="show"><div><div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <span class="eyebrow" style="color:#9fe3b5">Podcast</span><h3>Vozes do Território</h3>
        <p>Histórias, lutas e saberes de pescadores, educadoras e lideranças de comunidades tradicionais.</p>
        <a class="cta spot" href="https://open.spotify.com/show/${this.cfg.spotifyShow}" target="_blank" rel="noopener">Seguir no Spotify ${I.ext}</a></div>
        <iframe title="Vozes do Território no Spotify" loading="lazy" src="https://open.spotify.com/embed/show/${this.cfg.spotifyShow}?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`;
    }
    ytHTML() {
      return `<div class="show" style="background:linear-gradient(135deg,#3a1414,#16283b)"><div>
        <span class="eyebrow" style="color:#ffb3b3">YouTube</span><h3>OTSS Bocaina</h3>
        <p>Encontros, plenárias, formações e registros dos territórios.</p>
        <a class="cta yt" href="${this.cfg.youtube}?sub_confirmation=1" target="_blank" rel="noopener">Inscrever-se no canal ${I.ext}</a></div>
        <div style="color:#d6e4ef;font-size:14px">Novos vídeos entram pelo CMS (coleção <b>Biblioteca · Vídeos e Podcast</b>): basta colar o link do YouTube.</div></div>`;
    }

    /* ----- autocompletar ----- */
    suggest(box, q) {
      const ac = box.querySelector(".ac"), input = box.querySelector("input");
      const nq = norm(q).trim();
      if (nq.length < 2 || !this.ready) { this.closeAC(box); return; }
      const res = this.sortRes(this.matchQ(this.items, q), "").slice(0, 6);
      const total = this.matchQ(this.items, q).length;
      const terms = nq.split(/\s+/);
      const auts = this.state.scope === "titulo" ? [] : this.autores.filter((a) => terms.every((t) => norm(a.nome).includes(t))).slice(0, 3);
      const temas = this.state.scope !== "tudo" ? [] : this.temas.filter((t) => terms.every((x) => norm(t.nome + " " + t.eixo).includes(x))).slice(0, 3);
      const opts = [];
      let html = "";
      if (res.length) {
        html += `<h5>Itens</h5>` + res.map(({ it }) => { opts.push({ t: "item", id: it.id }); return `<button class="opt" role="option" data-i="${opts.length - 1}" style="--c:${it.cor}"><span class="d"></span><span class="t">${this.hl(it.titulo)}</span><small>${esc(it.kind === "acervo" && it.formato && it.sec === "academico" ? it.formato : it.tipo.nome)}${it.ano ? " · " + it.ano : ""}</small></button>`; }).join("");
      }
      if (auts.length) html += `<h5>Autoria</h5>` + auts.map((a) => { opts.push({ t: "autor", k: a.key }); return `<button class="opt" role="option" data-i="${opts.length - 1}" style="--c:#123d7a"><span class="d"></span><span class="t">${this.hl(a.nome)}</span><small>${a.n} ${a.n === 1 ? "trabalho" : "trabalhos"}</small></button>`; }).join("");
      if (temas.length) html += `<h5>Temas</h5>` + temas.map((t) => { opts.push({ t: "tema", slug: t.slug }); return `<button class="opt" role="option" data-i="${opts.length - 1}" style="--c:${t.cor}"><span class="d"></span><span class="t">${this.hl(t.nome)}</span><small>${esc(t.eixo)}</small></button>`; }).join("");
      opts.push({ t: "all" });
      html += total ? `<button class="opt all" role="option" data-i="${opts.length - 1}">Ver todos os ${fmtN(total)} resultados para “${esc(q)}” →</button>` : `<div class="none">Nenhum item com “${esc(q)}”. Pressione Enter para buscar mesmo assim.</div>`;
      ac.innerHTML = html;
      box._opts = opts; box._sel = -1;
      box.classList.add("open");
      input.setAttribute("aria-expanded", "true");
    }
    closeAC(box) {
      (box ? [box] : this.$$(".sbox")).forEach((b) => { b.classList.remove("open"); b._sel = -1; const i = b.querySelector("input"); i && i.setAttribute("aria-expanded", "false"); });
    }
    pickAC(box, idx) {
      const o = box._opts && box._opts[idx];
      const input = box.querySelector("input");
      this.closeAC(box);
      if (!o || o.t === "all") { this.commitSearch(input.value); return; }
      if (o.t === "item") { const it = this.byId.get(o.id); if (it) this.openItem(it); return; }
      if (o.t === "autor") { input.value = ""; this.go({ q: "", sec: "academico", sub: "", autor: o.k, scrollTop: true }); return; }
      if (o.t === "tema") { input.value = ""; this.go({ q: "", temas: new Set([o.slug]), sec: this.state.sec === "inicio" ? "academico" : this.state.sec, scrollTop: true }); }
    }
    commitSearch(q) {
      q = String(q || "").trim();
      this.go({ q, scrollTop: true });
      this.$$('.sbox input[type="search"]').forEach((i) => (i.value = q));
    }

    /* ----- detalhe ----- */
    openItem(it) {
      this.openId = it.id;
      this.lastFocus = this.root.activeElement;
      this.closeAC();
      const d = this.$(".drawer");
      d.style.setProperty("--c", it.cor);
      d.innerHTML = `<div class="dhead">${this.kickerOf(it)}
        <button class="ibtn" data-act="share" title="Copiar link" aria-label="Copiar link deste item">${I.link}</button>
        <button class="ibtn" data-act="close" aria-label="Fechar">${I.x}</button></div><div class="dbody">${this.detailHTML(it)}</div>`;
      this.$(".scrim").classList.add("on");
      requestAnimationFrame(() => { d.classList.add("on"); d.focus({ preventScroll: true }); });
      this.writeHash();
    }
    closeItem() {
      const d = this.$(".drawer");
      if (!d.classList.contains("on")) return;
      d.classList.remove("on");
      this.$(".scrim").classList.remove("on");
      setTimeout(() => { if (!d.classList.contains("on")) d.innerHTML = ""; }, 600);
      this.openId = "";
      this.writeHash();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
    }
    relatedOf(it) {
      const t = new Set(it.temas.map((x) => x.slug));
      return this.items.filter((o) => o.id !== it.id).map((o) => {
        let sc = 0;
        o.aut.forEach((a) => { if (it.autKeys.has(a.key)) sc += 3; });
        o.temas.forEach((x) => { if (t.has(x.slug)) sc += 1.2; });
        if (o.sub === it.sub && o.sub) sc += 0.4;
        return { o, sc };
      }).filter((r) => r.sc >= 1.2).sort((a, b) => b.sc - a.sc || (b.o.ano || 0) - (a.o.ano || 0)).slice(0, 5).map((r) => r.o);
    }
    detailHTML(it) {
      const temas = it.temas.length ? `<div class="chips" style="margin:14px 0">${it.temas.map((t) => `<button class="chip" style="--c:${t.cor}" data-act="tema-go" data-slug="${esc(t.slug)}">${esc(t.nome)}</button>`).join("")}</div>` : "";
      const btn = [];
      if (it.arquivo) btn.push(`<a class="cta dark" href="${esc(it.arquivo)}" target="_blank" rel="noopener">${I.pdf} Baixar arquivo</a>`);
      if (it.link) btn.push(`<a class="cta ${it.arquivo ? "light" : "dark"}" href="${esc(it.link)}" target="_blank" rel="noopener">${I.ext} ${it.kind === "tecnologia" ? "Ver página completa" : "Acessar"}</a>`);
      const rel = this.relatedOf(it);
      const relHTML = rel.length ? `<div class="blk"><h4>Relacionados</h4><div class="related">${rel.map((o) => `<button style="--c:${o.cor}" data-open="${o.id}"><b>${esc(o.titulo)}</b><small>${esc(o.kind === "acervo" && o.formato && o.sec === "academico" ? o.formato : o.tipo.nome)}${o.ano ? " · " + o.ano : ""}</small></button>`).join("")}</div></div>` : "";

      if (it.kind === "video") {
        const vid = youtubeId(it.url), pl = playlistId(it.url);
        const src = pl ? `https://www.youtube-nocookie.com/embed/videoseries?list=${pl}` : `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`;
        return `<div class="embed"><iframe src="${src}" title="${esc(it.titulo)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
          <h2>${esc(it.titulo)}</h2>${it.data ? `<p class="venue">${fmtData(it.data)}</p>` : ""}${temas}<p class="rich">${esc(it.resumo)}</p>
          <div class="btnrow"><a class="cta yt" href="${esc(it.url)}" target="_blank" rel="noopener">Ver no YouTube ${I.ext}</a></div>${relHTML}`;
      }
      if (it.kind === "podcast") {
        const ep = spotifyId(it.url);
        return `${ep ? `<iframe style="width:100%;height:232px;border:0;border-radius:14px;margin-bottom:20px" loading="lazy" src="https://open.spotify.com/embed/episode/${ep}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="${esc(it.titulo)}"></iframe>` : ""}
          <h2>${esc(it.titulo)}</h2><p class="venue">${esc(it.serie)}${it.data ? " · " + fmtData(it.data) : ""}${it.duracao ? " · " + esc(it.duracao) : ""}</p>${temas}
          <p class="rich">${esc(it.resumo)}</p><div class="btnrow"><a class="cta spot" href="${esc(it.url)}" target="_blank" rel="noopener">Ouvir no Spotify ${I.ext}</a></div>${relHTML}`;
      }
      if (it.kind === "tecnologia") {
        const img = wixImage(it.capa, 1200, 700);
        return `${img ? `<img class="hero-img" src="${esc(img)}" alt="">` : ""}<h2>${esc(it.titulo)}</h2>${temas}
          ${it.ods.length ? `<div class="blk"><h4>Objetivos de Desenvolvimento Sustentável</h4><div class="ods">${it.ods.map((n) => `<span style="--o:${ODS_CORES[n]};padding:0 8px" title="${ODS_NOMES[n]}">${n} · ${ODS_NOMES[n]}</span>`).join("")}</div></div>` : ""}
          <div class="blk rich">${sanitizeHTML(it.resumoHTML)}</div>
          ${it.problema ? `<div class="blk"><h4>Problema enfrentado</h4><p>${esc(it.problema)}</p></div>` : ""}
          ${it.solucao ? `<div class="blk"><h4>Solução adotada</h4><p>${esc(it.solucao)}</p></div>` : ""}
          ${it.resultado ? `<div class="blk"><h4>Resultados alcançados</h4><p>${esc(it.resultado)}</p></div>` : ""}
          ${it.fotos.length ? `<div class="gallery">${it.fotos.map((f) => `<img src="${esc(wixImage(f, 400, 400))}" alt="" loading="lazy">`).join("")}</div>` : ""}
          <div class="btnrow">${btn.join("")}</div>${relHTML}`;
      }
      const hits = this.textHits(it, 6).sort((a, b) => a.page - b.page);
      const pdfDireto = it.ft && it.ft.tipo === "pdf" && /\.pdf($|\?)|usrfiles\.com/i.test(it.arquivo || it.ft.fonte || "");
      const base = it.arquivo || it.ft?.fonte || "";
      const ftTag = it.ft ? `<span class="fttag">✓ ${it.ft.tipo === "resumo" ? "Resumo da revista pesquisável" : `Texto completo pesquisável${it.ft.tipo === "pdf" ? ` · ${it.ft.pages.length} p.` : ""}`}</span>` : "";
      const hitsHTML = hits.length ? `<div class="blk"><h4>Trechos encontrados para “${esc(this.state.q)}”</h4><div class="hits">${hits.map((h) => {
        const label = h.page ? `Página ${h.page}` : it.ft.tipo === "resumo" ? "Resumo" : "Texto";
        return pdfDireto && h.page ? `<a href="${esc(base)}#page=${h.page}" target="_blank" rel="noopener"><b>${label} ↗</b>${this.hl(h.text)}</a>` : `<div><b>${label}</b>${this.hl(h.text)}</div>`;
      }).join("")}</div></div>` : "";
      const capa = it.capa ? wixImage(it.capa, 900) : "";
      const vid = youtubeId(it.video);
      const autChips = it.aut.length ? `<div class="chips" style="margin:6px 0 4px">${it.aut.map((a) => `<button class="au" style="--c:#123d7a" data-act="autor-go" data-k="${esc(a.key)}">${esc(a.display)} <small>${(this.autorByKey.get(a.key) || {}).n || 1}</small></button>`).join("")}</div>` : "";
      const rows = [["Formato", it.formato], ["Publicado em", it.veiculo], ["Editora", it.editora], ["Local", it.cidade], ["Ano", it.ano],
        ["Projetos", (it.projetos || []).join(", ")], ["Palavras-chave", (it.palavras || []).join(", ")]].filter((r) => r[1]);
      return `${capa ? `<img class="hero-img" src="${esc(capa)}" alt="Capa de ${esc(it.titulo)}" style="max-width:300px">` : ""}
        <h2>${esc(it.titulo)}</h2>${autChips}${ftTag}${temas}${hitsHTML}
        ${it.resumo ? `<p class="rich">${esc(it.resumo)}</p>` : ""}
        <dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        <div class="ref"><small>Como citar (ABNT)</small>${esc(this.refOf(it))}<div class="btnrow" style="margin:12px 0 0"><button class="cta light sm" data-act="copy-ref" data-id="${it.id}">${I.copy} Copiar referência</button></div></div>
        ${vid ? `<div class="embed"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${vid}?rel=0" title="Vídeo relacionado" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ""}
        <div class="btnrow">${btn.join("")}</div>${relHTML}`;
    }

    /* ----- eventos ----- */
    bind() {
      const r = this.root;
      this.$$(".sbox").forEach((box) => {
        const input = box.querySelector("input");
        let t;
        input.addEventListener("input", () => {
          clearTimeout(t);
          box.classList.toggle("has-q", !!input.value);
          this.suggest(box, input.value);
          t = setTimeout(() => {
            const v = input.value.trim();
            if (this.state.sec !== "inicio" || this.state.q || !v) { if (v !== this.state.q) this.go({ q: v }, { scroll: false }); }
          }, 260);
        });
        input.addEventListener("focus", () => { this.loadFulltext(); if (input.value.trim().length > 1) this.suggest(box, input.value); });
        input.addEventListener("keydown", (e) => {
          const opts = box._opts || [];
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!box.classList.contains("open")) return;
            e.preventDefault();
            box._sel = (box._sel + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
            box.querySelectorAll(".opt").forEach((o) => o.setAttribute("aria-selected", String(+o.dataset.i === box._sel)));
            const cur = box.querySelector(`.opt[data-i="${box._sel}"]`); cur && cur.scrollIntoView({ block: "nearest" });
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (box.classList.contains("open") && box._sel >= 0) this.pickAC(box, box._sel);
            else { this.closeAC(box); this.commitSearch(input.value); }
          } else if (e.key === "Escape") { this.closeAC(box); }
        });
        box.querySelector(".ac").addEventListener("mousedown", (e) => e.preventDefault());
        box.querySelector(".ac").addEventListener("click", (e) => { const o = e.target.closest(".opt"); if (o) this.pickAC(box, +o.dataset.i); });
        if (box.classList.contains("mini")) box.addEventListener("click", () => { if (!box.classList.contains("expand") && this.$(".nav").clientWidth < 760) { box.classList.add("expand"); input.focus(); } });
        input.addEventListener("blur", () => setTimeout(() => { if (!box.contains(this.root.activeElement)) { this.closeAC(box); if (!input.value) box.classList.remove("expand"); } }, 120));
      });
      this._onKey = (e) => {
        const path = e.composedPath ? e.composedPath() : [];
        const typing = path.some((n) => n && (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable));
        if (e.key === "/" && !typing) {
          e.preventDefault();
          const heroVisible = this.$(".hero").getBoundingClientRect().bottom > 120;
          const inp = heroVisible ? this.$("#q-hero") : this.$("#q-mini");
          if (!heroVisible) this.$(".mini").classList.add("expand");
          inp.focus(); inp.select();
        }
        if (e.key === "Escape" && this.openId) this.closeItem();
      };
      document.addEventListener("keydown", this._onKey);
      this._onResize = () => { this.movePill(); this.moveKnob(); };
      addEventListener("resize", this._onResize);

      r.addEventListener("change", (e) => {
        const id = e.target.id, s = this.state;
        if (id === "de" || id === "ate") {
          s[id] = e.target.value;
          if (s.de && s.ate && +s.de > +s.ate) [s.de, s.ate] = [s.ate, s.de];
          this.go({});
        }
        if (id === "ordem") this.go({ ordem: e.target.value });
        if (id === "grp") { this.prefs.group = e.target.value; this.savePrefs(); this.go({}); }
      });

      r.addEventListener("click", (e) => {
        const actEl = e.target.closest("[data-act]");
        const act = actEl && actEl.dataset.act;
        const s = this.state;
        if (act) {
          switch (act) {
            case "sec": {
              const patch = { sec: actEl.dataset.sec, sub: "" };
              if (actEl.dataset.sec === "inicio") Object.assign(patch, { q: "", temas: new Set(), de: "", ate: "", autor: "" });
              this.go(patch); return;
            }
            case "sec-sub": this.go({ sec: actEl.dataset.sec, sub: actEl.dataset.sub }); return;
            case "sub": this.go({ sub: actEl.dataset.sub }); return;
            case "suggest": this.commitSearch(actEl.dataset.q); return;
            case "go": this.closeAC(); this.commitSearch(this.$("#q-hero").value); return;
            case "scope": s.scope = actEl.dataset.v; this.syncChrome(); if (s.q) this.go({}); { const b = this.$('[data-sbox="hero"]'); const i = b.querySelector("input"); if (i.value) this.suggest(b, i.value); } return;
            case "tema": { const t = new Set(s.temas); t.has(actEl.dataset.slug) ? t.delete(actEl.dataset.slug) : t.add(actEl.dataset.slug); this.go({ temas: t }, { scroll: false }); return; }
            case "tema-go": this.closeItem(); this.go({ temas: new Set([actEl.dataset.slug]), q: "", sec: s.sec === "inicio" ? "academico" : s.sec, scrollTop: true }); return;
            case "autor": this.go({ autor: s.autor === actEl.dataset.k ? "" : actEl.dataset.k }, { scroll: false }); return;
            case "autor-go": this.closeItem(); this.go({ autor: actEl.dataset.k, sec: "academico", sub: "", q: "", scrollTop: true }); return;
            case "year": { const y = actEl.dataset.y; const same = s.de === y && s.ate === y; this.go({ de: same ? "" : y, ate: same ? "" : y }, { scroll: false }); return; }
            case "toggle-authors": this._authorsAll = !this._authorsAll; this.renderSection(); return;
            case "clear-q": this.$$('.sbox input[type="search"]').forEach((i) => (i.value = "")); this.closeAC(); this.go({ q: "" }, { scroll: false }); return;
            case "clear-anos": this.go({ de: "", ate: "" }, { scroll: false }); return;
            case "clear-all": this.$$('.sbox input[type="search"]').forEach((i) => (i.value = "")); this.go({ q: "", temas: new Set(), de: "", ate: "", autor: "", ordem: "relevancia" }, { scroll: false }); return;
            case "toggle-filters": s.filtersOpen = !s.filtersOpen; this.$(".fpanel").classList.toggle("open", s.filtersOpen); actEl.setAttribute("aria-expanded", String(s.filtersOpen)); return;
            case "view": this.prefs.view[s.sec] = actEl.dataset.v; this.savePrefs(); s.shown = PAGE; this.renderSection(); return;
            case "more": s.shown += PAGE; this.renderResults(); return;
            case "rail": { const rail = this.$(".rail"); rail.scrollBy({ left: +actEl.dataset.dir * rail.clientWidth * 0.9, behavior: "smooth" }); return; }
            case "close": this.closeItem(); return;
            case "copy-ref": { e.stopPropagation(); const it = this.byId.get(actEl.dataset.id); if (it) this.copy(this.refOf(it), "Referência copiada"); return; }
            case "copy-all": this.copy((this.lastResults || []).map((x) => this.refOf(x.it)).join("\n\n"), `${fmtN((this.lastResults || []).length)} referências copiadas`); return;
            case "share": this.copy(location.href.split("#")[0] + "#item=" + this.openId, "Link copiado"); return;
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
      this._onDocClick = (e) => { if (!e.composedPath().includes(this)) this.closeAC(); };
      document.addEventListener("click", this._onDocClick);
      this.bindForm();
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
      for (const k of ["first_name", "email", "titulo_publicacao"]) {
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

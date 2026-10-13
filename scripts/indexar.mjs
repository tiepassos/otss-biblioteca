// Indexador de texto completo da Biblioteca OTSS.
// Lê as coleções do CMS (como visitante anônimo), baixa os documentos de cada item
// e grava o texto, página a página, em index/textos.json para a busca da página.
// Incremental: só baixa de novo o que mudou (link, arquivo ou data de atualização).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const CLIENT_ID = process.env.OTSS_CLIENT_ID || "cbb20194-95fa-4ccf-a02b-fce35da284af";
const SITE_ID = "eef6fc1a-2e9b-47d7-b175-68ea9b7828ab";
const API = "https://www.wixapis.com";
const OUT = new URL("../index/textos.json", import.meta.url);
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_PAGES = 400;
const MAX_CHARS = 350_000;
const UA = "Mozilla/5.0 (compatible; OTSS-Biblioteca-Indexador/1.0; +https://www.otss.org.br/biblioteca)";

const log = (...a) => console.log(...a);

async function token() {
  const r = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: CLIENT_ID, grantType: "anonymous" }) });
  if (!r.ok) throw new Error("token " + r.status);
  return (await r.json()).access_token;
}
async function queryAll(tok, collection) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${API}/wix-data/v2/items/query`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: tok }, body: JSON.stringify({ dataCollectionId: collection, query: { paging: { limit: 1000, offset } } }) });
    if (!r.ok) throw new Error(`${collection} ${r.status}`);
    const items = ((await r.json()).dataItems || []).map((i) => i.data);
    out.push(...items);
    if (items.length < 1000) break;
  }
  return out;
}

const wixDocument = (uri) => {
  const m = String(uri || "").match(/^wix:document:\/\/v1\/(?:ugd\/)?([^/]+)/);
  return m ? `https://${SITE_ID}.usrfiles.com/ugd/${m[1]}` : "";
};
function candidates(link) {
  let u;
  try { u = new URL(link); } catch { return []; }
  const h = u.hostname.replace(/^www\./, "");
  const drive = link.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]{20,})/);
  if (drive) return [`https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`];
  const gdoc = link.match(/docs\.google\.com\/document\/d\/([\w-]{20,})/);
  if (gdoc) return [`https://docs.google.com/document/d/${gdoc[1]}/export?format=txt`];
  if (/drive\.google\.com\/drive\/folders/.test(link) || h === "scribd.com" || h === "researchgate.net") return [];
  return [link];
}

async function get(url, accept = "*/*") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, Accept: accept } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const len = +r.headers.get("content-length") || 0;
    if (len > MAX_BYTES) throw new Error("arquivo grande demais");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("arquivo grande demais");
    return { buf, type: (r.headers.get("content-type") || "").toLowerCase(), url: r.url };
  } finally { clearTimeout(t); }
}
const isPDF = (buf) => buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
const clean = (s) => s.replace(/\u0000/g, "").replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim();

async function pdfPages(buf) {
  const doc = await getDocument({ data: buf, useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];
  let total = 0;
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let s = "";
    for (const it of tc.items) s += (it.str || "") + (it.hasEOL ? "\n" : " ");
    s = clean(s);
    pages.push(s);
    total += s.length;
    if (total > MAX_CHARS) break;
  }
  await doc.destroy();
  return pages;
}
const decodeHTML = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
function metas(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "gi");
  return [...html.matchAll(re)].map((m) => decodeHTML((m[0].match(/content=["']([^"']*)["']/i) || [])[1] || "")).filter(Boolean);
}

async function extract(link) {
  for (const url of candidates(link)) {
    const r = await get(url, "application/pdf,text/html;q=0.9,*/*;q=0.8");
    if (isPDF(r.buf)) return { fonte: link, tipo: "pdf", paginas: await pdfPages(r.buf) };
    const text = new TextDecoder("utf-8").decode(r.buf);
    if (r.type.includes("text/plain")) return { fonte: link, tipo: "texto", paginas: [clean(text).slice(0, MAX_CHARS)] };
    if (r.type.includes("html")) {
      const pdf = metas(text, "citation_pdf_url")[0];
      if (pdf) {
        try {
          const p = await get(new URL(pdf, r.url).href, "application/pdf");
          if (isPDF(p.buf)) return { fonte: link, tipo: "pdf", paginas: await pdfPages(p.buf) };
        } catch (e) { log("   pdf da revista falhou:", e.message); }
      }
      const resumo = [...metas(text, "citation_abstract"), ...metas(text, "DC.Description"), ...metas(text, "dc.description"), ...metas(text, "citation_keywords"), ...metas(text, "og:description")];
      const uniq = [...new Set(resumo.map(clean))].filter((s) => s.length > 40);
      if (uniq.length) return { fonte: link, tipo: "resumo", paginas: [uniq.join(" ").slice(0, 20_000)] };
      throw new Error("página sem PDF nem resumo");
    }
    throw new Error("formato não suportado: " + (r.type || "?"));
  }
  throw new Error("link não indexável");
}

async function main() {
  let prev = { itens: {} };
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* primeira execução */ }
  const tok = await token();
  const [acervo, tecs] = await Promise.all([queryAll(tok, "BibliotecaAcervo"), queryAll(tok, "BibliotecaTecnologias")]);
  const alvos = [
    ...acervo.filter((d) => d.visivel !== false).map((d) => ({ id: d._id, titulo: d.titulo, link: wixDocument(d.arquivo) || d.link, upd: d._updatedDate?.$date, tipo: d.tipo, todo: !!d.arquivo })),
    ...tecs.filter((d) => d.visivel !== false && d.arquivo).map((d) => ({ id: d._id, titulo: d.title, link: wixDocument(d.arquivo), upd: d._updatedDate?.$date })),
  ].filter((a) => a.link && /^https?:/i.test(a.link));

  // um mesmo PDF ligado a vários itens (ex.: livro inteiro linkado em cada capítulo) só vale
  // para o item que representa o documento todo; nos demais, a busca no texto enganaria.
  const tipos = Object.fromEntries((await queryAll(tok, "BibliotecaTipos")).map((t) => [t._id, t.slug]));
  const usos = {};
  alvos.forEach((a) => (usos[a.link] = (usos[a.link] || 0) + 1));
  const inteiro = (a) => a.todo || ["livros", "publicacoes-otss", "cadernos", "teses-dissertacoes"].includes(tipos[a.tipo]);

  const itens = {}, falhas = {}, docs = {}, docKey = {};
  let novos = 0, reaproveitados = 0;
  for (const a of alvos) {
    if (usos[a.link] > 1 && !inteiro(a)) { falhas[a.id] = { fonte: a.link, upd: a.upd, motivo: `documento compartilhado por ${usos[a.link]} itens (obra inteira)`, em: prev.falhas?.[a.id]?.em || new Date().toISOString() }; continue; }
    const old = prev.itens?.[a.id];
    const oldPages = old && (old.paginas || prev.docs?.[old.doc]);
    if (old && old.fonte === a.link && old.upd === a.upd && oldPages) {
      const k = docKey[a.link] || (docKey[a.link] = "d" + Object.keys(docs).length);
      docs[k] = oldPages;
      itens[a.id] = { fonte: a.link, tipo: old.tipo, upd: a.upd, doc: k };
      reaproveitados++; continue;
    }
    const oldFail = prev.falhas?.[a.id];
    if (oldFail && oldFail.fonte === a.link && oldFail.upd === a.upd && !/compartilhado/.test(oldFail.motivo) && Date.now() - Date.parse(oldFail.em) < 7 * 864e5) { falhas[a.id] = oldFail; continue; }
    if (docKey[a.link]) { const k = docKey[a.link]; itens[a.id] = { fonte: a.link, tipo: Object.values(itens).find((x) => x.doc === k)?.tipo || "pdf", upd: a.upd, doc: k }; continue; }
    try {
      log(`→ ${a.titulo.slice(0, 70)}`);
      const r = await extract(a.link);
      const chars = r.paginas.reduce((n, p) => n + p.length, 0);
      if (chars < 200) throw new Error("pouco texto extraído (PDF digitalizado?)");
      const k = (docKey[a.link] = "d" + Object.keys(docs).length);
      docs[k] = r.paginas;
      itens[a.id] = { fonte: a.link, tipo: r.tipo, upd: a.upd, doc: k };
      novos++;
      log(`   ok: ${r.tipo}, ${r.paginas.length} pág., ${chars.toLocaleString("pt-BR")} caracteres`);
    } catch (e) {
      falhas[a.id] = { fonte: a.link, upd: a.upd, motivo: e.message, em: new Date().toISOString() };
      log(`   falhou: ${e.message}`);
    }
  }
  const out = { geradoEm: new Date().toISOString(), total: Object.keys(itens).length, itens, docs, falhas };
  if (JSON.stringify({ itens, docs, falhas }) === JSON.stringify({ itens: prev.itens || {}, docs: prev.docs || {}, falhas: prev.falhas || {} })) {
    log(`\nSem mudanças · ${out.total} documentos indexados.`);
    return;
  }
  await mkdir(new URL("../index/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  const bytes = Buffer.byteLength(JSON.stringify(out));
  log(`\nIndexados: ${out.total} (${novos} novos, ${reaproveitados} sem mudança) · falhas: ${Object.keys(falhas).length} · ${(bytes / 1048576).toFixed(1)} MB`);
}
main().catch((e) => { console.error(e); process.exit(1); });

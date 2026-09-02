"use strict";
(() => {

const SEZIONI = ["Portieri", "Difensori", "Centrocampisti", "Attaccanti"];
const RUOLO = { Portieri: "P", Difensori: "D", Centrocampisti: "C", Attaccanti: "A" };
const SEZ_DI = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const MODULI = [
  { n: "3-4-3", D: 3, C: 4, A: 3 }, { n: "3-5-2", D: 3, C: 5, A: 2 },
  { n: "4-3-3", D: 4, C: 3, A: 3 }, { n: "4-4-2", D: 4, C: 4, A: 2 },
  { n: "4-5-1", D: 4, C: 5, A: 1 }, { n: "5-3-2", D: 5, C: 3, A: 2 },
  { n: "5-4-1", D: 5, C: 4, A: 1 },
];
const $ = (id) => document.getElementById(id);
const api = window.fantasta;

let LIST = {}, PER_K = {}, POS = {};
let S = statoIniziale();
let vista = "listone", ruoloAttivo = "", soloLiberi = false, soloMiei = false, squadraFiltro = "";

function statoIniziale() {
  const part = [];
  for (let i = 1; i <= 8; i++) part.push({ id: "p" + i, nome: i === 1 ? "Io" : "Squadra " + i });
  return { v: 1, part, io: "p1", budget: 500, slots: { P: 3, D: 8, C: 8, A: 6 }, ass: {}, modulo: {} };
}
function indicizza() {
  PER_K = {}; POS = {};
  for (const sez of SEZIONI) (LIST[sez] || []).forEach((p, i) => { PER_K[p.k] = p; POS[p.k] = i + 1; });
}

/* ─────────────── utilita' ─────────────── */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nz = (v) => (v === null || v === undefined || v === "" ? "–" : v);
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const partDi = (id) => S.part.find((x) => x.id === id);
const nomePart = (id) => (partDi(id) || {}).nome || "?";
const spesi = (pid) => Object.values(S.ass).reduce((s, a) => s + (a.p === pid ? (a.c || 0) : 0), 0);

let tToast = null;
function toast(m) {
  const t = $("toast"); t.textContent = m; t.classList.add("su");
  clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove("su"), 2400);
}
function spia(ok, txt) {
  $("spia").className = "dot" + (ok ? "" : " warn");
  $("spiaTxt").textContent = txt;
}

/* ─────────────── salvataggio ─────────────── */
let tSalva = null, salvando = false, daSalvare = false;
function salva() {
  daSalvare = true;
  clearTimeout(tSalva);
  tSalva = setTimeout(scrivi, 250);
}
async function scrivi() {
  if (salvando || !daSalvare) return;
  salvando = true; daSalvare = false;
  try { await api.statoScrivi(S); spia(true, "salvato"); }
  catch (e) { daSalvare = true; spia(false, "salvataggio non riuscito"); }
  finally {
    salvando = false;
    if (daSalvare) { clearTimeout(tSalva); tSalva = setTimeout(scrivi, 600); }
  }
}

/* ─────────────── rose e formazione ─────────────── */
function rosa(pid) {
  const out = { P: [], D: [], C: [], A: [] };
  for (const [k, a] of Object.entries(S.ass)) {
    if (a.p !== pid) continue;
    const g = PER_K[k];
    if (g) out[g.R].push({ g, c: a.c || 0 });
  }
  for (const r of "PDCA") out[r].sort((x, y) => POS[x.g.k] - POS[y.g.k]);
  return out;
}
const forza = (g) => 1 - (POS[g.k] - 1) / Math.max(1, (LIST[SEZ_DI[g.R]] || []).length);

function formazione(pid) {
  const r = rosa(pid);
  const ord = (k) => r[k].map((x) => x.g).sort((a, b) => forza(b) - forza(a));
  const P = ord("P"), D = ord("D"), C = ord("C"), A = ord("A");
  const scelto = S.modulo[pid];
  let best = null;
  for (const m of MODULI) {
    const ok = P.length >= 1 && D.length >= m.D && C.length >= m.C && A.length >= m.A;
    const val = ok ? forza(P[0]) + D.slice(0, m.D).concat(C.slice(0, m.C), A.slice(0, m.A))
      .reduce((s, g) => s + forza(g), 0) : -1;
    const cand = { m, ok, val, xi: ok ? { P: [P[0]], D: D.slice(0, m.D), C: C.slice(0, m.C), A: A.slice(0, m.A) } : null };
    if (scelto === m.n) { if (cand.ok) { best = cand; break; } }
    else if (ok && (!best || val > best.val)) best = cand;
  }
  const saltato = !!scelto && !(best && best.m && best.m.n === scelto);
  if (!best) best = { m: null, ok: false, val: -1, xi: null };
  best.forzatoSaltato = saltato;
  const dentro = new Set(best.xi ? [].concat(best.xi.P, best.xi.D, best.xi.C, best.xi.A).map((g) => g.k) : []);
  best.panca = [].concat(P, D, C, A).filter((g) => !dentro.has(g.k));
  best.rosa = { P, D, C, A };
  return best;
}

/* ─────────────── listone ─────────────── */
function tabella(sez) {
  const righe = (LIST[sez] || []).map((p, i) => `
    <tr data-k="${esc(p.k)}" data-cerca="${esc(norm(p.n + " " + p.s))}" data-sq="${esc(p.s)}">
      <td class="cPos num">${i + 1}</td>
      <td class="nome"><b>${esc(p.n)}</b><small>${esc(p.rm || "")}${p.f ? " · " + esc(p.f) : ""}</small></td>
      <td class="cSq">${esc(p.s)}</td>
      <td class="cN num cFm">${p.fm ? p.fm.toFixed(2) : "–"}</td>
      <td class="cN num">${nz(p.p)}</td>
      <td class="cN num">${nz(p.g)}</td>
      <td class="cN num">${nz(p.a)}</td>
      <td class="cCamp">${esc(p.c)}</td>
      <td class="cAz">${bottone(p.k)}</td>
    </tr>`).join("");
  return `<section class="sez" data-sez="${sez}">
    <h2>${sez} <em id="meta-${sez}"></em></h2>
    <table><thead><tr>
      <th class="cPos">Pos</th><th>Giocatore</th><th class="cSq">Squadra</th>
      <th class="cN cFm">FM</th><th class="cN">Pres</th><th class="cN">Gol</th><th class="cN">Ass</th>
      <th class="cCamp">Campionato 25/26</th><th class="cAz">Preso da</th>
    </tr></thead><tbody>${righe}</tbody></table>
  </section>`;
}
function bottone(k) {
  const a = S.ass[k];
  if (!a) return `<button class="assegna" data-k="${esc(k)}">Assegna</button>`;
  const mio = a.p === S.io;
  return `<button class="assegna ${mio ? "mia" : "presa"}" data-k="${esc(k)}">${esc(nomePart(a.p))}${a.c ? " · " + a.c : ""}</button>`;
}
function ridisegnaListone() {
  document.querySelectorAll("#sezioni tr[data-k]").forEach((tr) => {
    const k = tr.dataset.k, a = S.ass[k];
    tr.className = (a ? "presa" : "") + (a && a.p === S.io ? " mia" : "");
    tr.querySelector(".cAz").innerHTML = bottone(k);
  });
  filtra();
}
function filtra() {
  const q = norm($("q").value.trim());
  let mostrati = 0, presi = 0, totali = 0;
  for (const sez of SEZIONI) {
    const box = document.querySelector(`.sez[data-sez="${sez}"]`);
    if (!box) continue;
    const attiva = !ruoloAttivo || RUOLO[sez] === ruoloAttivo;
    box.classList.toggle("hide", !attiva);
    let n = 0, pr = 0;
    for (const tr of box.querySelectorAll("tbody tr")) {
      const a = S.ass[tr.dataset.k];
      if (a) pr++;
      let ok = attiva;
      if (ok && q) ok = tr.dataset.cerca.includes(q);
      if (ok && soloLiberi) ok = !a;
      if (ok && soloMiei) ok = !!a && a.p === S.io;
      if (ok && squadraFiltro) ok = tr.dataset.sq === squadraFiltro;
      tr.classList.toggle("hide", !ok);
      if (ok) n++;
    }
    const el = $("meta-" + sez);
    if (el) el.textContent = `${n} in elenco · ${pr} presi su ${(LIST[sez] || []).length}`;
    if (attiva) { mostrati += n; presi += pr; totali += (LIST[sez] || []).length; }
    let vuoto = box.querySelector(".vuoto");
    if (attiva && !n) {
      if (!vuoto) { vuoto = document.createElement("div"); vuoto.className = "vuoto";
        vuoto.textContent = "Nessun giocatore con questi filtri."; box.appendChild(vuoto); }
    } else if (vuoto) vuoto.remove();
  }
  $("conta").textContent = `${mostrati} mostrati · ${totali - presi} liberi`;
}

/* ─────────────── menu assegnazione ─────────────── */
let pop = null;
function chiudiPop() {
  if (!pop) return;
  pop.remove(); pop = null;
  document.removeEventListener("keydown", popTasti, true);
}
function popTasti(e) {
  if (!pop) return;
  if (e.key === "Escape") { e.preventDefault(); chiudiPop(); return; }
  if (e.target && e.target.closest && e.target.closest("input,textarea,select")) return;
  if (e.key >= "1" && e.key <= "9") {
    const b = pop.querySelectorAll(".elenco button[data-p]:not(.libera)")[+e.key - 1];
    if (b) { e.preventDefault(); b.click(); }
  }
}
function apriPop(btn, k) {
  chiudiPop();
  const g = PER_K[k], a = S.ass[k];
  pop = document.createElement("div");
  pop.className = "pop";
  pop.innerHTML = `
    <div class="chi"><b>${esc(g.n)}</b><br>${esc(g.s)} · ${esc(g.c)}</div>
    <div class="prezzo"><input type="number" id="pz" min="0" step="1"
        value="${a && a.c ? a.c : ""}" placeholder="0"><span>crediti</span></div>
    <div class="elenco">
      ${S.part.map((p, i) => `<button data-p="${esc(p.id)}" class="${p.id === S.io ? "io" : ""}">
        ${esc(p.nome)}${p.id === S.io ? " · io" : ""}<span class="kb">${i < 9 ? i + 1 : ""}</span></button>`).join("")}
      ${a ? `<button class="libera" data-p="">Libera il giocatore</button>` : ""}
    </div>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.bottom + 6;
  if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
  pop.style.top = top + "px";
  pop.style.left = Math.max(8, Math.min(r.right - pr.width, window.innerWidth - pr.width - 10)) + "px";
  pop.querySelector("#pz").focus();
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    const pid = b.dataset.p;
    const c = parseInt(pop.querySelector("#pz").value, 10);
    if (pid) S.ass[k] = { p: pid, c: Number.isFinite(c) && c >= 0 ? c : 0 };
    else delete S.ass[k];
    chiudiPop(); salva();
    const tr = document.querySelector(`tr[data-k="${CSS.escape(k)}"]`);
    if (tr) {
      const aa = S.ass[k];
      tr.className = (aa ? "presa" : "") + (aa && aa.p === S.io ? " mia" : "");
      tr.querySelector(".cAz").innerHTML = bottone(k);
      tr.querySelector(".cAz button").focus();
    }
    filtra();
    toast(pid ? `${g.n} → ${nomePart(pid)}` : `${g.n} liberato`);
  });
  document.addEventListener("keydown", popTasti, true);
}

/* ─────────────── squadre ─────────────── */
function renderSquadre() {
  $("griglia").innerHTML = S.part.map((p) => {
    const r = rosa(p.id), sp = spesi(p.id), resta = S.budget - sp;
    const tot = "PDCA".split("").reduce((s, k) => s + r[k].length, 0);
    const caselle = "PDCA".split("").map((k) =>
      `<div class="casella${r[k].length >= S.slots[k] ? " piena" : ""}">
        <b class="num">${r[k].length}/${S.slots[k]}</b>${k}</div>`).join("");
    const el = "PDCA".split("").flatMap((k) => r[k].map((x) =>
      `<li><span class="rr">${k}</span><span class="rn">${esc(x.g.n)}</span>
        <span class="rp num">${x.c || ""}</span></li>`)).join("");
    return `<div class="scheda${p.id === S.io ? " io" : ""}">
      <h3>${esc(p.nome)}${p.id === S.io ? '<span class="bollo">io</span>' : ""}</h3>
      <div class="crediti"><span>Spesi <b class="num oro">${sp}</b></span>
        <span>Restano <b class="num${resta < 0 ? " rosso" : ""}">${resta}</b></span>
        <span>Rosa <b class="num">${tot}</b></span></div>
      <div class="caselle">${caselle}</div>
      ${el ? `<ul class="rosa">${el}</ul>` : `<div class="vuoto" style="padding:12px">Rosa vuota.</div>`}
    </div>`;
  }).join("");
}

/* ─────────────── la mia rosa ─────────────── */
function renderRosa() {
  const pid = S.io, p = partDi(pid);
  if (!p) { $("boxRosa").innerHTML = `<div class="vuoto">Scegli la tua squadra nelle impostazioni.</div>`; return; }
  const f = formazione(pid), r = f.rosa, sp = spesi(pid);
  const tot = "PDCA".split("").reduce((s, k) => s + r[k].length, 0);
  const card = (g) => `<div class="gio"><b>${esc(g.n)}</b><span>${esc(g.s)}</span></div>`;
  const campo = f.ok
    ? `<div class="campo">
        <div class="fila">${f.xi.A.map(card).join("")}</div>
        <div class="fila">${f.xi.C.map(card).join("")}</div>
        <div class="fila">${f.xi.D.map(card).join("")}</div>
        <div class="fila">${f.xi.P.map(card).join("")}</div>
      </div>`
    : `<div class="vuoto">Ancora non basta per una formazione: serve 1 portiere più dieci
        di movimento in una combinazione valida (il minimo è 3-4-3).</div>`;
  const pills = MODULI.map((m) => {
    const ok = r.P.length >= 1 && r.D.length >= m.D && r.C.length >= m.C && r.A.length >= m.A;
    return `<button class="m" data-mod="${m.n}" aria-pressed="${f.m && f.m.n === m.n}" ${ok ? "" : "disabled"}>${m.n}</button>`;
  }).join("");
  $("boxRosa").innerHTML = `
    <div class="pannello" style="max-width:none">
      <h3>${esc(p.nome)}</h3>
      <p class="aiuto">${tot} giocatori · ${sp} crediti spesi · ${S.budget - sp} rimasti.
        ${f.ok ? `Con questa rosa il modulo migliore è <strong>${f.m.n}</strong>.` : ""}
        ${f.forzatoSaltato ? `<br>Il modulo <strong>${esc(S.modulo[pid])}</strong> non è più schierabile: uso l'automatico.` : ""}</p>
      ${campo}
      <div class="moduli"><span style="font-size:12.5px;color:var(--muted)">Modulo:</span>${pills}
        <button class="btn" id="modAuto">Scegli tu</button></div>
    </div>
    <div class="pannello" style="max-width:none">
      <h3>Panchina</h3>
      ${f.panca.length ? `<ul class="rosa">${f.panca.map((g) =>
        `<li><span class="rr">${g.R}</span><span class="rn">${esc(g.n)}</span>
          <span class="rp num">${(S.ass[g.k] || {}).c || ""}</span></li>`).join("")}</ul>`
        : `<div class="vuoto" style="padding:12px">Nessuno in panchina.</div>`}
    </div>`;
  $("boxRosa").querySelectorAll(".m[data-mod]").forEach((b) =>
    b.addEventListener("click", () => { S.modulo[pid] = b.dataset.mod; salva(); renderRosa(); }));
  $("modAuto").addEventListener("click", () => { delete S.modulo[pid]; salva(); renderRosa(); });
}

/* ─────────────── impostazioni ─────────────── */
function renderSetup() {
  $("nPart").value = S.part.length;
  $("budget").value = S.budget;
  for (const k of "PDCA") $("sl" + k).value = S.slots[k];
  $("nomi").innerHTML = S.part.map((p, i) =>
    `<div class="campo-f"><label for="np${i}">Partecipante ${i + 1}</label>
      <input type="text" id="np${i}" data-i="${i}" value="${esc(p.nome)}" maxlength="28"></div>`).join("");
  $("nomi").querySelectorAll("input").forEach((inp) =>
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i;
      S.part[i].nome = inp.value.trim() || "Squadra " + (i + 1);
      salva(); renderSelIo(); ridisegnaListone();
    }));
  renderSelIo();
}
function renderSelIo() {
  $("selIo").innerHTML = S.part.map((p) =>
    `<option value="${esc(p.id)}"${p.id === S.io ? " selected" : ""}>${esc(p.nome)}</option>`).join("");
}
async function cambiaNumero(n) {
  n = Math.max(2, Math.min(20, n | 0));
  if (S.part.length > n) {
    const via = S.part.slice(n).map((p) => p.id);
    const conRosa = via.filter((id) => Object.values(S.ass).some((a) => a.p === id));
    if (conRosa.length) {
      const ok = await api.conferma({
        titolo: "Tolgo " + conRosa.map(nomePart).join(", ") + "?",
        testo: "Perdi anche i giocatori che avevano preso.", ok: "Togli",
      });
      if (!ok) { $("nPart").value = S.part.length; return; }
    }
    S.part = S.part.slice(0, n);
    for (const [k, a] of Object.entries(S.ass)) if (via.includes(a.p)) delete S.ass[k];
    for (const id of via) delete S.modulo[id];
    if (via.includes(S.io)) S.io = S.part[0].id;
  } else {
    while (S.part.length < n) {
      const i = S.part.length + 1;
      S.part.push({ id: "p" + Date.now().toString(36) + i, nome: "Squadra " + i });
    }
  }
  salva(); renderSetup(); ridisegnaListone();
}
function popolaSquadre() {
  const set = new Set();
  for (const sez of SEZIONI) for (const p of LIST[sez] || []) if (p.s) set.add(p.s);
  const attuale = squadraFiltro;
  $("selSquadra").innerHTML = `<option value="">Tutte le squadre</option>` +
    [...set].sort((a, b) => a.localeCompare(b, "it")).map((s) =>
      `<option value="${esc(s)}"${s === attuale ? " selected" : ""}>${esc(s)}</option>`).join("");
}

/* ─────────────── excel ─────────────── */
function fogliExcel() {
  const fogli = [];
  const riep = [["Ruolo", "Pos", "Nome", "Squadra 26/27", "Prezzo", "Preso da",
    "FM 25/26", "Presenze", "Gol", "Assist", "Campionato 25/26"]];
  for (const sez of SEZIONI) for (const p of LIST[sez] || []) {
    const a = S.ass[p.k]; if (!a) continue;
    riep.push([p.R, POS[p.k], p.n, p.s, a.c || 0, nomePart(a.p),
      p.fm ?? "", p.p ?? "", p.g ?? "", p.a ?? "", p.c]);
  }
  fogli.push({ nome: "Riepilogo asta", righe: riep });
  for (const part of S.part) {
    const f = formazione(part.id), r = f.rosa, sp = spesi(part.id);
    const righe = [["Reparto", "Nome", "Squadra", "Prezzo", "In campo", "FM 25/26", "Presenze", "Gol", "Assist"]];
    const dentro = new Set(f.xi ? [].concat(f.xi.P, f.xi.D, f.xi.C, f.xi.A).map((g) => g.k) : []);
    for (const k of "PDCA") for (const g of r[k])
      righe.push([k, g.n, g.s, (S.ass[g.k] || {}).c || 0, dentro.has(g.k) ? "titolare" : "panchina",
        g.fm ?? "", g.p ?? "", g.g ?? "", g.a ?? ""]);
    righe.push([], ["Modulo", f.ok ? f.m.n : "rosa incompleta"],
      ["Crediti spesi", sp], ["Crediti rimasti", S.budget - sp]);
    fogli.push({ nome: part.nome, righe });
  }
  const lis = [["Ruolo", "Pos", "Nome", "Squadra 26/27", "FM 25/26", "Presenze", "Gol", "Assist",
    "Campionato 25/26", "Squadra 25/26", "Fascia guida", "Preso da", "Prezzo"]];
  for (const sez of SEZIONI) for (const p of LIST[sez] || []) {
    const a = S.ass[p.k];
    lis.push([p.R, POS[p.k], p.n, p.s, p.fm ?? "", p.p ?? "", p.g ?? "", p.a ?? "",
      p.c, p.s2, p.f, a ? nomePart(a.p) : "", a ? (a.c || 0) : ""]);
  }
  fogli.push({ nome: "Listone completo", righe: lis });
  return fogli;
}

/* ─────────────── viste ─────────────── */
function vaiA(v) {
  vista = v;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.v === v)));
  $("vListone").classList.toggle("hide", v !== "listone");
  $("vSquadre").classList.toggle("hide", v !== "squadre");
  $("vRosa").classList.toggle("hide", v !== "rosa");
  $("vSetup").classList.toggle("hide", v !== "setup");
  $("corpo").scrollTop = 0;
  if (v === "listone") ridisegnaListone();
  if (v === "squadre") renderSquadre();
  if (v === "rosa") renderRosa();
  if (v === "setup") { renderSetup(); mostraInfo(); }
}
async function mostraInfo() {
  const i = await api.info();
  $("notaInfo").innerHTML = `Fantasta ${esc(i.versione)} · i dati stanno in <code>${esc(i.cartella)}</code>`;
  $("notaListone").textContent = i.listonePersonale
    ? "Stai usando un listone caricato da te."
    : "Stai usando il listone di serie, quello con cui è nata l'app.";
}

/* ─────────────── azioni ─────────────── */
async function aggiornaListone() {
  const r = await api.listoneAggiorna();
  if (r.annullato) return;
  if (r.errore) { toast("Non ci riesco: " + r.errore); return; }
  applicaListone(r.listone, r.file);
}
function applicaListone(nuovo, nomeFile) {
  const primaAss = Object.keys(S.ass).length;
  LIST = nuovo; indicizza();
  let persi = 0;
  for (const k of Object.keys(S.ass)) if (!PER_K[k]) { delete S.ass[k]; persi++; }
  salva();
  $("sezioni").innerHTML = SEZIONI.map(tabella).join("");
  popolaSquadre(); ridisegnaListone(); mostraInfo();
  const tot = SEZIONI.reduce((s, k) => s + (LIST[k] || []).length, 0);
  toast(`Listone aggiornato: ${tot} giocatori` +
    (persi ? ` · ${persi} assegnazioni rimosse (non più in lista)` : primaAss ? " · assegnazioni mantenute" : ""));
}

async function esportaExcel() {
  const r = await api.excelEsporta(fogliExcel());
  if (r.annullato) return;
  toast(r.errore ? "Export non riuscito: " + r.errore : "Excel salvato.");
}
async function azzera() {
  const ok = await api.conferma({
    titolo: "Azzero l'asta?", testo: "Cancello tutte le assegnazioni. Partecipanti e regole restano.",
    ok: "Azzera",
  });
  if (!ok) return;
  S.ass = {}; S.modulo = {};
  salva(); ridisegnaListone(); if (vista !== "listone") vaiA(vista);
  toast("Asta azzerata.");
}

/* ─────────────── avvio ─────────────── */
async function avvia() {
  LIST = (await api.listoneLeggi()) || {};
  for (const sez of SEZIONI) if (!Array.isArray(LIST[sez])) LIST[sez] = [];
  indicizza();
  const salvato = await api.statoLeggi();
  if (salvato && salvato.part && salvato.ass) S = Object.assign(statoIniziale(), salvato);
  if (!partDi(S.io)) S.io = S.part[0] ? S.part[0].id : "p1";
  for (const k of Object.keys(S.ass)) if (!PER_K[k]) delete S.ass[k];

  $("sezioni").innerHTML = SEZIONI.map(tabella).join("");
  popolaSquadre();
  misuraBarra();
  vaiA("listone");
  spia(true, "salvato");

  if (api.smokeAttivo) setTimeout(prova, 300);
}

function misuraBarra() {
  const b = $("barraFiltri");
  if (b) document.documentElement.style.setProperty("--barra", Math.round(b.offsetHeight) + "px");
}

/* ─────────────── eventi ─────────────── */
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => vaiA(t.dataset.v)));
$("sezioni").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]");
  if (b) apriPop(b, b.dataset.k);
});
document.addEventListener("click", (e) => {
  if (pop && !pop.contains(e.target) && !e.target.closest("button[data-k]")) chiudiPop();
});
$("corpo").addEventListener("scroll", chiudiPop, { passive: true });
window.addEventListener("resize", () => { chiudiPop(); misuraBarra(); });
$("q").addEventListener("input", filtra);
document.querySelectorAll(".seg button[data-ruolo]").forEach((b) =>
  b.addEventListener("click", () => {
    ruoloAttivo = b.dataset.ruolo;
    document.querySelectorAll(".seg button[data-ruolo]").forEach((x) =>
      x.setAttribute("aria-pressed", String(x === b)));
    b.classList.toggle("oro", !!ruoloAttivo);
    filtra(); $("corpo").scrollTop = 0;
  }));
$("togLiberi").addEventListener("click", () => {
  soloLiberi = !soloLiberi;
  $("togLiberi").setAttribute("aria-pressed", String(soloLiberi));
  if (soloLiberi && soloMiei) { soloMiei = false; $("togMiei").setAttribute("aria-pressed", "false"); }
  filtra();
});
$("togMiei").addEventListener("click", () => {
  soloMiei = !soloMiei;
  $("togMiei").setAttribute("aria-pressed", String(soloMiei));
  if (soloMiei && soloLiberi) { soloLiberi = false; $("togLiberi").setAttribute("aria-pressed", "false"); }
  filtra();
});
$("selSquadra").addEventListener("change", () => { squadraFiltro = $("selSquadra").value; filtra(); });
$("nPart").addEventListener("change", () => cambiaNumero(+$("nPart").value));
$("selIo").addEventListener("change", () => { S.io = $("selIo").value; salva(); ridisegnaListone(); });
$("budget").addEventListener("change", () => { S.budget = Math.max(0, +$("budget").value | 0); salva(); });
for (const k of "PDCA") $("sl" + k).addEventListener("change", () => {
  S.slots[k] = Math.max(0, +$("sl" + k).value | 0); salva();
});
$("btnListone").addEventListener("click", aggiornaListone);
$("btnListoneStd").addEventListener("click", async () => {
  const r = await api.listoneRipristina();
  if (r.ok) applicaListone(r.listone, null);
});
$("btnBkEsp").addEventListener("click", async () => {
  const r = await api.backupEsporta(S);
  if (!r.annullato) toast(r.errore ? "Backup non riuscito: " + r.errore : "Backup salvato.");
});
$("btnBkImp").addEventListener("click", async () => {
  const r = await api.backupImporta();
  if (r.annullato) return;
  if (r.errore) { toast(r.errore); return; }
  S = Object.assign(statoIniziale(), r.stato);
  if (!partDi(S.io)) S.io = S.part[0].id;
  for (const k of Object.keys(S.ass)) if (!PER_K[k]) delete S.ass[k];
  salva(); ridisegnaListone(); vaiA(vista); toast("Backup caricato.");
});
$("btnExcel").addEventListener("click", esportaExcel);
$("btnAzzera").addEventListener("click", azzera);

api.suMenu((azione, arg) => {
  if (azione === "vista") vaiA(arg);
  else if (azione === "aggiornaListone") { vaiA("setup"); aggiornaListone(); }
  else if (azione === "backupEsporta") $("btnBkEsp").click();
  else if (azione === "backupImporta") $("btnBkImp").click();
  else if (azione === "excel") esportaExcel();
  else if (azione === "azzera") azzera();
});

document.addEventListener("keydown", (e) => {
  const dentroCampo = e.target instanceof Element && e.target.matches("input,textarea,select");
  if (e.key === "/" && !dentroCampo) { e.preventDefault(); vaiA("listone"); $("q").focus(); $("q").select(); return; }
  if (e.key === "Escape" && e.target === $("q")) { $("q").value = ""; filtra(); $("q").blur(); return; }
  if (dentroCampo || pop) return;
  const k = e.key.toLowerCase();
  if (k === "l") { e.preventDefault(); $("togLiberi").click(); }
  else if (k === "m") { e.preventDefault(); $("togMiei").click(); }
  else if ("pdca".includes(k) && vista === "listone") {
    e.preventDefault();
    document.querySelector(`.seg button[data-ruolo="${k.toUpperCase()}"]`)?.click();
  } else if (k === "t" && vista === "listone") {
    e.preventDefault();
    document.querySelector('.seg button[data-ruolo=""]')?.click();
  }
});

/* ─────────────── prova automatica ─────────────── */
function prova() {
  const dettagli = {};
  try {
    dettagli.giocatori = SEZIONI.reduce((s, k) => s + (LIST[k] || []).length, 0);
    dettagli.righe = document.querySelectorAll("#sezioni tr[data-k]").length;
    const btn = document.querySelector("#sezioni button[data-k]");
    btn.click();
    dettagli.popAperto = !!document.querySelector(".pop");
    const inp = document.querySelector(".pop #pz");
    const ev = new KeyboardEvent("keydown", { key: "3", bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    dettagli.cifraRubata = ev.defaultPrevented;
    inp.value = "42";
    document.querySelector(".pop .elenco button[data-p]").click();
    const k0 = btn.dataset.k;
    dettagli.assegnato = JSON.stringify(S.ass[k0]);
    dettagli.fogliExcel = fogliExcel().length;
    vaiA("squadre"); dettagli.schede = document.querySelectorAll(".scheda").length;
    vaiA("rosa"); dettagli.rosaOk = !!$("boxRosa").innerHTML;
    vaiA("setup"); dettagli.nomi = document.querySelectorAll("#nomi input").length;
    vaiA("listone");
    delete S.ass[k0];
    ridisegnaListone();
    dettagli.ok = dettagli.giocatori === 588 && dettagli.righe === 588 && dettagli.popAperto &&
      !dettagli.cifraRubata && dettagli.fogliExcel === S.part.length + 2 &&
      dettagli.schede === S.part.length && dettagli.rosaOk && dettagli.nomi === S.part.length;
  } catch (e) {
    dettagli.ok = false; dettagli.errore = String(e && e.message || e);
  }
  api.smoke(dettagli);
}

window.addEventListener("error", (e) => { window.__err = String(e.message) + " @" + e.filename + ":" + e.lineno; if (api && api.smokeAttivo) api.smoke({ ok: false, errore: window.__err }); });
avvia();
})();

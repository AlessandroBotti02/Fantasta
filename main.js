"use strict";
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { leggiXlsx, scriviXlsx } = require("./xlsx.js");

const SMOKE = process.argv.includes("--smoke");
let win = null;

/* ─────────────── dove vive lo stato ─────────────── */
const cartella = () => app.getPath("userData");
const fileStato = () => path.join(cartella(), "asta.json");
const fileListone = () => path.join(cartella(), "listone.json");
const listoneDiSerie = () => path.join(__dirname, "renderer", "listone.json");

function scriviAtomico(percorso, testo) {
  const tmp = percorso + ".tmp";
  fs.mkdirSync(path.dirname(percorso), { recursive: true });
  fs.writeFileSync(tmp, testo, "utf8");
  fs.renameSync(tmp, percorso);
}
function leggiJson(percorso) {
  try { return JSON.parse(fs.readFileSync(percorso, "utf8")); } catch (e) { return null; }
}

/* ─────────────── listone: dal foglio Excel ─────────────── */
const SEZIONI = ["Portieri", "Difensori", "Centrocampisti", "Attaccanti"];
const RUOLO = { Portieri: "P", Difensori: "D", Centrocampisti: "C", Attaccanti: "A" };
const chiaveDi = (R, nome) => R + "|" + String(nome).trim().toLowerCase();

function listoneDaFogli(fogli) {
  const trovate = SEZIONI.filter((s) => fogli[s]);
  if (!trovate.length) {
    throw new Error("Nel file non trovo i fogli Portieri, Difensori, Centrocampisti e Attaccanti.");
  }
  const out = {};
  for (const sez of SEZIONI) {
    const righe = fogli[sez] || [];
    if (!righe.length) { out[sez] = []; continue; }
    const testa = (righe[0] || []).map((v) => String(v ?? "").trim().toLowerCase());
    const col = (...alias) => {
      for (const a of alias) {
        const i = testa.findIndex((h) => h === a || h.startsWith(a));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iNome = col("nome");
    if (iNome < 0) throw new Error(`Nel foglio ${sez} manca la colonna "Nome".`);
    const c = {
      rm: col("rm", "ruolo mantra"), sq: col("squadra 26", "squadra"),
      fm: col("fm"), pres: col("presenze"), gol: col("gol"), ass: col("assist"),
      camp: col("campionato"), sq25: col("squadra 25"), fascia: col("fascia"), note: col("note"),
      rig: col("rigorista"),
    };
    const num = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const txt = (v) => (v === null || v === undefined ? "" : String(v).trim());
    const lista = [];
    for (let r = 1; r < righe.length; r++) {
      const riga = righe[r] || [];
      const nome = txt(riga[iNome]);
      if (!nome) continue;
      lista.push({
        k: chiaveDi(RUOLO[sez], nome),
        n: nome, R: RUOLO[sez],
        rm: c.rm >= 0 ? txt(riga[c.rm]) : "",
        s: c.sq >= 0 ? txt(riga[c.sq]) : "",
        fm: c.fm >= 0 ? num(riga[c.fm]) : null,
        p: c.pres >= 0 ? num(riga[c.pres]) : null,
        g: c.gol >= 0 ? num(riga[c.gol]) : null,
        a: c.ass >= 0 ? num(riga[c.ass]) : null,
        c: c.camp >= 0 ? txt(riga[c.camp]) : "",
        s2: c.sq25 >= 0 ? txt(riga[c.sq25]) : "",
        f: c.fascia >= 0 ? txt(riga[c.fascia]) : "",
        r: (() => {                                  // "1a scelta" / "2a scelta" / vuoto
          if (c.rig < 0) return null;
          const v = txt(riga[c.rig]).toLowerCase();
          if (!v) return null;
          if (v.startsWith("2")) return 2;
          return 1;
        })(),
        nt: c.note >= 0 ? txt(riga[c.note]) : "",
      });
    }
    out[sez] = lista;
  }
  const tot = SEZIONI.reduce((s, k) => s + out[k].length, 0);
  if (!tot) throw new Error("Il file non contiene nessun giocatore.");
  // chiavi doppie dentro lo stesso ruolo: le rendo uniche per non perdere righe
  for (const sez of SEZIONI) {
    const visti = new Map();
    for (const p of out[sez]) {
      const q = visti.get(p.k) || 0;
      visti.set(p.k, q + 1);
      if (q) p.k += "#" + (q + 1);
    }
  }
  return out;
}

function caricaListone() {
  return leggiJson(fileListone()) || leggiJson(listoneDiSerie()) || {};
}

/* ─────────────── finestra ─────────────── */
function creaFinestra() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: "Fantasta",
    backgroundColor: "#0E1418",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      additionalArguments: SMOKE ? ["--smoke"] : [],
    },
  });
  if (SMOKE) {
    win.webContents.on("did-fail-load", (_e, code, desc) => console.log("LOAD FALLITO " + code + " " + desc));
    win.webContents.on("preload-error", (_e, f, err) => console.log("PRELOAD ERRORE " + f + " " + err));
    win.webContents.on("render-process-gone", (_e, d) => console.log("RENDER MORTO " + JSON.stringify(d)));
    win.webContents.once("did-finish-load", async () => {
      try {
        const diag = await win.webContents.executeJavaScript(`(() => ({
          ponte: typeof window.fantasta,
          errore: window.__err || null,
          righe: document.querySelectorAll('#sezioni tr[data-k]').length,
          corpo: document.body ? document.body.innerText.length : -1
        }))()`);
        console.log("PROBE " + JSON.stringify(diag));
        if (diag && diag.errore) fineSmoke({ ok: false, errore: diag.errore }, 3);
      } catch (e) { console.log("PROBE ERRORE " + e.message); }
    });
  }
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.once("ready-to-show", () => { if (!SMOKE) win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function creaMenu() {
  const invia = (canale) => () => win && win.webContents.send(canale);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" },
    {
      label: "Asta",
      submenu: [
        { label: "Aggiorna il listone da Excel...", accelerator: "CmdOrCtrl+L", click: invia("menu:aggiornaListone") },
        { type: "separator" },
        { label: "Esporta backup...", accelerator: "CmdOrCtrl+S", click: invia("menu:backupEsporta") },
        { label: "Importa backup...", accelerator: "CmdOrCtrl+O", click: invia("menu:backupImporta") },
        { type: "separator" },
        { label: "Scarica l'Excel finale...", accelerator: "CmdOrCtrl+E", click: invia("menu:excel") },
        { type: "separator" },
        { label: "Azzera l'asta", click: invia("menu:azzera") },
      ],
    },
    { role: "editMenu" },
    {
      label: "Vista",
      submenu: [
        { label: "Listone", accelerator: "CmdOrCtrl+1", click: () => win && win.webContents.send("menu:vista", "listone") },
        { label: "Squadre", accelerator: "CmdOrCtrl+2", click: () => win && win.webContents.send("menu:vista", "squadre") },
        { label: "La mia rosa", accelerator: "CmdOrCtrl+3", click: () => win && win.webContents.send("menu:vista", "rosa") },
        { label: "Impostazioni", accelerator: "CmdOrCtrl+4", click: () => win && win.webContents.send("menu:vista", "setup") },
        { type: "separator" },
        { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]));
}

/* ─────────────── ponte con la pagina ─────────────── */
ipcMain.handle("stato:leggi", () => leggiJson(fileStato()));
ipcMain.handle("stato:scrivi", (_e, stato) => {
  scriviAtomico(fileStato(), JSON.stringify(stato));
  return true;
});
ipcMain.handle("listone:leggi", () => caricaListone());
ipcMain.handle("app:info", () => ({
  versione: app.getVersion(),
  cartella: cartella(),
  listonePersonale: fs.existsSync(fileListone()),
}));

ipcMain.handle("listone:aggiorna", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Scegli il listone aggiornato",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths.length) return { annullato: true };
  try {
    const fogli = leggiXlsx(fs.readFileSync(r.filePaths[0]));
    const nuovo = listoneDaFogli(fogli);
    scriviAtomico(fileListone(), JSON.stringify(nuovo));
    return { ok: true, listone: nuovo, file: path.basename(r.filePaths[0]) };
  } catch (e) {
    return { errore: e.message || String(e) };
  }
});

ipcMain.handle("listone:ripristina", () => {
  try { fs.unlinkSync(fileListone()); } catch (e) { /* non c'era */ }
  return { ok: true, listone: caricaListone() };
});

ipcMain.handle("backup:esporta", async (_e, stato) => {
  const oggi = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: "Salva il backup dell'asta",
    defaultPath: `Fantasta-backup-${oggi}.json`,
    filters: [{ name: "Backup Fantasta", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return { annullato: true };
  try { scriviAtomico(r.filePath, JSON.stringify(stato, null, 1)); return { ok: true, file: r.filePath }; }
  catch (e) { return { errore: e.message }; }
});

ipcMain.handle("backup:importa", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Scegli il backup da caricare",
    filters: [{ name: "Backup Fantasta", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths.length) return { annullato: true };
  const dati = leggiJson(r.filePaths[0]);
  if (!dati || !dati.part || !dati.ass) return { errore: "Questo file non e' un backup di Fantasta." };
  return { ok: true, stato: dati };
});

ipcMain.handle("excel:esporta", async (_e, fogli) => {
  const oggi = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: "Salva l'Excel dell'asta",
    defaultPath: `Asta-Fantacalcio-${oggi}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (r.canceled || !r.filePath) return { annullato: true };
  try { fs.writeFileSync(r.filePath, scriviXlsx(fogli)); return { ok: true, file: r.filePath }; }
  catch (e) { return { errore: e.message }; }
});

ipcMain.handle("conferma", async (_e, { titolo, testo, ok }) => {
  const r = await dialog.showMessageBox(win, {
    type: "warning", buttons: [ok || "Procedi", "Annulla"], defaultId: 1, cancelId: 1,
    message: titolo, detail: testo,
  });
  return r.response === 0;
});

function fineSmoke(esito, codice) {
  const testo = "SMOKE " + JSON.stringify(esito);
  console.log(testo);
  try {
    const dove = process.env.FANTASTA_SMOKE_LOG || path.join(cartella(), "smoke.json");
    fs.writeFileSync(dove, JSON.stringify(esito, null, 1));
  } catch (e) { /* niente da fare */ }
  app.exit(codice);
}
ipcMain.on("smoke:esito", (_e, esito) => fineSmoke(esito, esito && esito.ok ? 0 : 1));

app.whenReady().then(() => {
  creaMenu();
  creaFinestra();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) creaFinestra(); });
  if (SMOKE) setTimeout(() => fineSmoke({ ok: false, errore: "timeout" }, 2), 25000);
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

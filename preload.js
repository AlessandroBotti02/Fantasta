"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/* La pagina non tocca mai il disco: passa sempre da qui. */
contextBridge.exposeInMainWorld("fantasta", {
  statoLeggi:        ()      => ipcRenderer.invoke("stato:leggi"),
  statoScrivi:       (s)     => ipcRenderer.invoke("stato:scrivi", s),
  listoneLeggi:      ()      => ipcRenderer.invoke("listone:leggi"),
  listoneAggiorna:   ()      => ipcRenderer.invoke("listone:aggiorna"),
  listoneRipristina: ()      => ipcRenderer.invoke("listone:ripristina"),
  backupEsporta:     (s)     => ipcRenderer.invoke("backup:esporta", s),
  backupImporta:     ()      => ipcRenderer.invoke("backup:importa"),
  excelEsporta:      (f)     => ipcRenderer.invoke("excel:esporta", f),
  conferma:          (o)     => ipcRenderer.invoke("conferma", o),
  info:              ()      => ipcRenderer.invoke("app:info"),
  smoke:             (e)     => ipcRenderer.send("smoke:esito", e),
  suMenu: (fn) => {
    const canali = ["menu:aggiornaListone", "menu:backupEsporta", "menu:backupImporta",
                    "menu:excel", "menu:azzera"];
    for (const c of canali) ipcRenderer.on(c, () => fn(c.replace("menu:", "")));
    ipcRenderer.on("menu:vista", (_e, v) => fn("vista", v));
  },
  smokeAttivo: process.argv.includes("--smoke"),
  os: (process.argv.find((a) => a.startsWith("--os=")) || "--os=").slice(5) || process.platform,
});

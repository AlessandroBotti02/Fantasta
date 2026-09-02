"use strict";
/* Lettura e scrittura di file .xlsx senza dipendenze: uno .xlsx e' uno zip di XML,
   e Node sa gia' comprimere e decomprimere. */
const zlib = require("zlib");

/* ─────────────────────────── zip: lettura ─────────────────────────── */
function leggiZip(buf) {
  // La fine dell'archivio contiene il puntatore all'indice centrale
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Non sembra un file .xlsx (archivio non riconosciuto)");
  const nVoci = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const voci = {};
  for (let k = 0; k < nVoci; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const dimCompressa = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenCommento = buf.readUInt16LE(p + 32);
    const offLocale = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    voci[nome] = { metodo, dimCompressa, offLocale };
    p += 46 + lenNome + lenExtra + lenCommento;
  }
  const estrai = (nome) => {
    const v = voci[nome];
    if (!v) return null;
    const q = v.offLocale;
    if (buf.readUInt32LE(q) !== 0x04034b50) throw new Error("Voce zip danneggiata: " + nome);
    const inizio = q + 30 + buf.readUInt16LE(q + 26) + buf.readUInt16LE(q + 28);
    const dati = buf.subarray(inizio, inizio + v.dimCompressa);
    if (v.metodo === 0) return dati;
    if (v.metodo === 8) return zlib.inflateRawSync(dati);
    throw new Error("Compressione non supportata nel file .xlsx");
  };
  return { nomi: Object.keys(voci), estrai };
}

/* ─────────────────────────── xml minimale ─────────────────────────── */
const deEsc = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, d) => String.fromCharCode(parseInt(d, 16)))
  .replace(/&amp;/g, "&");

function colonnaDaRif(rif) {          // "BC12" -> 54 (indice 0)
  let n = 0;
  for (const ch of rif) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64); else break;
  }
  return n - 1;
}

function stringheCondivise(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si\b[^>]*?\/>|<si\b[^>]*?>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const dentro = m[1] || "";
    let testo = "";
    const rt = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = rt.exec(dentro))) testo += deEsc(t[1]);
    out.push(testo);
  }
  return out;
}

function righeDaFoglio(xml, condivise) {
  const righe = [];
  const reRiga = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
  let r;
  while ((r = reRiga.exec(xml))) {
    const attr = (r[1] !== undefined ? r[1] : r[2]) || "";
    const dentro = r[3] || "";
    const nRiga = /\br="(\d+)"/.exec(attr);
    const idx = nRiga ? +nRiga[1] - 1 : righe.length;
    const celle = [];
    const reCella = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let c, ultima = -1;
    while ((c = reCella.exec(dentro))) {
      const a = (c[1] !== undefined ? c[1] : c[2]) || "";
      const corpo = c[3] || "";
      const rif = /\br="([A-Z]+\d+)"/.exec(a);
      const col = rif ? colonnaDaRif(rif[1]) : ultima + 1;
      ultima = col;
      const tipo = (/\bt="([^"]+)"/.exec(a) || [])[1] || "n";
      let val = null;
      if (tipo === "inlineStr") {
        let testo = "";
        const rt = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t;
        while ((t = rt.exec(corpo))) testo += deEsc(t[1]);
        val = testo;
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo);
        if (v) {
          const grezzo = deEsc(v[1]);
          if (tipo === "s") val = condivise[+grezzo] ?? "";
          else if (tipo === "b") val = grezzo === "1";
          else if (tipo === "str" || tipo === "e") val = grezzo;
          else { const n = Number(grezzo); val = Number.isFinite(n) ? n : grezzo; }
        }
      }
      celle[col] = val;
    }
    righe[idx] = celle;
  }
  for (let i = 0; i < righe.length; i++) if (!righe[i]) righe[i] = [];
  return righe;
}

function leggiXlsx(buf) {
  const zip = leggiZip(buf);
  const wb = zip.estrai("xl/workbook.xml");
  if (!wb) throw new Error("Il file non contiene un foglio di calcolo leggibile");
  const wbXml = wb.toString("utf8");
  const rels = (zip.estrai("xl/_rels/workbook.xml.rels") || Buffer.from("")).toString("utf8");
  const mappaRel = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) {
    mappaRel[m[1]] = m[2].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  }
  const condivise = stringheCondivise(
    (zip.estrai("xl/sharedStrings.xml") || Buffer.from("")).toString("utf8"));
  const fogli = {};
  let i = 0;
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    i++;
    const a = m[1];
    const nome = deEsc((/\bname="([^"]*)"/.exec(a) || [])[1] || ("Foglio" + i));
    const rid = (/\br:id="([^"]+)"/.exec(a) || [])[1];
    let percorso = rid && mappaRel[rid] ? "xl/" + mappaRel[rid] : "xl/worksheets/sheet" + i + ".xml";
    let dati = zip.estrai(percorso) || zip.estrai("xl/worksheets/sheet" + i + ".xml");
    if (!dati) continue;
    fogli[nome] = righeDaFoglio(dati.toString("utf8"), condivise);
  }
  return fogli;
}

/* ─────────────────────────── zip: scrittura ────────────────────────── */
const TAB_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = TAB_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function scriviZip(file) {
  const pezzi = [], centrali = [];
  let off = 0;
  for (const f of file) {
    const nome = Buffer.from(f.name, "utf8");
    const grezzo = Buffer.from(f.data, "utf8");
    const compresso = zlib.deflateRawSync(grezzo, { level: 6 });
    const usaDeflate = compresso.length < grezzo.length;
    const dati = usaDeflate ? compresso : grezzo;
    const metodo = usaDeflate ? 8 : 0;
    const crc = crc32(grezzo);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(metodo, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(dati.length, 18);
    lh.writeUInt32LE(grezzo.length, 22); lh.writeUInt16LE(nome.length, 26); lh.writeUInt16LE(0, 28);
    pezzi.push(lh, nome, dati);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(metodo, 10); ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dati.length, 20); ch.writeUInt32LE(grezzo.length, 24);
    ch.writeUInt16LE(nome.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(off, 42);
    centrali.push(ch, nome);
    off += 30 + nome.length + dati.length;
  }
  const cd = Buffer.concat(centrali);
  const eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(0, 4); eo.writeUInt16LE(0, 6);
  eo.writeUInt16LE(file.length, 8); eo.writeUInt16LE(file.length, 10);
  eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16); eo.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(pezzi), cd, eo]);
}

const xe = (s) => String(s ?? "")
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

function lettera(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

function nomeFoglio(s, usati) {
  let n = String(s).replace(/[\x00-\x1F]/g, " ").replace(/[\\\/\?\*\[\]:]/g, " ")
    .trim().slice(0, 28).replace(/^'+|'+$/g, "").trim() || "Foglio";
  const base = n; let k = 2;
  while (usati.has(n.toLowerCase())) n = (base + " " + k++).slice(0, 31);
  usati.add(n.toLowerCase());
  return n;
}

function scriviXlsx(fogli) {
  const usati = new Set();
  const nomi = fogli.map((f) => nomeFoglio(f.nome, usati));
  const xmlFoglio = (righe) => {
    const rs = righe.map((r, ri) => {
      const cs = (r || []).map((v, ci) => {
        if (v === null || v === undefined || v === "") return "";
        const rif = lettera(ci) + (ri + 1);
        const st = ri === 0 ? ' s="1"' : "";
        if (typeof v === "number" && Number.isFinite(v)) return `<c r="${rif}"${st}><v>${v}</v></c>`;
        return `<c r="${rif}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      }).join("");
      return `<row r="${ri + 1}">${cs}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rs}</sheetData></worksheet>`;
  };
  const file = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomi.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fogli.map((f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
  ];
  fogli.forEach((f, i) => file.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xmlFoglio(f.righe) }));
  return scriviZip(file);
}

module.exports = { leggiXlsx, scriviXlsx };

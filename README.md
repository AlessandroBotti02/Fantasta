# Fantasta

App da scrivania per condurre l'asta del Fantacalcio: listone completo con le
statistiche della stagione scorsa, assegnazione dei giocatori ai partecipanti,
rose di tutti, formazione automatica ed export in Excel.

## Cosa fa

- **Listone** — tutti i giocatori divisi per ruolo, nell'ordine di forza deciso
  a tavolino. Ricerca, filtro per ruolo, per squadra, «solo liberi» e «i miei».
- **Assegnazione** — un clic sulla riga apre il menu: prezzo e a chi è andato.
  Tasti `1`-`9` per i partecipanti, `Esc` per annullare.
- **Squadre** — rose di tutti i partecipanti con crediti spesi e slot per reparto.
- **La mia rosa** — la formazione migliore fra i sette moduli, più la panchina.
- **Excel finale** — un foglio di riepilogo, uno per ogni partecipante con la
  formazione, e il listone completo con chi ha preso chi e a quanto.
- **Listone aggiornabile** — quando esce un listone nuovo, si carica il file
  `.xlsx` e l'app rilegge tutto tenendo le assegnazioni già fatte.

L'asta si salva da sola a ogni mossa in `~/Library/Application Support/Fantasta/`.

## Scorciatoie

| Tasto | Cosa fa |
|---|---|
| `/` | vai alla ricerca |
| `P` `D` `C` `A` `T` | filtra per ruolo (T = tutti) |
| `L` | mostra solo i giocatori liberi |
| `M` | mostra solo i miei |
| `⌘L` | carica un listone aggiornato |
| `⌘S` / `⌘O` | esporta / importa un backup |
| `⌘E` | scarica l'Excel finale |
| `⌘1`…`⌘4` | cambia scheda |

## Sviluppo

```bash
npm install
npm start          # avvia in sviluppo
npm run smoke      # prova automatica, stampa SMOKE {...}
npm run dist       # compila il .dmg per Mac Apple Silicon
```

Il formato `.xlsx` è letto e scritto da `xlsx.js`, senza librerie esterne.

## Aggiornare il listone

1. Apri **Impostazioni → Listone → Carica un listone aggiornato**.
2. Scegli il file `.xlsx` con i fogli `Portieri`, `Difensori`, `Centrocampisti`,
   `Attaccanti` e le colonne `Nome`, `Squadra 26/27`, `FM 25/26`, `Presenze`,
   `Gol`, `Assist`, `Campionato 25/26`, `Squadra 25/26`, `Fascia guida`.
3. Le assegnazioni dei giocatori ancora in lista restano; quelle di chi è
   sparito vengono rimosse e l'app te lo dice.

# Audit - Full-project code review

Snapshot: branch `dev`, commit `2bda478c53ee0a2cd08ee42d11e9ee76d4b6882f`, 2026-10-28.
Tipo: review statica, read-only. Nessuna modifica a codice, UI, asset o configurazione runtime.

## Documenti

| File | Sessione | Contenuto |
|---|---|---|
| `00-inventory.md` | S0 | perimetro, mappa, copertura, evidenze |
| `01-architecture.md` | S1 | confini, contratti, stato, lifecycle, rischi trasversali |
| `02-main-preload.md` | S2 | IPC, sicurezza, spawn, mini player, media |
| `03-db.md` | S3 | schema, migrazioni, FTS, journal, prune |
| `04-sidecar.md` | S4 | download, playlist, tag, progress, generi |
| `05-ci-packaging.md` | S5 | CI, Forge, runtime, release, macOS |
| `06-renderer.md` | S6 | stato, performance, coda, mini, accessibilita' |
| `07-tests-tooling.md` | S7 | test mancanti, script, tsconfig, docs |
| `08-final.md` | S8 | risk register, backlog, quick wins, verdetto |

## Severita'

| Livello | Significato |
|---|---|
| ROSSO | blocca la release o causa perdita dati certa |
| ARANCIONE | rischio alto di sicurezza, dati o release; da correggere presto |
| GIALLO | bug, performance o debito con impatto misurabile |
| VERDE | manutenzione, copy, accessibilita', osservazione |

Totale: 55 finding. 12 ARANCIONE, 33 GIALLO, 10 VERDE, 0 ROSSO.

## Ordine di lettura consigliato

1. `08-final.md` per TL;DR, risk register e backlog.
2. `01-architecture.md` per la mappa.
3. I deep dive dei layer coinvolti dal prossimo intervento.
4. `00-inventory.md` per copertura e limiti.

## Riproducibilita'

I controlli read-only eseguiti sono elencati in `00-inventory.md` e `07-tests-tooling.md`. Non sono stati eseguiti build, `npm run make`, avvio dell'app o trace runtime. Le osservazioni di performance sono statiche.

## Regole

- La UI e' congelata: i finding di copy, colori e accessibilita' sono proposte, non patch applicate.
- Le patch nei finding sono indicazioni, non codice finale.
- Le citazioni di file e righe si riferiscono allo snapshot indicato.
- I documenti di stato del progetto (`README.md`, `context.md`, `docs/PLAYER.md`) non sono stati modificati; le incoerenze sono in `AUD-706`.

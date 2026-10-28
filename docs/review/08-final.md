# S8 - Consolidamento

Snapshot: `dev` @ `2bda478`. Review statica completata su S0-S8.
Copertura: 85 file visti, 8 non visti, 0 troncati.
Finding totali: 55. Severita': 12 ARANCIONE, 33 GIALLO, 10 VERDE, 0 ROSSO.

## 1. TL;DR

1. L'architettura e' solida: processi separati, sandbox, SQLite, sidecar JSON e UI memoizzata; il debito e' concentrato in sicurezza IPC, integrita' dati e processo di release.
2. I rischi piu' concreti sono path arbitrari nel main, collisioni di filename che cancellano file, libreria mai pruned e tag editor che non aggiorna il DB.
3. Le performance peggiori sono l'avvio con scansione completa, l'art via processo Python per traccia, lo stato mini con art ogni secondo e il visualizer nascosto.
4. La release Windows e' utilizzabile ma fragile: nessun test, nessun gate CI, dipendenze Python non pinnate, auto-update non effettivo.
5. macOS non e' pronto: runtime hardcoded, ffmpeg x86-only, chrome custom, niente DMG/firma/notarization. La UI non e' stata modificata.

## 2. Risk register

| # | Rischio | Finding | Severita' | Mitigazione | Sforzo |
|---|---|---|---|---|---|
| R1 | Un renderer compromesso puo' invocare tutta l'API, inclusa la scrittura tag | AUD-101 | ARANCIONE | sender validation, preload mini separato, schema payload | M |
| R2 | Path arbitrari in scan/art/tag/media | AUD-102 | ARANCIONE | root allowlist, realpath, estensione, token media | M |
| R3 | Download con titolo uguale cancella un file esistente | AUD-301 | ARANCIONE | suffisso unico, nessun unlink, temp dir | S |
| R4 | Tracce cancellate restano nel DB, nella ricerca e nelle tile | AUD-201 | ARANCIONE | generazione di scan + prune transazionale | M |
| R5 | Il tag editor perde il genere inferito e non persiste nel DB | AUD-202, AUD-503, AUD-305 | ARANCIONE | inferenza + upsert atomico, campi espliciti | S/M |
| R6 | L'update yt-dlp via pip e' rotto nell'app pacchettizzata | AUD-303 | ARANCIONE | skip se pip/frozen, messaggio, updater dedicato | S |
| R7 | Qualsiasi tag crea una release draft senza typecheck, lint, test o smoke | AUD-401 | ARANCIONE | job checks + dipendenze + tag protetti | S/M |
| R8 | Runtime Python/ffmpeg scaricati senza hash e non pinnati | AUD-402 | ARANCIONE | hash, versioni fisse, execFileSync, SBOM | M |
| R9 | Nessun test automatico | AUD-701, AUD-702 | ARANCIONE | parser, DB, scan, tag, playlist, smoke Electron | M |
| R10 | Scan/art/tag possono restare appesi senza timeout | AUD-103 | ARANCIONE | wrapper con timeout, kill tree, concorrenza | S/M |
| R11 | La coda All Songs si ferma alla prima pagina | AUD-502 | GIALLO | contesto lazy da query, facets DB | M |
| R12 | Rimuovere la traccia corrente lascia l'audio attivo | AUD-504 | GIALLO | stop/pausa e next esplicito | S |
| R13 | L'avvio carica tutta la libreria e la riscansiona | AUD-001 | ARANCIONE | prima pagina + facets, scan incrementale | M |
| R14 | L'art base64 viene inviata ogni secondo al mini | AUD-105, AUD-507 | GIALLO | stato leggero + art on change | S |
| R15 | FTS puo' rifiutare l'input e lasciare la ricerca vuota | AUD-204 | GIALLO | tokenizzazione, guardia, fallback, catch UI | S |
| R16 | Playlist parziali riportate come successo | AUD-302, AUD-307 | ARANCIONE/GIALLO | result aggregato, path finali verificati | M |
| R17 | macOS non e' spedibile | AUD-004, AUD-403 | GIALLO | runtime per piattaforma, DMG, firma, CI mac | M/L |
| R18 | Auto-update non funziona con lo zip | AUD-404 | GIALLO | Squirrel o electron-updater | M |
| R19 | Electron 28 e' fuori supporto | AUD-407 | GIALLO | upgrade con matrice better-sqlite3 | M |
| R20 | Documentazione di stato fuorviante | AUD-706 | VERDE | README/context/PLAYER aggiornati | S |

## 3. Backlog

### P0 - Prima della prossima release Windows

| ID | Intervento | Perche' |
|---|---|---|
| AUD-101 | Validazione sender e separazione preload mini | chiude la superficie IPC |
| AUD-102 | Root allowlist per scan/art/tag/media/record | impedisce accesso fuori libreria |
| AUD-301 | Collisioni filename senza unlink | evita perdita dati |
| AUD-303 | Skip update yt-dlp senza pip | toglie un percorso rotto |
| AUD-201, AUD-202 | Prune e tag write con upsert/inferenza | dati coerenti dopo riavvio |
| AUD-204 | FTS robusto + catch UI | la ricerca non deve rompersi |
| AUD-103, AUD-104 | Timeout e cleanup sidecar/download | niente UI appesa o file orfani |
| AUD-401, AUD-402 | Gate CI e pin/hash dipendenze | release ripetibile |
| AUD-701 | Primi test parser/DB | rete di sicurezza minima |

### P1 - Qualita' percepita e performance

| ID | Intervento |
|---|---|
| AUD-001 | Caricare solo la prima pagina; facets e gruppi da DB; scan incrementale |
| AUD-501, AUD-507 | Thumbnail cache, in-flight map, art on change |
| AUD-502, AUD-504 | Contesto coda completo, stop audio su remove/clear, errori ricerca |
| AUD-505, AUD-105 | Pausa visualizer e throttling main |
| AUD-306, AUD-307, AUD-304 | Contratto progress/playlist/opzioni |
| AUD-305, AUD-310 | Tag atomici, scan a una parse, limiti art |
| AUD-203, AUD-206 | Path canonico, migrazioni transazionali, close DB |
| AUD-702, AUD-703 | Test di contratto, lint/typecheck in CI |

### P2 - Piattaforma e distribuzione

| ID | Intervento |
|---|---|
| AUD-004, AUD-403 | macOS: runtime, Resources, ffmpeg arm64, chrome, menu, tray |
| AUD-403, AUD-404 | DMG, firma, notarization, auto-update |
| AUD-407 | Upgrade Electron e better-sqlite3 |
| AUD-406 | Pruning pacchetto e locale per piattaforma |
| AUD-405 | `npm run dev` da checkout pulito |
| AUD-408 | Asserzione CSS postbuild |
| AUD-706 | README, context, PLAYER, indice review |

### P3 - Debito minore

| ID | Intervento |
|---|---|
| AUD-508 | Copy: em dash, versioni, lingue |
| AUD-509 | Accessibilita' tastiera e aria |
| AUD-510 | Colori hardcoded nel sistema accent |
| AUD-511 | Error boundary |
| AUD-512 | Un solo normalizzatore progress |
| AUD-107, AUD-108 | Lifecycle refactor, log e codice morto |
| AUD-207, AUD-309, AUD-704, AUD-705 | Schema/API morti, script, config |

## 4. Quick wins (mezza giornata o meno)

1. Guardia `ftsQuery`: tokenizzare, scartare query vuote, `try/catch` e messaggio UI (`AUD-204`).
2. Dopo `writeTags`: inferenza genere, `upsertTracks` e ritorno arricchito (`AUD-202`, `AUD-503`).
3. `update_ytdlp`: return immediato se `sys.frozen` o pip assente (`AUD-303`).
4. Collisione filename: niente `unlink`, suffisso unico (`AUD-301`).
5. `removeFromQueue`/clear: pausa, `removeAttribute('src')`, `load()` (`AUD-504`).
6. Visualizer: pausa su `document.hidden` e canvas non visibile (`AUD-505`).
7. Mini: inviare art solo al cambio path, stato iniziale su richiesta, cleanup listener (`AUD-507`).
8. `noEmitOnError: true`, correzione warning ESLint, typecheck in CI (`AUD-703`, `AUD-705`).
9. Rimuovere log di query/URL in produzione (`AUD-108`).
10. Aggiornare README, context e versione in Info in una passata copy approvata (`AUD-706`, `AUD-508`).

## 5. Refactoring prioritario

| Refactoring | Impatto | Sforzo | Note |
|---|---|---|---|
| `LibraryService` unico per scan, tag, DB, FTS, cache | alto | M | elimina doppia scrittura e incoerenza |
| Contratto sidecar versionato + decoder JSON condiviso | alto | M | testabile, elimina tre parser |
| Root registry e media token | alto | M | sicurezza e semplicita' |
| Playlist e coda su SQLite | medio | M | schema gia' presente |
| Lifecycle per piattaforma | medio | S/M | sblocca macOS |
| Pipeline release con checks e artifact verificati | alto | M | riduce release rotte |
| Cache art/thumbnail nel main | medio | M | RAM e processi |
| Facets DB per artisti/album/generi | medio | S/M | toglie array completo dal renderer |

## 6. macOS: stato e prossimi passi

Il piano `docs/PLAN_RECENT_SORT_AND_MACOS.md` resta valido. Stato attuale:

- Phase A, portabilita': da fare. Runtime Python/ffmpeg per piattaforma, chrome nativo, menu, tray template, scorciatoie.
- Phase B, packaging: da fare. DMG, architetture separate, `.icns`, hardened runtime, entitlements, CI `macos-14`.
- Phase C, distribuzione: bloccata da Apple Developer Program. Firma Developer ID, notarization, stapling, auto-update.

Decisioni richieste: account Apple, Apple Silicon only o universale, macOS minimo, artifact non firmati in anteprima.

## 7. Playlist su SQLite

Lo schema e' gia' pronto (`playlists`, `playlist_tracks` con `position` e FK). Passi:

1. IPC `playlist:list/create/rename/delete/add/remove/reorder`.
2. Migrazione una tantum da `audit-playlists-v1`.
3. `resolvePlaylist` resta nel renderer ma riceve tracce dal DB.
4. Test: path mancanti, riordino, cancellazione playlist, migrazione.
5. Coda: valutare se migrare anche `audit-queue-v1` o lasciarla locale.

## 8. Gruppi e statistiche via query

Oggi il renderer calcola tile e gruppi su tutte le tracce. Proposta:

- `library:facets` restituisce artisti, album e generi con conteggi, limitati e paginati.
- `library:query` accetta `artist`, `album`, `genre` come filtri indicizzati.
- `library:stats` e' gia' disponibile ma non usato: collegarlo alle tile.
- Il contesto di play riceve una query, non un array da 200 elementi.

## 9. Verdetto

Audit e' un'app Windows funzionante e curata, con una base architetturale migliore della media dei progetti Electron. La release v1.3.1 e' usabile, ma non e' ancora "hardened": la superficie IPC e' troppo ampia, i dati della libreria possono divergere, il processo di release non ha rete di sicurezza e macOS e' solo una roadmap.

La priorita' non e' aggiungere feature. E' rendere sicuri e coerenti i flussi esistenti, poi misurare la performance con trace reali. La UI va lasciata com'e' finche' questi fix non sono chiusi.

## 10. Domande aperte

1. Auto-update: installer Squirrel, `electron-updater` o link manuale?
2. macOS: Apple account disponibile? Apple Silicon only? macOS minimo?
3. Upgrade Electron: finestra di test accettabile su `dev`?
4. Performance: si vuole una misura con CDP trace nella prossima sessione?
5. Copy/UI: la passata em dash, versioni e accessibilita' e' approvata o resta congelata?

# S1 - Architettura

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 85, non visti = 8, troncati = 0.

## 1. Vista d'insieme

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer Next.js (static export, sandbox, no Node)                  │
│  app/page.tsx          shell, tab downloader/library, popover       │
│  PlayerSection         stato player, coda, playlist, mini bridge    │
│  LibraryHome           query SQLite, gruppi, ricerca                 │
│  <audio> + EQEngine    media:// + Web Audio + visualizer             │
└───────────────┬─────────────────────────────────────────────────────┘
                │ preload ElectronAPI (contextBridge)
                │ invoke/send, payload tipizzati
┌───────────────▼─────────────────────────────────────────────────────┐
│ Main Electron                                                       │
│  main/window/mini-player/tray    lifecycle e finestre               │
│  ipc-handlers                    unico punto di ingresso IPC        │
│  python-bridge                   spawn downloader, JSON stdio       │
│  library                         spawn scanner, cache, tag, art     │
│  db (better-sqlite3)             tracks, roots, downloads, FTS5     │
│  media-protocol                  media://audio con Range            │
└───────────────┬─────────────────────────────────────────────────────┘
                │ argv, JSON line protocol
┌───────────────▼─────────────────────────────────────────────────────┐
│ Sidecar Python (processo separato per richiesta)                    │
│  downloader/   yt-dlp, ffmpeg, tag, progress                        │
│  library/      scan, mutagen, generi, tag write                     │
│  interface/    args, logging, IPC stdout/stderr                     │
└─────────────────────────────────────────────────────────────────────┘
```

Confini rispettati:

- Il renderer non usa Node, `fs` o `child_process`. Tutto passa dal preload.
- Il main possiede filesystem, processi, finestre, DB e protocollo media.
- Il sidecar non tocca il DB e non parla con il renderer. Comunica solo con il main.
- Il DB non viene letto dal sidecar: lo scanner produce JSON, il main lo persiste.

## 2. Contratti

### 2.1 IPC renderer-main

Circa 20 canali in `src/main/preload.ts`. I gruppi sono:

| Gruppo | Canali | Tipo |
|---|---|---|
| finestra | `window:minimize`, `window:maximize`, `window:close` | send |
| download | `convert-youtube`, `download:youtube`, `download:stop`, `download-progress` | invoke/send/event |
| dialog | `dialog:openFolder` | invoke |
| libreria | `library:scan`, `library:loadCache`, `library:saveCache`, `library:art`, `library:writeTags` | invoke |
| query | `library:query`, `library:stats`, `library:recordDownload` | invoke |
| mini | `mini:*`, `player:state` | send/event |

Punti di forza: i tipi sono centralizzati in `src/types/electron.d.ts`; il preload espone solo funzioni, non oggetti Electron; il main non espone `ipcRenderer` al renderer.

Punti deboli: non esiste validazione dello schema, del mittente o dei limiti. Vedi `AUD-101` e `AUD-102` in S2.

### 2.2 Stdio main-sidecar

Il downloader e' invocato con argv (`main.py <url> <outputDir> [flags]`). Lo scanner con `scan.py <dir>`, `--art <file>`, `--set-tag <file> <json>`.

Protocollo reale:

- stdout: una riga JSON per evento (`{"type":"progress"...}`, `{"type":"result"...}`, `{"type":"scan-result"...}`, `{"type":"art-result"...}`, `{"type":"tag-result"...}`).
- stderr: log umani e traceback.
- UTF-8 forzato con `PYTHONIOENCODING` e `PYTHONUTF8`.
- Il main accumula un buffer e spezza su newline; gestisce righe parziali.

Punti di forza: separazione stdout/stderr corretta; encoding esplicito; `flush=True`; il bridge ignora linee non JSON; il sidecar e' sostituibile.

Punti deboli: non c'e' versioning del protocollo, non ci sono timeout, non c'e' un request id per le chiamate scanner/art/tag (una richiesta per processo), il contratto `saved` e' un caso speciale dentro `progress`, e alcuni campi hanno semantica ambigua (`speed` stringa vs numero, `output_path` file vs cartella). Vedi `AUD-003`, `AUD-304`-`AUD-307`.

### 2.3 Persistenza

| Dato | Sorgente autoritativa | Copia | Note |
|---|---|---|---|
| tracce | SQLite `tracks` | JSON `audit-library.json` + stato React | doppia copia, import legacy |
| root | SQLite `roots` | localStorage `auditLibraryRoots` | doppio |
| download | SQLite `downloads` + `tracks.downloaded_at` | nessuna | journal best effort |
| playlist | localStorage `audit-playlists-v1` | nessuna | tabelle SQLite inutilizzate |
| coda | localStorage `audit-queue-v1` | stato React | solo path + indice |
| colori, tab, sort, EQ | localStorage | stato React | accettabile |
| mini player | main | stato React + eventi | nessuna persistenza posizione |

Il main e' il proprietario dei dati, ma il renderer carica l'intera libreria all'avvio e la tiene in memoria. Questo annulla il vantaggio della paginazione SQLite. Vedi `AUD-001`.

## 3. Flussi principali

### 3.1 Download

1. Il renderer valida URL e cartella, chiama `convertYoutube`.
2. Il main risolve Python e script, verifica la scrivibilita' della cartella, spawna `python/main.py`.
3. Python aggiorna yt-dlp, seleziona il formato, scarica, converte, scrive i tag, emette progress e result.
4. Il main normalizza il progress, invia `download-progress`, registra il journal su `saved` o sul result.
5. Il renderer mostra la card, aggiorna la coda e al termine prepara `harvest` per la libreria.
6. La libreria viene riscansionata e salvata in SQLite e nel JSON.

Punti critici: l'aggiornamento yt-dlp via pip non funziona nel runtime impacchettato (`AUD-303`); i file parziali non vengono puliti su cancel (`AUD-104`); le collisioni di nome possono cancellare file esistenti (`AUD-301`).

### 3.2 Scansione

1. `PlayerSection` carica la cache completa dal DB.
2. Un secondo effetto lancia una scansione completa una volta per avvio.
3. `library.ts` spawna `scan.py` per ogni root.
4. Python legge i tag, rileva art, normalizza artista/titolo, inferisce il genere.
5. Il renderer salva `library:saveCache`; il main fa upsert di tutte le tracce.
6. Il renderer sostituisce l'array completo e ricalcola gruppi e tile.

Punti critici: scansione completa a ogni avvio, upsert senza prune (`AUD-201`), doppia parse mutagen per file, art via processo separato per traccia (`AUD-310`, `AUD-501`).

### 3.3 Riproduzione

1. `PlayerBar` monta un `<audio>` e lo collega a `EQEngine`.
2. `media://audio?path=...` serve il file con Range.
3. Web Audio crea MediaElementSource, preamp, 10 biquad, analyser, destination.
4. `Visualizer` legge l'analyser; `Waves` disegna lo sfondo.
5. `PlayerSection` pubblica lo stato al mini ogni secondo.
6. Il mini invia comandi al main, che li inoltra al renderer principale.

Punti critici: art base64 inviata ogni secondo (`AUD-105`, `AUD-507`); visualizer attivo anche quando la tab e' nascosta (`AUD-505`); se l'audio viene rimosso dalla coda, continua a suonare (`AUD-504`).

## 4. Lifecycle

### Avvio

1. `registerMediaProtocolScheme()` prima di `app.ready`.
2. `initAutoUpdater()`, `initRenderer()`, crash handler.
3. `app.whenReady`: `initDb`, `handleMediaProtocol`, IPC, mini preload/loader, finestra main, tray.
4. La finestra mostra solo su `ready-to-show`.
5. Il renderer carica cache, colori, tab, coda, playlist, poi lancia la scansione.

### Chiusura

- Windows/Linux: close della main -> `app.quit`; `window-all-closed` chiama di nuovo quit.
- macOS: close non quitta; `activate` ricrea la finestra solo se non ci sono finestre.
- Mini: hide per default, destroy solo su quit o su `closeMiniPlayer`.
- DB: nessun `close()` o checkpoint esplicito.

### Rischi lifecycle

- Su macOS, con il mini aperto, `BrowserWindow.getAllWindows().length` non e' zero e `activate` non ricrea la main: l'utente resta senza finestra principale (`AUD-107`).
- `backgroundThrottling: false` su entrambe le finestre tiene attivi timer e rAF anche quando la main e' nascosta (`AUD-105`).
- Un errore in `initDb` non e' gestito: l'app termina prima di mostrare la UI (`AUD-106`).

## 5. Debito strutturale

| Tema | Stato | Impatto |
|---|---|---|
| Doppia cache DB/JSON/renderer | presente | avvio lento, memoria, incoerenza |
| Playlist su localStorage | presente | niente query, niente backup DB, niente sync |
| `libraryStats` e `recordDownload` esposti ma non usati dal renderer | presente | superficie API inutile |
| Tabelle `playlists` e `playlist_tracks` create ma non usate | presente | schema morto |
| `added_at` mai popolato | presente | sort "added" non utile |
| `downloads` journal mai letto per query | presente | ridondanza con `tracks.downloaded_at` |
| Generi: euristica deterministica | buona base | precisione non misurata |
| Test automatici | assenti | regressioni non intercettate |
| macOS | non pronto | blocchi di path, chrome, firma, update |
| Auto-update | non effettivo | release zip senza Squirrel |

## 6. Punti di forza

- Separazione dei processi chiara e coerente con Electron.
- `contextIsolation`, `sandbox`, `nodeIntegration: false`, devTools disattivati in produzione.
- Fuses Electron configurate, ASAR integrity, solo dipendenze necessarie.
- Spawn del sidecar con array di argomenti, senza shell.
- Protocollo `media://` con MIME e Range.
- SQLite con WAL, foreign keys, prepared statement e transazioni.
- Tipi IPC condivisi e preload minimale.
- Protocollo Python JSON lineare, stdout pulito, stderr separato.
- UI memoizzata, coda virtualizzata, cache art in memoria, CSS glass con fallback di produzione.
- Documentazione di piano e assessment generi sopra la media.

## 7. Rischi architetturali trasversali

### AUD-001 - La libreria e' duplicata in tre posti e viene riscansionata a ogni avvio

- Severita': ARANCIONE
- Layer: architettura, renderer, DB
- File: `PlayerSection.tsx:55-95`, `207-214`; `LibraryHome.tsx:91-113`; `library.ts:36-64`; `db.ts:290-325`
- Problema: SQLite e' la fonte autoritativa, ma il renderer carica tutte le tracce con `loadLibraryCache`, le tiene in memoria e poi lancia una scansione completa una volta per avvio. La paginazione di `library:query` e' usata solo per le viste All/Recent; tile e gruppi usano l'array completo.
- Evidenza: `loadLibraryCache` restituisce `listTracks()` senza limite; `saveLibraryCache` fa upsert di tutto; il commento "no rescan on launch" e' contraddetto dall'effetto `autoRefresh`.
- Soluzione: rendere il DB l'unica sorgente di lettura. Caricare solo la prima pagina, ottenere tile e gruppi da query aggregate, eseguire scansioni incrementali (mtime) o su richiesta. Tenere il JSON solo come export manuale.
- Alternative: mantenere la cache in memoria ma con limite e sincronizzazione incrementale; usare un worker per la scansione.
- Sforzo: M. Impatto: alto su avvio, memoria e CPU.

### AUD-002 - Le playlist restano su localStorage mentre lo schema SQLite le prevede

- Severita': GIALLO
- Layer: architettura, DB, renderer
- File: `playlists.ts:1-74`; `db.ts:91-102`; `PlaylistsPanel.tsx`; `PlayerSection.tsx:329-340`
- Problema: `playlists` e `playlist_tracks` esistono nel database ma non vengono mai usate. Le playlist sono path assoluti in localStorage, senza transazioni, senza integrita' referenziale e senza migrazione.
- Evidenza: `createPlaylist`, `savePlaylists`, `loadPlaylists` usano solo `localStorage`; nessun handler IPC per playlist.
- Soluzione: esporre `playlist:list/create/rename/add/remove/reorder` e persistere in SQLite con `position`; migrare una volta i dati localStorage.
- Alternative: mantenere localStorage ma accettare la perdita su pulizia storage e l'impossibilita' di query.
- Sforzo: M. Impatto: medio, ma chiude un debito strutturale previsto.

### AUD-003 - Il contratto main-sidecar e' derivato dal codice, non definito

- Severita': GIALLO
- Layer: architettura, main, sidecar
- File: `types/electron.d.ts:8-65`; `python-bridge.ts:16-65`; `interface/log.py:50-144`; `core.py:182-193`
- Problema: lo stesso dato ha forme diverse. `speed` e' numero nel renderer e stringa in Python; `timeout`, `max_retries` e `skipExisting` sono tipizzati ma non applicati; `output_path` e' un file per un singolo video e una cartella per una playlist; `saved` e' un progress speciale.
- Evidenza: `format_progress` emette `speed_str` come stringa; `safeProgressData` fa `Number(...)` e ottiene `NaN`, poi azzera. `download_media` accetta `timeout` e `max_retries` ma non li usa.
- Soluzione: definire un contratto versionato (`protocol: 1`), con campi numerici separati dalle stringhe di presentazione, unione discriminata per `progress/result/saved/error`, e validazione in main. Applicare `socket_timeout`, retries e skip lato Python.
- Alternative: generare i tipi dal protocollo o usare JSON Schema condiviso.
- Sforzo: M. Impatto: medio, riduce bug di progress e cancel.

### AUD-004 - macOS non e' pronto per il packaging

- Severita': GIALLO
- Layer: architettura, main, packaging
- File: `python-bridge.ts:134`; `library.ts:100`; `forge.config.js:62-77`; `setup-ffmpeg.js:26-29`; `window.ts:62-80`; `auto-updater.ts:8-15`
- Problema: percorso `python-runtime/python.exe` hardcoded, `afterCopy` costruisce `Resources` con case errato sul filesystem macOS, ffmpeg scaricato e' x86_64, mancano DMG, firma, notarization, menu e traffic lights nativi.
- Evidenza: il piano `docs/PLAN_RECENT_SORT_AND_MACOS.md:131-142` elenca gli stessi blocchi; il codice non li ha ancora risolti.
- Soluzione: helper `resolvePythonRuntime()` per piattaforma, build per architettura, maker DMG, hardened runtime, entitlements, notarytool, CI macOS, menu e chrome nativi.
- Alternative: distribuire solo Windows finche' la fase A non e' completa.
- Sforzo: M/L. Impatto: blocca la promessa macOS.

## 8. Direzioni di refactoring

1. Un solo modello di lettura: DB -> query paginate e aggregate -> renderer. Nessun array completo salvo viste esplicitamente "tutte".
2. Un solo modello di scrittura: scanner e tag passano da un `LibraryService` che aggiorna DB, FTS e cache in transazione.
3. Protocollo sidecar versionato, con timeout, cancel e result tipizzati.
4. Playlist e coda su SQLite, localStorage solo per preferenze UI.
5. Lifecycle per piattaforma in un modulo dedicato.
6. Test di contratto su IPC, DB e parser stdio prima di aggiungere feature.

## 9. Riferimenti

- Electron Security Checklist: <https://www.electronjs.org/docs/latest/tutorial/security>
- Electron IPC: <https://www.electronjs.org/docs/latest/tutorial/ipc>
- Electron protocol: <https://www.electronjs.org/docs/latest/api/protocol>
- Next static export: <https://nextjs.org/docs/app/building-your-application/deploying/static-exports>
- SQLite WAL: <https://www.sqlite.org/wal.html>
- SQLite FTS5: <https://www.sqlite.org/fts5.html>
- yt-dlp options: <https://github.com/yt-dlp/yt-dlp#usage-and-options>
- Python subprocess: <https://docs.python.org/3/library/subprocess.html>
- React useEffect: <https://react.dev/reference/react/useEffect>

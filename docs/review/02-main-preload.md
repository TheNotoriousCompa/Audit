# S2 - Main process e preload

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 13, non visti = 0, troncati = 0.
File: `main.ts`, `window.ts`, `ipc-handlers.ts`, `python-bridge.ts`, `library.ts`, `db.ts`, `mini-player.ts`, `tray.ts`, `media-protocol.ts`, `auto-updater.ts`, `logger.ts`, `preload.ts`, `types/electron.d.ts`.

## Sintesi

Il main process e' ben separato in moduli e usa le opzioni Electron corrette: sandbox, context isolation, niente Node nel renderer, fuses, devTools disattivati in produzione. La superficie di sicurezza pero' si ferma alla configurazione: gli handler IPC non verificano il mittente, accettano path arbitrari e non hanno timeout. Sono i tre interventi con il rapporto impatto/sforzo migliore.

## Finding

### AUD-101 - Nessuna validazione del mittente IPC; il mini player riceve l'API completa

- Severita': ARANCIONE
- Layer: main / preload
- Categoria: sicurezza, difesa in profondita'
- File: `src/main/ipc-handlers.ts:8-97`, `src/main/preload.ts:15-108`, `src/main/mini-player.ts:82-91`
- Problema: ogni handler `ipcMain.handle/on` ignora `event.sender` e `event.senderFrame`. Il mini player usa lo stesso preload della finestra principale, quindi puo' invocare download, scan, scrittura tag, chiusura finestra e query DB. Chi controlla il renderer del mini controlla l'intera API.
- Evidenza: `registerIPCHandlers()` registra i canali senza un controllo del sender; `ensureMiniPlayer()` usa `setMiniPreload(getPreloadPath())`, lo stesso file della main; `preload.ts` espone tutte le funzioni senza un flag di capacita'.
- Soluzione: introdurre `assertTrustedSender(event, { allowMini?: boolean })` che confronti `event.sender.id` con le finestre registrate e l'URL con `app://`/`http://localhost:3000` in dev. Creare un preload separato per il mini con i soli canali `mini:*` e `player:state`, oppure filtrare per `isMiniWindow` nel preload. Validare schema e limiti di ogni payload.
- Alternative: router IPC unico con allowlist per canale e capability token; MessagePort dedicato al mini.
- Sforzo: M. Impatto: alto. Rischio residuo basso perche' il renderer e' locale, ma la difesa in profondita' e' il punto.

### AUD-102 - Path locali arbitrari esposti a scan, art, tag, journal e media

- Severita': ARANCIONE
- Layer: main / preload
- Categoria: sicurezza, integrita' dati
- File: `src/main/ipc-handlers.ts:39-69`, `src/main/library.ts:105-221`, `src/main/media-protocol.ts:41-51`
- Problema: `library:scan` accetta qualsiasi directory; `library:art` e `library:writeTags` accettano qualsiasi path; `library:recordDownload` scrive un path arbitrario nel DB; `media://` serve qualsiasi file audio assoluto. Non esiste un elenco delle root della libreria ne' un controllo di appartenenza.
- Evidenza: `scanLibrary(dir)` verifica solo che sia una directory; `getTrackArt(filePath)` e `writeTrackTags(filePath, ...)` passano il path a Python; `media-protocol.ts` normalizza e controlla l'estensione, non la root. Il commento "directory traversal is rejected" descrive solo `path.normalize`.
- Soluzione: registrare le root in main; per ogni operazione risolvere il path con `fs.realpathSync.native`, verificare che `path.relative(root, file)` non inizi con `..` e che l'estensione sia audio. `media://` deve accettare un id o un path gia' validato contro le root. `recordDownload` deve accettare solo path di file della libreria.
- Alternative: spostare la scelta del file in un dialog main-owned; usare handle di file invece di path.
- Sforzo: M. Impatto: alto. Senza questo, un renderer compromesso puo' leggere metadati e riscrivere tag di file audio fuori dalla libreria.

### AUD-103 - Scan, art e tag non hanno timeout ne' cancellazione

- Severita': ARANCIONE
- Layer: main
- Categoria: affidabilita'
- File: `src/main/library.ts:105-168`, `173-221`, `223-271`
- Problema: ogni chiamata spawna un processo Python e risolve solo su `close`. Se mutagen si blocca, il disco e' lento o il processo resta appeso, la Promise resta pendente, la UI resta in `scanning` e il processo resta vivo. Non c'e' un limite di concorrenza per l'art.
- Evidenza: nessun `setTimeout`, `AbortController` o `proc.kill()` nei tre flussi; `useArt` puo' lanciare una richiesta per ogni riga visibile.
- Soluzione: wrapper `runSidecar(args, { timeoutMs })` con kill dell'albero (`taskkill /T /F` su Windows, `SIGKILL` su Unix), timer e cleanup; limite di concorrenza per art (2-4); cache lato main. Restituire un errore tipizzato al renderer.
- Alternative: sidecar persistente con request id, watchdog e coda.
- Sforzo: S/M. Impatto: alto sulla percezione di blocco.

### AUD-104 - Cancel download: SIGTERM, file parziali e nessun timeout main

- Severita': GIALLO
- Layer: main / sidecar
- Categoria: affidabilita', igiene filesystem
- File: `src/main/python-bridge.ts:97-111`, `171-270`; `python/downloader/core.py:182-193`, `385-405`
- Problema: `stopDownload` invia `SIGTERM` e azzera il riferimento. Il processo puo' lasciare `.part`, thumbnail e file temporanei; `runDownload` resta in attesa del `close`; il main non applica `options.timeout`; la race tra cancel e result non e' gestita con un esito esplicito.
- Evidenza: nessun cleanup in `close`, nessun `finally`, nessuna directory temporanea per download; `timeout` e' passato a Python ma non usato la' (`AUD-304`).
- Soluzione: creare una directory temporanea per download, kill dell'albero, cleanup su cancel/error, risolvere subito con `cancelled`, timer main-side che termina il processo. Su Windows usare un Job Object per evitare figli orfani.
- Alternative: download in una coda persistente con stato e ripresa.
- Sforzo: M. Impatto: medio-alto.

### AUD-105 - `backgroundThrottling: false` su main e mini tiene attivi i loop nascosti

- Severita': GIALLO
- Layer: main / renderer
- Categoria: performance, batteria
- File: `src/main/window.ts:72-80`, `src/main/mini-player.ts:82-91`, `src/components/player/Visualizer.tsx:37-147`
- Problema: entrambe le finestre disabilitano il throttling. Quando la main e' minimizzata o nascosta, il renderer continua a eseguire timer e rAF. `Waves` gestisce `visibilitychange`, ma il `Visualizer` no, quindi il canvas continua a ridisegnare anche con la finestra nascosta.
- Evidenza: `backgroundThrottling: false` in entrambe le `webPreferences`; `Visualizer.draw()` richiama `requestAnimationFrame` in ogni ramo, anche con larghezza zero.
- Soluzione: lasciare il throttling attivo sulla main (l'audio continua comunque), mettere in pausa il visualizer su `document.hidden` e quando il canvas non e' visibile; mantenere `false` sul mini solo se serve per l'aggiornamento di stato.
- Alternative: abbassare il frame rate del visualizer a 30 fps e usare `IntersectionObserver`.
- Sforzo: S. Impatto: medio.

### AUD-106 - `initDb` non e' protetto e il DB non viene chiuso

- Severita': GIALLO
- Layer: main / DB
- Categoria: affidabilita', integrita'
- File: `src/main/main.ts:29-31`, `src/main/db.ts:35-49`
- Problema: se `better-sqlite3` non carica l'ABI corretta o il file e' corrotto, `new Database` o `migrate` lancia e il bootstrap termina. Non esiste un fallback, un backup o un `db.close()` su quit.
- Evidenza: `initDb()` e' chiamato dentro `whenReady` senza try/catch; `app.on('will-quit')` non esiste; WAL non viene checkpointato esplicitamente.
- Soluzione: try/catch con fallback alla cache JSON e messaggio UI; backup del DB prima delle migrazioni; `app.on('will-quit', () => closeDb())`; `PRAGMA integrity_check` all'avvio in caso di crash precedente.
- Alternative: spostare il DB in un worker thread per isolare i crash, ma better-sqlite3 e' sincrono e veloce.
- Sforzo: S. Impatto: medio.

### AUD-107 - Lifecycle: doppio quit e buco macOS con mini aperto

- Severita': VERDE
- Layer: main
- Categoria: lifecycle, portabilita'
- File: `src/main/main.ts:39-56`, `src/main/window.ts:62-108`, `src/main/mini-player.ts:57-107`
- Problema: su Windows/Linux il close della main chiama `app.quit`, poi `window-all-closed` lo chiama di nuovo. Su macOS, se la main viene chiusa mentre il mini e' aperto, `activate` non ricrea la main perche' il mini conta come finestra; l'utente resta senza finestra principale. Il chrome e' ancora quello Windows-style.
- Evidenza: `BrowserWindow.getAllWindows().length === 0` in `activate`; `win.on('closed')` e `window-all-closed` duplicati.
- Soluzione: un solo punto di quit, `activate` che ricrea la main se non esiste anche quando il mini e' aperto, gestione separata del close macOS (hide invece di destroy), chrome nativo.
- Alternative: mantenere la main sempre viva su macOS e nasconderla.
- Sforzo: S/M. Impatto: medio su macOS, basso su Windows.

### AUD-108 - Log di produzione rumorosi e codice morto

- Severita': VERDE
- Layer: main / preload
- Categoria: manutenzione, privacy locale
- File: `src/main/preload.ts:7`, `18`, `22`, `27`, `30`, `43`, `47`, `51`, `110`; `src/main/python-bridge.ts:137-138`, `169`; `src/main/mini-player.ts:11-13`, `187-190`
- Problema: il preload stampa in console query, opzioni e path; il main stampa il comando completo con URL. In produzione i devtools sono chiusi, ma il preload lascia comunque messaggi nella console del renderer e il main li scrive nei log. `registerQuitHooks` e il canale `mini:show` non sono usati.
- Evidenza: `console.log('convertYoutube called with query:', query, ...)`; `console.log('Running command:', pythonExecutable, args.join(' '))`; `registerQuitHooks()` vuoto.
- Soluzione: log solo in dev o tramite logger con livelli; rimuovere export e canali morti; non loggare URL complete.
- Alternative: mantenere un log diagnostico opt-in.
- Sforzo: S. Impatto: basso.

## Punti di forza

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` su main e mini.
- `devTools: isDev`, `webSecurity: !isDev`: dev comodo, produzione chiusa.
- Fuses: `RunAsNode: false`, `OnlyLoadAppFromAsar`, ASAR integrity, cookie encryption.
- Spawn dei sidecar con argv array, nessuna shell, env UTF-8 esplicito.
- Protocollo `media://` registrato prima di `app.ready`, con MIME e Range.
- Mini player con preload taggato via `additionalArguments`, quindi nessuna race hash/IPC in produzione.
- `resolveOnce` nel bridge impedisce doppie risoluzioni.
- Tray, minimize-to-mini, quit bypass e riapertura della main sono cablati e testati su Windows.

## Riferimenti

- Electron security: <https://www.electronjs.org/docs/latest/tutorial/security>
- `contextBridge`: <https://www.electronjs.org/docs/latest/api/context-bridge>
- `protocol.handle`: <https://www.electronjs.org/docs/latest/api/protocol>
- Fuses: <https://www.electronjs.org/docs/latest/tutorial/fuses>
- Node child process: <https://nodejs.org/api/child_process.html>
- OWASP ASVS: <https://owasp.org/www-project-application-security-verification-standard/>

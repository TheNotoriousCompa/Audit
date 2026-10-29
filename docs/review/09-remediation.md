# Remediation - Fasi 0-3

Commit applicativo: `77c9daa` (`feat: harden downloads, library data and player runtime`).
Stato: fasi 0-3 implementate su `dev`. UI invariata: nessun componente o foglio di stile e' stato ridisegnato.
Verifica: `npm run verify` verde, build di produzione completata, app avviata e controllata via CDP.

## 1. Fase 0 - Rete di sicurezza

- `npm run verify` esegue typecheck main/preload/renderer, ESLint, test unitari e test DB.
- Nuovo `tests/index.test.ts`: path policy, JSON line decoder, FTS query, download policy.
- Nuovo `tests/db-smoke.cjs`: DB nuovo, prune, journal, FTS con input speciale, migrazione v1 -> v2, backup.
- CI: `npm run verify` e `npm audit` prima del publish; il tag deve corrispondere a `package.json.version`.
- `noEmitOnError: true` per impedire build con errori di tipo.
- Warning ESLint azzerati.

## 2. Fase 1 - Sicurezza, path e download

- `trust.ts`: registro delle finestre main/mini e controllo del mittente su IPC.
- `preload-mini.ts`: API ridotta ai soli comandi del mini player. Il mini non puo' piu' chiamare scan, tag, download o query.
- `approved-paths.ts`: root approvate, download dir persistenti, controllo con `realpath`, allowlist estensioni audio.
- `library:scan`, `art`, `writeTags`, `recordDownload` e `media://` rifiutano path fuori dalle cartelle approvate.
- URL di download limitati a YouTube e `ytsearch`; le opzioni di formato sono validate.
- `process-tree.ts` e `sidecar-runner.ts`: timeout, kill dell'albero, limite dimensione riga, stderr separato.
- Download: watchdog di inattivita' basato su `timeout`, kill tree su stop, journal solo per file approvati.
- Collisioni: outtmpl con video id, `unique_path` con suffisso, nessun `unlink` di file esistenti.
- Playlist: `requested_downloads` prima di `_filename`; cleanup thumbnail distruttivo rimosso.
- yt-dlp: nessun update prima di ogni download; update saltato nel runtime pacchettizzato senza pip.
- Tag: scrittura su copia temporanea e `os.replace`, campi vuoti cancellabili, errori di metadata loggati.
- Opzioni: `skipExisting`, `max_retries`, `socket_timeout` applicati; `speed` numerica separata dalla stringa.
- Genere: rimosso il seed duplicato `daft punk`; tag write restituisce `genre_guess`.

## 3. Fase 2 - SQLite

Schema v2 con migrazione transazionale e backup `.v1.bak`:

- `path_key` normalizzato per confronti Windows case-insensitive;
- `missing_since` con retention di 7 giorni;
- prune delle tracce fuori dalle root e dei download orfani;
- indice sull'espressione `COALESCE(downloaded_at, mtime)`;
- trigger FTS solo sui campi indicizzati;
- `recordDownload` in transazione e update per `path_key`;
- `closeDb` su `will-quit` con checkpoint WAL;
- `applyLibraryScan` unico punto di scrittura per scan e prune;
- FTS sanitizzato con fallback `LIKE`;
- tag write con upsert immediato nel DB e invalidazione art;
- `initDb` protetto nel bootstrap, con log e continuazione.

La migrazione reale e' stata applicata con successo: `audit.db` v1 -> v2, backup creato.

## 4. Fase 3 - Renderer e performance

- Auto-scan all'avvio saltato se la cache ha meno di 30 minuti; download e scan manuali continuano a funzionare.
- Gli errori di scan non sostituiscono piu' la libreria con un risultato parziale.
- Art: cache LRU nel main, deduplica delle richieste, thumbnail JPEG per immagini grandi; cache LRU anche nel renderer.
- Invalidazione art dopo il tag edit, sia main sia renderer sia mini.
- Mini: art inviata solo al cambio traccia o ogni 5 secondi; merge lato mini per non perdere l'artwork.
- Visualizer in pausa quando il canvas non e' visibile o la finestra e' nascosta.
- Rimozione della traccia corrente o clear della coda: pausa, reset `src`, posizione e durata.
- `LibraryHome`: request id contro risposte stale, catch degli errori, conteggio header corretto, contesto di play completo caricato on demand.
- `useArt` con limite cache e deduplica delle richieste in volo.

## 5. Verifiche eseguite

| Verifica | Esito |
|---|---|
| `npm run verify` | typecheck, lint, 8 test unitari, DB smoke verdi |
| `npm run build` | build di produzione completata |
| Migrazione DB reale | schema v2, backup `.v1.bak` |
| Scansione cartella approvata | 1 traccia, tag e genere letti |
| Scansione cartella non approvata | rifiutata |
| Download non YouTube | rifiutato prima dello spawn |
| Riproduzione `media://` | audio caricato, `readyState 4`, nessun errore |
| Mini player | `isMiniWindow=true`, `scanLibrary` e `writeTags` assenti |
| Rimozione traccia corrente | audio in pausa, `src` rimosso |
| Tag write Python | scrittura atomica, genere inferito, campo vuoto cancellato |

## 6. Cosa resta

Fuori dalle fasi 0-3, da affrontare nella fase 4:

1. Boot completamente DB-first: rimuovere l'array completo dal renderer, aggiungere facets e query aggregate per artisti/album/generi.
2. Playlist e coda su SQLite; migrazione da localStorage.
3. Copy e accessibilita': em dash residui, versioni, aria-label, seek da tastiera.
4. macOS: runtime per piattaforma, ffmpeg arm64, chrome e menu nativi, DMG, firma e notarization.
5. Auto-update: Squirrel o `electron-updater`, non zip senza updater.
6. Electron 28 EOL: upgrade con matrice better-sqlite3.
7. Supply chain: requirements pinnati con hash, ffmpeg versionato, checksum dei download.
8. Error boundary e mini player senza flash iniziale.
9. Misure runtime con CDP trace su avvio, scan e mini.

## 7. Nota operativa

`npm run build` fallisce se l'app Electron e' aperta, perche' better-sqlite3 e' caricato e il file nativo e' bloccato. Chiudere l'app prima della build. `npm run verify` non richiede la chiusura, ma esegue `build:main` e il test DB in un processo Electron separato.

## 8. Fix successivi

- `Recently downloaded` ora usa `downloadedOnly`: la vista mostra solo le tracce con `downloaded_at`, non l'intera libreria ordinata per mtime. Verificato: 1 traccia su 1406.
- Il menu dei tre puntini di `TrackRow` e' renderizzato in un portal su `document.body`, con posizione fissa e `z-index: 1000`. Non viene piu' tagliato dai contenitori `overflow` della libreria; se la riga e' in basso, il menu si apre verso l'alto. Verificato con menu dentro il viewport e `elementFromPoint` sopra il menu.
- Il sort scelto in `All Songs` non viene piu' sovrascritto aprendo `Recently downloaded`.

## 9. FFmpeg preflight e messaggi

- Nuovo `ffmpeg-status.ts`: risoluzione in ordine `AUDIT_FFMPEG_PATH`, bundle, PATH, percorsi comuni Windows; nessuna scansione profonda di `C:\`.
- Il binario viene validato con `ffmpeg -version` e timeout di 3 secondi; il risultato include path e versione.
- IPC `system:ffmpegStatus` e `system:ffmpegHelp`; il renderer mostra un banner ambra solo quando FFmpeg manca.
- `Recheck` invalida la cache e ricontrolla senza riavviare; `How to fix` apre la pagina ufficiale.
- Il messaggio completo del fallimento viene propagato da `result.message` quando `result.error` è vuoto.
- `check_ffmpeg` Python usa lo stesso ordine e non esegue piu' `where /R C:\`.
- Test manuale Windows per amici: `docs/FFMPEG_TEST_CHECKLIST.md`.

## 10. Videos

- I file `.mp4` sono esclusi da All Songs, Artists, Albums, Genres, Recently downloaded e Folders.
- Nuova categoria `Videos` nella Library, con conteggio separato e ricerca dedicata.
- `library:query` supporta `mediaType: 'music' | 'videos'`; il DB filtra `ext`.
- Il click su un video apre un player overlay con `<video controls autoPlay>` e `media://`; l'audio del player musicale viene messo in pausa.
- Il protocollo serve `.mp4` come `video/mp4`.
- La coda musicale non include i video.

# S7 - Test, script, configurazione e documentazione

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 20, non visti = 3 (`components.json`, `DESIGN.md`, `tsconfig.ts-node.json`), troncati = 0.
File: `scripts/*`, `setup-*.js`, tsconfig, `eslint.config.mjs`, `postcss.config.js`, `.gitignore`, `README.md`, `REPORT.md`, `context.md`, `docs/*` (tranne il JSON generato dell'audit).

## 1. Test esistenti

Non esiste una suite di test. Il repository non contiene `__tests__`, `*.test.*`, `*.spec.*`, fixture o configurazioni Vitest/Jest/Pytest. `package.json` non ha uno script `test`. La CI non esegue test.

| Layer | Test presenti | Test mancanti critici |
|---|---|---|
| main / IPC | 0 | validazione sender, payload, timeout, cancel |
| DB | 0 | migrazioni, prune, FTS, path canonico, journal |
| sidecar | 0 | parser stdout, progress, playlist, tag, ffmpeg |
| renderer | 0 | LibraryHome, queue, player, mini bridge |
| generi | 0 (solo audit manuale) | precisione su campione, regressione seed |
| packaging | 0 | asar, extraResource, CSS backdrop-filter, avvio pacchetto |
| mini player | 0 | hide/show, quit, doppia finestra, posizione |

## 2. Finding

### AUD-701 - Nessun test automatico

- Severita': ARANCIONE
- Layer: trasversale
- Categoria: qualita'
- File: repository, `package.json:14-38`
- Problema: ogni modifica a DB, sidecar o player e' verificata solo manualmente. I bug di prune, tag, coda e progress possono regredire senza essere visti.
- Evidenza: nessun file di test tracciato; nessuno script `test`; CI senza test.
- Soluzione: partire da test unitari veloci con `node:test` o Vitest per DB e parser, `pytest` per il sidecar, Playwright per Electron per i flussi critici. Aggiungere fixture audio piccole (1-2 secondi) e un DB temporaneo.
- Alternative: iniziare con test di contratto e smoke test, senza copertura UI completa.
- Sforzo: M. Impatto: alto nel tempo.

### AUD-702 - Mancano i test di contratto piu' importanti

- Severita': GIALLO
- Layer: trasversale
- Categoria: qualita'
- File: `src/main/python-bridge.ts:187-270`, `src/main/db.ts:51-135`, `290-325`, `src/main/library.ts:105-271`
- Problema: i punti piu' fragili non hanno test: framing delle righe JSON, riga parziale, `result` vs `saved`, timeout, cancel; migrazione DB e FTS; scan con file rotto; tag write e art; playlist con entry mancanti.
- Evidenza: il protocollo stdio e' implementato a mano in tre punti (`python-bridge`, `library.scan`, `writeTrackTags`, `getTrackArt`), senza un parser condiviso testato.
- Soluzione: estrarre un `JsonLineDecoder` testato e usarlo in tutti i flussi; testare un DB in memoria con migrazioni; fixture Python per scan/tag/art; test di playlist con un video finto o mock di yt-dlp.
- Alternative: test end-to-end con un URL pubblico, piu' lenti e fragili.
- Sforzo: M. Impatto: alto.

### AUD-703 - I controlli statici non sono in CI; ESLint ha un warning

- Severita': GIALLO
- Layer: tooling / CI
- Categoria: qualita'
- File: `eslint.config.mjs:12-25`, `tsconfig.base.json:16`, `.github/workflows/publish.yml`
- Problema: `tsc` e `eslint` passano localmente ma non sono nella pipeline. `noEmitOnError: false` permette a `tsc` di emettere JS anche con errori di tipo, quindi un build rotto puo' essere impacchettato. ESLint segnala una dipendenza superflua in `LibraryHome.tsx:122`. Non c'e' lint Python.
- Evidenza: `npx eslint src` -> 1 warning, 0 errori; `tsc` passa su 4 configurazioni; nessun passo nel workflow.
- Soluzione: aggiungere `typecheck`, `lint`, `npm audit`, `python -m compileall` e test alla CI; impostare `noEmitOnError: true` per main/preload; correggere il warning; aggiungere Ruff e mypy (almeno sui moduli nuovi).
- Alternative: un `pre-commit` locale oltre alla CI.
- Sforzo: S. Impatto: alto, basso costo.

### AUD-704 - Script e configurazioni morti o rotti

- Severita': GIALLO
- Layer: tooling
- Categoria: manutenzione
- File: `scripts/fix-imports.js:1-29`, `scripts/fetch-autoeq.js:1-120`, `package.json:14-38`, `python/setup.py:1-33`, `python/downloader/config.py:1-115`, `python/interface/ipc.py:23-80`
- Problema: `fix-imports.js` antepone import ESM a un main compilato CommonJS e non e' richiamato da nessuno script; se eseguito rompe il build. `fetch-autoeq.js` non e' collegato a un comando npm e l'output non e' importato. `export:renderer` usa `next export`, rimosso. `restart` usa `pkill`, non disponibile su Windows. `setup.py` e' boilerplate con entry point inesistente. `config.get_ydl_opts` non importa `logging` e ha chiavi duplicate. `ipc.read_input`/stdin non e' usato.
- Evidenza: nessun riferimento a `fix-imports` in `package.json`; `next export` non esiste in Next 15; `pkill` in script Windows; `logging.getLogger` senza import.
- Soluzione: eliminare gli script morti o ripararli e aggiungerli a `package.json`; sostituire `next export` con `next build`; rendere `restart` cross-platform; allineare `setup.py` alla struttura reale o rimuoverlo; rimuovere il percorso stdin se non e' supportato.
- Alternative: marcare esplicitamente gli script come legacy in una cartella `scripts/legacy`.
- Sforzo: S. Impatto: basso-medio, riduce errori per chi contribuisce.

### AUD-705 - Configurazione TypeScript e build non abbastanza severa

- Severita': GIALLO
- Layer: tooling
- Categoria: qualita'
- File: `tsconfig.base.json:1-20`, `tsconfig.json:26-39`, `tsconfig.main.json:1-13`, `tsconfig.preload.json:1-13`, `package.json:40-100`
- Problema: `noEmitOnError: false`; mancano `noUnusedLocals` e `noUnusedParameters`; il tsconfig renderer include `dist/renderer/types` generato; non ci sono `engines` o `packageManager`; le versioni Electron e better-sqlite3 usano caret; `postinstall` esegue rebuild nativo sempre. Il progetto non ha un formatter o un `.editorconfig`.
- Evidenza: base `noEmitOnError: false`; nessun `engines`; `electron: ^28.3.3`; `postinstall` rebuild.
- Soluzione: attivare `noEmitOnError` per i build main/preload, `noUnused*` come warning, rimuovere include generati, aggiungere `engines`/`packageManager`, valutare Prettier o lasciare ESLint come formatter. Documentare il rebuild nativo.
- Alternative: mantenere la configurazione attuale e affidarsi alla CI.
- Sforzo: S. Impatto: basso-medio.

### AUD-706 - Documentazione di progetto forte sui piani, stale sullo stato reale

- Severita': VERDE
- Layer: docs
- Categoria: documentazione
- File: `README.md:1-55`, `REPORT.md:1-64`, `context.md:1-37`, `docs/PLAYER.md:38-85`, `docs/PLAN_RECENT_SORT_AND_MACOS.md:26-85`, `docs/GENRE_ASSESSMENT.md:17-46`
- Problema: i documenti di piano e assessment sono utili e dettagliati. Quelli di stato sono indietro: README promette `Audit-Setup.exe` e auto-update, ma la release e' zip e l'update e' disabilitato; parla di build Windows/Mac/Linux, ma la CI e' solo Windows; non menziona SQLite, branch `dev`, setup Python/ffmpeg o limiti macOS. `REPORT.md` descrive una diagnosi Squirrel superata. `context.md` cita v1.2.12 e moduli non piu' attuali. `PLAYER.md` elenca rating 1-5 e "Top Rated" (rimossi) e dice che il tag editor e' fase 2 (ora implementato). `PLAN_RECENT` descrive `audit-downloads.json`, mentre l'implementazione usa SQLite. `Info` mostra v1.3 invece di 1.3.1.
- Evidenza: README righe 11, 15, 51; `PLAYER.md:48`; `Info.tsx:57`; `context.md:16`.
- Soluzione: aggiornare README e context allo stato attuale, marcare REPORT come storico, aggiornare PLAYER e PLAN_RECENT con lo stato implementato, aggiungere un indice `docs/review/README.md`, leggere la versione da una fonte sola. Non toccare la UI in questa review.
- Alternative: spostare i documenti superati in `docs/archive/`.
- Sforzo: S. Impatto: medio per nuovi contributor e utenti.

## 3. Controlli eseguiti

| Comando | Esito | Note |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.main.json` | 0 errori | main |
| `npx tsc --noEmit -p tsconfig.preload.json` | 0 errori | preload |
| `npx tsc --noEmit --incremental false -p tsconfig.json` | 0 errori | renderer, Next |
| `npx tsc --noEmit -p tsconfig.ts-node.json` | 0 errori | tooling TS |
| `npx eslint src` | 0 errori, 1 warning | `LibraryHome.tsx:122` |
| `npm audit --omit=dev` | 0 vulnerabilita' | audit online |
| AST parse di 17 file Python | 17 ok | `SyntaxWarning` in `search.py:15` |
| `git diff main...dev --stat` | 28 file, +2189/-524 | delta dev |

Non eseguiti: build completa, `npm run make`, test runtime Electron, trace di memoria, misure su macOS. Sono fuori dal perimetro statico di questa review e vanno pianificati come smoke test.

## 4. Matrice di test consigliata

| Priorita' | Test | Strumento |
|---|---|---|
| P0 | parser JSON line con riga parziale, result, saved, errore | node:test |
| P0 | migrazione DB, prune, FTS, path canonico | Vitest + DB temp |
| P1 | scan fixture con tag/art corrotti | pytest |
| P1 | tag write e rilettura per MP3/M4A/FLAC | pytest |
| P1 | playlist con entry None e file mancanti | pytest mock yt-dlp |
| P1 | queue play/remove/clear e mini state | Playwright Electron |
| P2 | LibraryHome paginazione, ricerca, errori | Playwright |
| P2 | packaging: asar, extraResource, CSS, avvio | script CI |
| P2 | genere: campione etichettato e regressione | pytest + CSV |
| P3 | accessibilita' tastiera e contrasto | axe + manuale |

## 5. Tooling suggerito

- TypeScript: `tsc --noEmit` per main, preload e renderer; `noEmitOnError` attivo per i build.
- Lint: ESLint gia' presente; aggiungere `eslint-plugin-import` o `@typescript-eslint/no-floating-promises` se serve.
- Python: Ruff (lint + format) e mypy sui moduli nuovi; `python -m compileall` in CI.
- Test: Vitest o `node:test` per main/DB; pytest per sidecar; Playwright per Electron.
- Packaging: smoke test che avvia il pacchetto, controlla `backdrop-filter`, `python-runtime`, `ffmpeg` e una scansione di una fixture.
- Sicurezza: `npm audit --omit=dev`, `pip-audit`, Dependabot/Renovate.
- Docs: indice review, link a questo report, versione unica.

## 6. Priorita'

1. `AUD-701` + `AUD-702`: test di contratto e DB.
2. `AUD-703`: gate CI, `noEmitOnError`.
3. `AUD-706`: README/context/PLAYER allineati.
4. `AUD-704`, `AUD-705`: pulizia script e configurazione.

## Riferimenti

- Node test runner: <https://nodejs.org/api/test.html>
- Vitest: <https://vitest.dev/>
- pytest: <https://docs.pytest.org/>
- Playwright Electron: <https://playwright.dev/docs/api/class-electron>
- Ruff: <https://docs.astral.sh/ruff/>
- mypy: <https://mypy.readthedocs.io/>
- TypeScript `noEmitOnError`: <https://www.typescriptlang.org/tsconfig#noEmitOnError>

# Audit — Piano di esecuzione della Full-Project Code Review (v4)

Stato: **solo pianificazione**. Nessun file di codice è stato modificato o eseguito per produrre questo piano.

---

## 1. Obiettivo e perimetro

Eseguire la review completa del progetto Audit (Electron + Next static export + React 19 + Tailwind 4 + sidecar Python + SQLite + packaging Forge + CI) seguendo la struttura v4: Fase 0 inventario, Fase 1 architettura, Fase 2 deep dive per layer, consolidamento finale.

Perimetro deciso:

- **Snapshot di review**: il branch `dev` al commit registrato all'inizio della Sessione 0 (SHA salvato nel report). `main` (v1.3.1) viene usato come termine di confronto per distinguere debito preesistente da debito introdotto su `dev`.
- **Codice sorgente**: `src/`, `python/`, `scripts/`, `.github/`, configurazioni root (`forge.config.js`, `next.config.js`, `package.json`, tsconfig, eslint, postcss), `docs/`.
- **Esclusi**: `node_modules/`, `dist/`, `out/`, `.next/`, `python-runtime/`, `ffmpeg/`, cache, binari. Sono esclusi dalla lettura ma non dalla valutazione di packaging (si valuta cosa il codice si aspetta che contengano).
- **Non modificare nulla durante la review**. Le patch sono proposte nei finding, applicate solo dopo approvazione.

## 2. Regole operative

- Ogni sessione apre con: `Copertura: file visti = N, non visti = M, troncati = K`.
- Nessun giudizio su file non letti. Le dipendenze non verificate diventano "da verificare" con domanda precisa.
- Finding con ID `AUD-###`, severità (ROSSO/ARANCIONE/GIALLO/VERDE), layer, categoria, file:riga, evidenza, patch, alternative, sforzo/impatto.
- Citare la fonte per ogni best practice invocata (Electron Security Checklist, React docs, Next static export, SQLite docs, OWASP ASVS, Python docs, yt-dlp/ffmpeg/mutagen docs).
- Separare opinioni stilistiche da problemi oggettivi; segnalare anche ciò che è fatto bene.
- Un finding cross-layer invece di duplicare lo stesso problema in più layer.
- Ogni sessione produce un file in `docs/review/` (vedi §5) e si chiude con "Domande aperte" se manca contesto.

## 3. Ordine delle sessioni (risk-based)

L'ordine non segue l'ordine dei layer ma il rischio per Audit: prima ciò che può rompere sicurezza, dati o distribuzione; poi UI e qualità.

| # | Sessione | Fase | Layer | Perché prima | Stima |
|---|---|---|---|---|---|
| S0 | Inventario e mappa | 0 | tutto | Base obbligatoria, definisce copertura e split | 30–45 min |
| S1 | Architettura | 1 | tutto | Confini e contratti guidano i deep dive | 45–60 min |
| S2 | Main + preload | 2 P1 | main/preload | Superficie di sicurezza e spawn processi | 60–90 min |
| S3 | DB SQLite | 2 P4 | DB | Integrità dati, journal, migrazioni (dev in movimento) | 60–90 min |
| S4 | Sidecar Python | 2 P3 | sidecar | Contratto stdio, cancellazione, tag/ffmpeg | 60–90 min |
| S5 | CI / packaging / release | 2 P5 | CI/packaging | Riproducibilità, asar, futura notarization | 45–60 min |
| S6 | Renderer | 2 P2 | renderer | Stato, hydration, performance, due finestre | 75–90 min |
| S7 | Test, script, config | 2 P6 | trasversale | Chiude i buchi e valuta il tooling | 45–60 min |
| S8 | Consolidamento | finale | tutto | Risk register, backlog, quick wins | 45 min |

Totale indicativo: **7–9 ore** distribuite in 2–3 giornate. Ogni sessione è autonoma e produce un artefatto.

## 4. Dettaglio delle sessioni

### S0 — Inventario e mappa (Fase 0)

Azioni previste:
1. `git ls-files` filtrato (esclusi gli esclusi), albero per cartella.
2. Classificazione per ruolo: main, preload, renderer, sidecar, DB, config, CI, script/test/asset/docs.
3. Marcatura hot/cold: main entry, preload, IPC handlers, spawn, sidecar entry, schema/migrazioni, forge/CI sono hot; asset e docs sono cold.
4. Tabella di copertura con stato (visto/da vedere/non visto) e dichiarazione dei file non leggibili.
5. Proposta di eventuale ulteriore split se un layer supera le ~15 file o ~3.000 righe.

Output: `docs/review/00-inventory.md` con tabella, hot list e split confermato.

### S1 — Architettura (Fase 1)

Domande guida:
- Confini main/preload/renderer/sidecar/DB: ci sono violazioni (I/O nel renderer, logica UI nel main, accesso DB dal sidecar)?
- Contratti: IPC (canali, tipi, validazione, errori), stdio JSON (framing, versioning, cancellazione, backpressure), DB (chi scrive, chi legge, cache).
- Stato: main autoritativo? mini player duplica? cache JSON legacy ancora viva?
- Lifecycle: startup, shutdown, crash, migrazioni DB, close-to-mini vs minimize-to-mini.
- Config: dev vs prod, export statico, path, asar, sidecar in produzione.
- Packaging: cosa finisce nel pacchetto, unpack natives, extraResource, postbuild CSS.
- Testing: cosa esiste, cosa manca per layer.
- Debito strutturale e rischi per macOS/notarization, playlist su DB, gruppi via query.

Output: `docs/review/01-architecture.md` con punti di forza, rischi, zone da approfondire.

### S2 — P1 Main process + preload

Ambito: `src/main/*` (main, window, ipc-handlers, python-bridge, library, db, mini-player, tray, media-protocol, auto-updater, logger, preload).
Checklist: security Electron (contextIsolation, sandbox, nodeIntegration, sender validation), superficie preload minima, validazione payload IPC, spawn con shell:false e path assoluti, gestione exit code/stderr/kill, lifecycle e quit, mini player, protocollo `media://`, gestione errori e logging.
Output: `docs/review/02-main-preload.md`.

### S3 — P4 SQLite

Ambito: `src/main/db.ts`, uso in `library.ts`/`ipc-handlers.ts`, schema e migrazioni, FTS5, journal download.
Checklist: prepared statements, transazioni, WAL e checkpoint, migrazioni idempotenti, trigger FTS insert/update/delete, integrità journal↔tracks↔playlist, indici coerenti con sort/paginazione, import legacy, crescita DB.
Output: `docs/review/03-db.md`.

### S4 — P3 Sidecar Python

Ambito: `python/downloader/*`, `python/library/*`, `python/interface/*`, entrypoint.
Checklist: framing JSON, stderr separato, encoding, timeout, cancellazione (`stopDownload`) e kill, retry/timeout HTTP, scrittura tag atomica, gestione ffmpeg (argomenti, codec, output, errori), thread safety, contratto con il main (tipi e campi, es. `saved`, `output_path`).
Output: `docs/review/04-sidecar.md`.

### S5 — P5 CI, packaging, release

Ambito: `forge.config.js`, `next.config.js`, `.github/workflows/*`, `setup-*.js`, `scripts/postbuild-css.js`, `package.json` scripts, lockfile.
Checklist: riproducibilità, npm ci, build statica, asar/unpack, extraResource, prune locale/python/ffmpeg, `backdrop-filter` in produzione, secrets e GITHUB_TOKEN, draft/publish, artefatti, futura notarization macOS (signing, entitlements, secrets), coerenza pacchetto↔sorgente.
Output: `docs/review/05-ci-packaging.md`.

### S6 — P2 Renderer

Ambito: `src/app/*`, `src/components/**`, tipi condivisi, stili globali.
Checklist: vincoli Next static export (niente server-only, image runtime), routing con due finestre, sincronizzazione main↔mini, autorità dello stato, hydration (localStorage in initializer), cleanup effetti e StrictMode, key stabili nella coda virtualizzata, performance (virtualizzazione, memo, animazioni CSS), accessibilità minima, coerenza accent/contrasto.
Output: `docs/review/06-renderer.md`.

### S7 — P6 Test, script, config

Ambito: presenza/assenza test, `scripts/*`, `setup-*.js`, tsconfig, eslint, postcss, docs, fixture.
Checklist: copertura per layer, test mancanti critici (IPC contract, DB migration, parser stdio), script di build/setup, lint/format, tooling suggerito (eslint-plugin-electron, ruff/mypy, schema IPC, sqlfluff, controlli packaging), docs allineate.
Output: `docs/review/07-tests-tooling.md`.

### S8 — Consolidamento

- Risk register aggregato (ID, severità, layer, rischio, mitigazione, sforzo).
- Backlog P0..P3 con ID.
- Quick wins.
- Refactoring prioritario con impatto/sforzo, considerando `main` stabile e `dev` in movimento.
- Rischi per i prossimi passi: macOS + notarization, playlist su DB, gruppi via query.
- TL;DR (max 5 righe).
Output: `docs/review/08-final.md`.

## 5. Deliverable e formato

Cartella `docs/review/`:

```
00-inventory.md
01-architecture.md
02-main-preload.md
03-db.md
04-sidecar.md
05-ci-packaging.md
06-renderer.md
07-tests-tooling.md
08-final.md
```

Ogni finding nel formato richiesto (ID, severità, layer, categoria, file/riga, problema, evidenza, soluzione, alternative, sforzo, impatto). Alla fine di ogni sessione: copertura e domande aperte.

## 6. Evidenze che verranno raccolte (quando si eseguirà)

Solo a scopo di piano, non eseguite ora:
- `git rev-parse HEAD` e `git diff main...dev --stat` per lo snapshot.
- `git ls-files` e conteggi righe per la mappa.
- `npx tsc --noEmit` per i tre tsconfig.
- `npm ls --depth=0`, `npm audit --omit=dev`.
- `npx eslint src` se la configurazione è valida.
- `python -m compileall python` e, se disponibili, `ruff`/`mypy`.
- Ispezione pragma SQLite (`journal_mode`, `user_version`, `integrity_check`) su un DB di test.
- Verifica artefatti in `out/make` e contenuto asar.

## 7. Criteri di qualità della review

- Ogni finding deve essere riproducibile o verificabile con file:riga.
- Se una valutazione dipende da codice non letto, va marcata "da verificare" con domanda.
- Niente finding duplicati: cross-layer quando serve.
- Bilanciamento: segnalare anche i punti di forza (contratti tipizzati, spawn sicuro, packaging corretto).
- La review non deve produrre modifiche: solo diagnosi e patch proposte.

## 8. Domande aperte (da confermare prima di S0)

1. Review su `dev` snapshot o su entrambi (`main` e `dev`) con diff? Proposta: snapshot `dev` + delta vs `main`.
2. Il supporto macOS è già in scope o solo i rischi futuri? Proposta: rischi e requisiti, non review di codice macOS inesistente.
3. Timebox: 2 giornate (S0–S5) e 1 giornata (S6–S8) oppure tutto in una sessione lunga? Proposta: 3 sessioni da ~2,5 h.
4. I file di setup (`setup-python.js`, `setup-ffmpeg.js`) sono in scope P5 o P7? Proposta: P5 per packaging, P7 per qualità script.
5. Va inclusa la valutazione delle performance misurate (trace/CDP) o solo statica? Proposta: statica in review, misure solo se emerge un rischio concreto.

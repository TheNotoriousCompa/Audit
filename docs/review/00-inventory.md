# S0 - Inventario e mappa del progetto

Snapshot: branch `dev`, commit `2bda478c53ee0a2cd08ee42d11e9ee76d4b6882f`, 2026-10-28.
Stato: review statica completata. Nessuna modifica a codice, UI o asset.
Copertura: file visti = 85, non visti = 8, troncati = 0.

## 1. Perimetro

Il repository contiene 93 file tracciati. I binari (`Public/AUDIT.png`, `src/app/favicon.ico`, `src/app/icon.png`) e `package-lock.json` sono esclusi dalla lettura ma restano nel perimetro di packaging.

| Area | File | Righe | Note |
|---|---:|---:|---|
| main Electron | 12 | 1.703 | processo principale, preload, DB, sidecar bridge |
| renderer | 29 | 4.743 | Next static export, React 19, canvas, player |
| sidecar Python | 17 | 2.797 | downloader, scanner, generi, tag |
| tipi condivisi | 1 | 229 | contratto IPC |
| CI | 1 | 30 | workflow GitHub Actions |
| config e root | 19 | 1.469 | forge, next, package, tsconfig, setup |
| script | 4 | 374 | audit generi, AutoEq, fix import, CSS |
| docs | 6 | 1.281 | piano, assessment, audit, player |
| **totale testuale** | **89** | **12.626** | esclusi binari e lockfile |

Il branch `dev` e' avanti di 28 file e 2.189 inserzioni rispetto a `main`. Le differenze principali sono SQLite, mini player, sort recente, rimozione rating, packaging snello, generi e fix CSS di produzione.

## 2. Classificazione per ruolo

| Ruolo | File principali | Temperatura |
|---|---|---|
| Bootstrap main | `src/main/main.ts`, `window.ts` | hot |
| Sicurezza e IPC | `src/main/preload.ts`, `ipc-handlers.ts` | hot |
| Sidecar bridge | `src/main/python-bridge.ts` | hot |
| Dati | `src/main/db.ts`, `library.ts` | hot |
| Mini player | `src/main/mini-player.ts`, `tray.ts` | caldo |
| Media locale | `src/main/media-protocol.ts` | caldo |
| Shell renderer | `src/app/page.tsx`, `layout.tsx`, `globals.css` | hot |
| Player | `src/components/player/*` | hot |
| Download UI | `DownloadButton.tsx`, `DownloadProgress.tsx`, `StatusMessage.tsx` | caldo |
| Sidecar download | `python/downloader/*` | hot |
| Scanner e generi | `python/library/*` | hot |
| Protocollo Python | `python/interface/*`, `python/main.py` | hot |
| Packaging | `forge.config.js`, `next.config.js`, `package.json`, `setup-*.js` | hot |
| CI | `.github/workflows/publish.yml` | hot |
| Script e tooling | `scripts/*`, tsconfig, eslint, postcss | caldo |
| Asset e docs | `Public/*`, `src/app/icon.png`, `docs/*` | cold |

## 3. Copertura effettiva

| Sessione | File letti | Non letti | Troncati |
|---|---:|---:|---:|
| S1 architettura | 29 | 0 | 0 |
| S2 main + preload | 13 | 0 | 0 |
| S3 DB | 5 | 0 | 0 |
| S4 sidecar Python | 17 | 0 | 0 |
| S5 CI e packaging | 16 | 1 (`package-lock.json`) | 0 |
| S6 renderer | 29 | 0 | 0 |
| S7 script e config | 20 | 3 (`components.json`, `DESIGN.md`, `tsconfig.ts-node.json`) | 0 |
| Documenti | 5 | 1 (`docs/genre-audit-2026-10-26.json`) | 0 |

I file non letti sono generati, binari o fuori dal perimetro decisionale. Il JSON dell'audit generi e' un output ripetibile dello script, non una fonte primaria.

## 4. Split dei deep dive

Lo split del piano e' confermato. Nessun layer supera le 3.000 righe tranne il sidecar (2.797 righe, 17 file) e il renderer (4.743 righe, 29 file), gia' separati per responsabilita'.

| Sessione | Layer | Output |
|---|---|---|
| S0 | inventario | questo file |
| S1 | architettura | `01-architecture.md` |
| S2 | main e preload | `02-main-preload.md` |
| S3 | SQLite | `03-db.md` |
| S4 | sidecar Python | `04-sidecar.md` |
| S5 | CI, packaging, release | `05-ci-packaging.md` |
| S6 | renderer | `06-renderer.md` |
| S7 | test, script, config, docs | `07-tests-tooling.md` |
| S8 | consolidamento | `08-final.md` |

## 5. Evidenze raccolte

Comandi read-only eseguiti durante la review:

| Controllo | Esito |
|---|---|
| `git status --short` | pulito prima della review |
| `npx tsc --noEmit -p tsconfig.main.json` | nessun errore |
| `npx tsc --noEmit -p tsconfig.preload.json` | nessun errore |
| `npx tsc --noEmit --incremental false -p tsconfig.json` | nessun errore |
| `npx tsc --noEmit -p tsconfig.ts-node.json` | nessun errore |
| `npx eslint src` | 1 warning, 0 errori |
| `npm audit --omit=dev` | 0 vulnerabilita' note |
| parsing AST di 17 file Python | 17 ok, 1 `SyntaxWarning` in `search.py:15` |

Warning ESLint: dipendenza superflua `tracks` in `LibraryHome.tsx:122`. Non blocca il build, ma indica una memoizzazione da rivedere.

## 6. Limiti dichiarati

- Nessun profiling runtime, trace CDP o misura di memoria. Le osservazioni di performance sono statiche.
- Nessun test su hardware macOS o su build notarizzata.
- Il DB reale (`%APPDATA%/Audit/audit.db`) non e' stato aperto in scrittura. Le osservazioni SQLite derivano da schema, query e flussi nel codice.
- La UI e' stata trattata come congelata. I finding di copy e accessibilita' sono proposte, non modifiche applicate.
- Le valutazioni su yt-dlp e ffmpeg dipendono dalle versioni dichiarate e dal comportamento documentato, non da un download reale.

## 7. Domande aperte

Nessuna domanda bloccante. Assunzioni applicate:

1. La review riguarda lo snapshot `dev`; `main` serve solo come delta.
2. macOS e' una roadmap: si valutano i blocchi, non si corregge codice macOS inesistente.
3. Le performance sono statiche; eventuali misure runtime sono un follow-up.
4. `setup-*.js` sono trattati in S5 per il packaging e in S7 per la qualita' dello script.
5. La UI non va modificata in questa fase, nemmeno per em dash o copy.

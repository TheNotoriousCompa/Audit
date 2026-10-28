# S5 - CI, packaging e release

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 15, non visti = 2 (`package-lock.json`, generato; `tsconfig.ts-node.json`), troncati = 0.
File: `forge.config.js`, `next.config.js`, `package.json`, `.github/workflows/publish.yml`, `setup-python.js`, `setup-ffmpeg.js`, `scripts/postbuild-css.js`, `requirements.txt`, tsconfig, eslint, postcss, `.gitignore`.

## 1. Pipeline attuale

`Publish Release` parte su qualsiasi tag `v*`:

1. checkout
2. Node 22
3. `npm ci`
4. `npm run publish` con `GITHUB_TOKEN`

`npm run publish` esegue `npm run build` e poi `electron-forge publish`. Il publish usa `@electron-forge/publisher-github` con release draft. La build Windows produce un pacchetto zip. Non esiste una matrice macOS/Linux, non ci sono lint, typecheck, test o smoke test del pacchetto.

## 2. Finding

### AUD-401 - La CI non esegue alcun controllo prima di pubblicare

- Severita': ARANCIONE
- Layer: CI
- Categoria: qualita', release
- File: `.github/workflows/publish.yml:11-30`
- Problema: qualsiasi tag `v*` crea una release draft con un artefatto costruito senza typecheck, lint, test o smoke test. Un errore di tipo nel main, un import Python mancante o una regressione del renderer arrivano direttamente alla release draft.
- Evidenza: il workflow ha solo checkout, setup Node, `npm ci`, `npm run publish`. Non c'e' `tsc`, `eslint`, `npm audit`, `python -m compileall`, ne' un avvio del pacchetto.
- Soluzione: job separato `checks` con `tsc` per i tre tsconfig, `eslint`, test, parsing Python, `npm audit --omit=dev`, build e smoke test. `publish` deve dipendere da `checks`. Aggiungere protezione sui tag e verifica che il tag corrisponda a `package.json.version`.
- Alternative: usare un workflow `ci.yml` su push/PR e un `release.yml` solo su tag protetti.
- Sforzo: S/M. Impatto: alto, riduce le release rotte.

### AUD-402 - Supply chain non riproducibile e senza verifica

- Severita': ARANCIONE
- Layer: CI / packaging
- Categoria: sicurezza, riproducibilita'
- File: `requirements.txt:1-4`, `setup-python.js:17-45`, `61-119`, `184-219`, `setup-ffmpeg.js:24-36`, `76-107`
- Problema: le dipendenze Python usano `>=` senza lock o hash. Python e ffmpeg vengono scaricati a build time da URL esterni senza checksum o firma. ffmpeg usa `master-latest`, quindi ogni build puo' usare un binario diverso. `pip install` avviene con la rete durante il build. `setup-python.js` usa `execSync` con interpolazione di path e `AdmZip.extractAllTo` senza difesa da zip slip.
- Evidenza: `yt-dlp>=...`, `Pillow>=...`; URL `ffmpeg-master-latest-win64-gpl.zip`; `curl -L -f` senza hash; `execSync` con stringhe.
- Soluzione: `requirements.txt` pinnato con hash (`pip-compile --generate-hashes`), download con SHA-256 verificato e cache, ffmpeg pinnato a una release e a un'architettura, `execFileSync` con array, estrazione con controllo dei path. Conservare gli artefatti per release e generare un SBOM.
- Alternative: vendorizzare i runtime nel repository o in un artifact store interno.
- Sforzo: M. Impatto: alto per integrita' della release.

### AUD-403 - Packaging macOS incompleto

- Severita': GIALLO
- Layer: packaging
- Categoria: portabilita', release
- File: `forge.config.js:62-108`, `111-116`; `setup-ffmpeg.js:26-29`; `python-bridge.ts:128-135`; `library.ts:88-103`; `window.ts:62-80`
- Problema: il percorso del runtime e' `python-runtime/python.exe` su tutte le piattaforme. `afterCopy` costruisce `.../Contents/resources` con la `r` minuscola, che puo' fallire su volumi case-sensitive. ffmpeg macOS e' il build x86_64 di evermeet, non arm64. Non ci sono maker DMG, firma, notarization, hardened runtime, entitlements, menu o traffic lights nativi. La CI non compila su macOS.
- Evidenza: `pythonExecutable = path.join(process.resourcesPath, 'python-runtime', 'python.exe')`; `path.join(buildPath, '..', '..', 'resources', 'python-runtime')`; `https://evermeet.cx/ffmpeg/get/zip`; makers solo zip.
- Soluzione: funzione `resolvePythonRuntime()` per piattaforma (`python.exe` su Windows, `bin/python3` su macOS/Linux); path `Resources` corretto; ffmpeg per architettura; maker DMG; firma Developer ID, hardened runtime, entitlements, notarytool; CI `macos-14` con artifact non firmati in prima fase.
- Alternative: dichiarare Windows-only finche' la fase A del piano macOS non e' completa.
- Sforzo: M/L. Impatto: blocca macOS.

### AUD-404 - L'auto-update non e' effettivo con la distribuzione zip

- Severita': GIALLO
- Layer: packaging / main
- Categoria: release, sicurezza
- File: `src/main/auto-updater.ts:8-23`, `forge.config.js:111-116`, `132-143`
- Problema: `update-electron-app` richiede Squirrel e un `Update.exe`; la release attuale e' uno zip portabile. `initAutoUpdater` cerca `Update.exe` e, se non c'e', logga "Skipped". Gli utenti non ricevono aggiornamenti automatici, inclusi fix di sicurezza.
- Evidenza: `const updateExe = path.join(path.dirname(process.execPath), '..', 'Update.exe'); if (!fs.existsSync(updateExe)) return;`; maker solo zip.
- Soluzione: scegliere un solo modello: installer Squirrel con nupkg e feed GitHub, oppure `electron-updater` con zip/dmg e `latest.yml`. Firmare gli artefatti. Aggiungere un test che verifichi il feed e il download.
- Alternative: mantenere zip e mostrare un avviso "nuova versione disponibile" con link manuale.
- Sforzo: M. Impatto: medio-alto per la sicurezza degli utenti.

### AUD-405 - Build e development non riproducibili da un checkout pulito

- Severita': GIALLO
- Layer: build / DX
- Categoria: riproducibilita'
- File: `package.json:14-38`, `src/main/main.ts:1-6`, `next.config.js:1-46`
- Problema: `npm run dev` avvia `next dev` e `electron .`, ma non compila `dist/main` e `dist/preload`. In un checkout pulito `dist` non esiste e `electron .` fallisce. `postinstall` esegue solo `electron-rebuild`; `prebuild` rifa rebuild e setup. Lo script `export:renderer` usa `next export`, rimosso dalle versioni recenti di Next. `restart` usa `pkill`, non disponibile su Windows.
- Evidenza: `"main": "./dist/main/main.js"`; `dev` non ha `predev`; `export:renderer`: `next build && next export -o dist/exported`.
- Soluzione: `predev` che esegue `build:main` e `build:preload`, oppure usare `electron-forge start` con il plugin webpack; rimuovere `export:renderer` o sostituirlo con `next build`; rendere `restart` cross-platform con `taskkill`/`pkill` condizionale.
- Alternative: documentare un `npm run build` prima di `dev` e aggiungere un controllo con messaggio chiaro.
- Sforzo: S. Impatto: medio per chi clona.

### AUD-406 - Il pacchetto include file non necessari e non ha pruning per piattaforma

- Severita': GIALLO
- Layer: packaging
- Categoria: dimensione, manutenzione
- File: `forge.config.js:11-13`, `36-59`, `79-108`; `package.json:25-38`
- Problema: l'ignore non copre `docs/`, `REPORT.md`, `DESIGN.md`, `context.md` (il pattern e' `CONTEXT.md`, case diverso) e `package-lock.json`. I locales vengono potati solo su Windows, quindi il pacchetto macOS mantiene tutte le lingue. Il pattern `asar.unpack` e' un glob ambiguo; il pruning di `better-sqlite3` non e' esplicito. La build verificata in sessione precedente era 419 MB, ma il contenuto puo' ancora essere ridotto.
- Evidenza: la lista `ignored` non contiene `/docs`; `if (platform !== 'win32') { callback(); return; }` per i locales.
- Soluzione: aggiungere `docs`, report, design, context, lockfile all'ignore; pruning locale per piattaforma; esplicitare i file nativi da tenere; aggiungere un test che fallisca se il pacchetto supera una soglia o contiene file vietati.
- Alternative: usare `files` in `packagerConfig` con allowlist invece di ignore.
- Sforzo: S. Impatto: basso-medio.

### AUD-407 - Electron 28 e' datato e il pin di better-sqlite3 blocca l'upgrade

- Severita': GIALLO
- Layer: packaging / sicurezza
- Categoria: sicurezza, manutenzione
- File: `package.json:41`, `77`
- Problema: Electron 28 usa Chromium 120 e Node 18, entrambi fuori dal ciclo di supporto. Il progetto ha gia' incontrato un crash con `better-sqlite3` 13 e usa 11.10 con rebuild. Senza un piano di upgrade, l'app non riceve patch di sicurezza del runtime.
- Evidenza: `"electron": "^28.3.3"`, `"better-sqlite3": "^11.10.0"`; commento nel codice DB che cita il rebuild per Electron.
- Soluzione: matrice di test con Electron 30/31+ e una versione compatibile di better-sqlite3 (testare 12 e 13 con ABI corrente); aggiornare `browserslist`; verificare fuses, sandbox, `protocol.handle` e packaging. Pianificare l'upgrade su `dev`, non su `main`.
- Alternative: restare su 28 solo se il rischio e' accettato e documentato, con mitigazioni (nessuna navigazione remota, CSP).
- Sforzo: M. Impatto: medio-alto nel tempo.

### AUD-408 - Il fix CSS di produzione e' efficace ma fragile

- Severita': VERDE
- Layer: packaging
- Categoria: manutenzione
- File: `scripts/postbuild-css.js:1-39`, `package.json:25`
- Problema: il fix dipende da una regex che rimuove `backdrop-filter` standard e lo reinserisce accanto a `-webkit-backdrop-filter`. Funziona oggi, ma un cambio di minificatore o di formato puo' rompere il vetro senza che la build fallisca. Il postbuild e' un passo manuale dentro `build`.
- Evidenza: `css.replace(/(?<!-webkit-)backdrop-filter:[^;}]+;?/g, '')`; nessun test che verifichi la presenza della proprieta' nel CSS finale.
- Soluzione: aggiungere un'asserzione postbuild che cerchi `backdrop-filter` in almeno un file CSS e fallisca altrimenti; documentare il perche' nel README; valutare `lightningcss` o una configurazione browserslist che non collassi la proprieta'.
- Alternative: usare un plugin PostCSS dedicato.
- Sforzo: S. Impatto: basso, ma evita una regressione visiva difficile da notare.

## 3. Punti di forza

- Fuses: `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `OnlyLoadAppFromAsar`, ASAR integrity.
- `electron-serve` per il renderer statico, `app://` in produzione.
- `extraResource` separa Python e ffmpeg dall'ASAR.
- Pruning di ffmpeg, locales Windows e stdlib Python documentato e verificato.
- `browserslist` Chrome >=120 coerente con Electron 28.
- `postbuild-css.js` risolve un bug reale di produzione.
- Release draft: evita pubblicazioni automatiche irreversibili.
- Lockfile Node committato.

## 4. Priorita'

1. `AUD-401` e `AUD-402`: gate e integrita' della release.
2. `AUD-403` e `AUD-404`: macOS e update, se sono obiettivi di prodotto.
3. `AUD-405`: esperienza da checkout pulito.
4. `AUD-406`, `AUD-407`: dimensione e sicurezza del runtime.
5. `AUD-408`: test di regressione CSS.

## Riferimenti

- Electron Forge: <https://www.electronforge.io/>
- Electron fuses: <https://www.electronjs.org/docs/latest/tutorial/fuses>
- Electron packaging: <https://www.electronjs.org/docs/latest/tutorial/application-distribution>
- GitHub Actions hardening: <https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions>
- npm audit: <https://docs.npmjs.com/cli/v10/commands/npm-audit>
- pip hashes: <https://pip.pypa.io/en/stable/topics/secure-installs/>
- Next static export: <https://nextjs.org/docs/app/building-your-application/deploying/static-exports>

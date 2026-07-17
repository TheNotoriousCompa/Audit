# Audit — Debug Report 17/07/2026

## Diagnosi

| Problema | Stato |
|----------|-------|
| V8 crash (`v8_context_snapshot.bin` missing) | **Diagnosticato** |
| File nel `.nupkg` | **Presenti** (4257 entries, 292 MB) |
| Estrazione Squirrel | **Fallisce** dopo ~76 file su 4257 |
| Portable build (`out/Audit-win32-x64/`) | **Funziona** |
| Installata + file copiati manualmente | **Funziona** (confermato) |

**Root cause**: Squirrel.Windows non regge un nupkg da 4257 file (292 MB). Crash durante l'estrazione della python-runtime (entry 77), i file V8 sono in coda (entry 4243+) e non vengono mai scritti. **Non è un problema di dipendenze o versioni.**

---

## Modifiche già fatte

| File | Cosa |
|------|------|
| `.env.local` | **Rimosso token GitHub** `ghp_sHESS...` (esposto in chiaro) |
| `forge.config.js` | Ignore pattern riscritti con regex ancorati (più sicuri) |
| `.gitignore` | Rimosso `*.dll` e `*.exe` globali; path specifici |
| Root | Eliminati 5 log file + `scratch/` + `tmp/` |
| `src/main/` | Refactoring: 558 linee → 6 moduli separati |
| ├ `main.ts` | 28 linee (lifecycle bootstrap) |
| ├ `logger.ts` | Logging + crash handler |
| ├ `window.ts` | BrowserWindow creation |
| ├ `python-bridge.ts` | Python spawn/progress/result |
| ├ `ipc-handlers.ts` | IPC handlers |
| └ `auto-updater.ts` | Squirrel auto-updater |

---

## Due strade per risolvere l'installer

**A) ZIP portable (subito funzionante)**
- Rimuovere maker-squirrel da `forge.config.js`
- Tenere solo `@electron-forge/maker-zip`
- L'utente unzippa e lancia `Audit.exe`
- Pro: zero problemi. Contro: niente installer, niente auto-update

**B) Ridurre il nupkg per Squirrel**
- Potare dalla `python-runtime`: `__pycache__/`, `pip/`, shell completions, `*.dist-info/`
- Script di pruning da aggiungere a `setup-python.js` o come hook pre-make
- Pro: installer funzionante. Contro: da testare

---

## Comandi utili

```powershell
# Build & make
npm run make

# Solo package (portable test)
npm run package
# poi lancia: .\out\Audit-win32-x64\Audit.exe

# Pulizia totale
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Audit" -ErrorAction SilentlyContinue
npm run clean:all
npm run make
```

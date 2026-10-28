# S4 - Sidecar Python

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 17, non visti = 0, troncati = 0.
File: `python/main.py`, `python/downloader/*`, `python/library/*`, `python/interface/*`, `python/setup.py`.

## 1. Mappa

| Modulo | Responsabilita' |
|---|---|
| `main.py` | entrypoint CLI, validazione, chiamata a `download_media` |
| `downloader/core.py` | yt-dlp, playlist, conversione, rename, progress |
| `downloader/progress.py` | calcolo file/playlist percent |
| `downloader/postprocess.py` | tag ID3, artwork |
| `downloader/search.py` | ricerca ffmpeg |
| `downloader/utils.py` | nomi file, directory, update yt-dlp |
| `interface/args_parser.py` | argparse, mappa opzioni |
| `interface/log.py` | logging stderr, formato progress |
| `library/scan.py` | scan, tag, art, scrittura tag |
| `library/genres.py` | inferenza genere |
| `library/tags_norm.py` | pulizia artista/titolo |

Il protocollo stdout e' a righe JSON; i log vanno su stderr. Il codice e' leggibile e separato, ma contiene moduli legacy non piu' usati e alcune assunzioni Windows.

## 2. Finding

### AUD-301 - Le collisioni di nome cancellano file esistenti

- Severita': ARANCIONE
- Layer: sidecar
- Categoria: perdita dati
- File: `python/downloader/core.py:435-447`, `518-533`
- Problema: dopo il download il file viene rinominato con `sanitize_filename(title)`. Se il target esiste, il codice fa `new_path.unlink()` e poi `rename`. Due video con lo stesso titolo, o un titolo che collide con un file gia' presente, portano alla cancellazione silenziosa del file esistente. Anche il ramo singolo fa `output_path.unlink()`.
- Evidenza: `if new_path != downloaded_file and new_path.exists(): new_path.unlink()`; stesso pattern su `output_path`.
- Soluzione: non cancellare mai un file esistente senza conferma. Se il target esiste, usare un suffisso numerico (`Titolo (2).mp3`) o un timestamp; se e' lo stesso download, sostituire solo il `.part`. Restituire al main il path effettivo.
- Alternative: usare una directory temporanea per download e spostare solo a fine conversione con una policy di collisione esplicita.
- Sforzo: S. Impatto: alto, perdita dati irreversibile.

### AUD-302 - Playlist: path preferito pre-conversione e cleanup thumbnail troppo largo

- Severita': ARANCIONE
- Layer: sidecar
- Categoria: integrita' dati, journal
- File: `python/downloader/core.py:423-447`, `475-499`
- Problema: per ogni entry viene usato `_filename` prima di `requested_downloads[0].filepath`. Dopo la conversione audio `_filename` puo' puntare al file originale (per esempio `.webm`) mentre il file finale e' `.mp3`; il codice puo' saltare metadata e journal, oppure registrare un path sbagliato. Il cleanup delle thumbnail cancella ogni `*.jpg/png/webp` il cui stem coincide con il nome playlist, anche se non e' una thumbnail generata da Audit.
- Evidenza: `if '_filename' in entry: downloaded_file = Path(entry['_filename'])`; `thumb_file.stem == playlist_name_sanitized` e `unlink()`.
- Soluzione: preferire `requested_downloads[0]['filepath']` e verificare che esista; usare una mappa dei file generati da yt-dlp; cancellare solo i thumbnail con suffisso generato o in una temp dir. Registrare il path finale dopo il rename.
- Alternative: disabilitare `writethumbnail` e scaricare l'artwork separatamente in temp.
- Sforzo: M. Impatto: alto per playlist e recenti.

### AUD-303 - L'update yt-dlp dipende da pip, rimosso dal runtime impacchettato

- Severita': ARANCIONE
- Layer: sidecar / packaging
- Categoria: correttezza, supply chain
- File: `python/downloader/utils.py:92-129`, `python/downloader/core.py:200-203`, `setup-python.js:222-266`
- Problema: ogni download chiama `python -m pip install --upgrade yt-dlp`. `setup-python.js` elimina pip e `ensurepip` dal runtime per ridurre il pacchetto. Nell'app installata l'update fallisce, ma viene eseguito comunque a ogni download; il percorso di retry su 403 tenta un secondo update inutile. Se pip esiste ancora su una piattaforma, il download dipende dalla rete e puo' attendere fino a 45 secondi.
- Evidenza: `pruneRuntime()` rimuove `pip`, `pip-*`, `wheel`, `ensurepip`; `update_ytdlp()` usa `sys.executable -m pip`; `download_media` chiama `update_ytdlp()` prima di ogni download.
- Soluzione: saltare l'update quando il runtime e' impacchettato (`sys.frozen`, presenza di `python-runtime`, assenza di pip) e mostrare un messaggio "aggiorna l'app" invece di un errore silenzioso. In alternativa, spedire un updater dedicato o aggiornare yt-dlp solo su richiesta esplicita.
- Alternative: mantenere pip nel runtime e accettare +20 MB; oppure usare yt-dlp come binario aggiornabile separato.
- Sforzo: S. Impatto: alto, toglie un percorso rotto dal flusso principale.

### AUD-304 - `timeout`, `max_retries` e `skipExisting` sono dichiarati ma non applicati

- Severita': GIALLO
- Layer: sidecar / main
- Categoria: correttezza, affidabilita'
- File: `python/downloader/core.py:182-193`, `python/main.py:60-90`, `python/interface/args_parser.py:90-136`, `src/main/python-bridge.ts:157-167`, `src/app/page.tsx:68-69`
- Problema: `download_media` accetta `timeout` e `max_retries` ma non li usa; yt-dlp non riceve `socket_timeout` ne' `retries`. `skipExisting` esiste nel tipo e nella UI come costante `true`, ma non viene passato al sidecar ne' usato. Il valore `timeout = 300` del renderer e' quindi solo decorativo.
- Evidenza: grep di `timeout` in `core.py` trova solo la firma; `skipExisting` non compare in Python; il bridge passa `--timeout` ma il parser lo mette in un dict che `core.py` ignora.
- Soluzione: mappare `timeout` su `socket_timeout` e un deadline complessivo; mappare `max_retries` su `retries`/`fragment_retries`; implementare `skipExisting` con `download_archive` o controllo del file finale. Aggiornare il tipo/UI o rimuovere le opzioni.
- Alternative: eliminare le opzioni finche' non servono, per non promettere un comportamento inesistente.
- Sforzo: S. Impatto: medio.

### AUD-305 - Scrittura tag non atomica, campi vuoti non cancellabili, errori inghiottiti

- Severita': GIALLO
- Layer: sidecar
- Categoria: integrita' dati, osservabilita'
- File: `python/library/scan.py:219-307`, `python/downloader/core.py:108-180`
- Problema: `write_tags` scrive direttamente il file con mutagen; un crash durante il salvataggio puo' corrompere il file. I campi vuoti vengono ignorati (`if title`, `if artist`), quindi non e' possibile cancellare un tag. `_process_metadata` cattura ogni eccezione e non logga nulla. `write_tags` non ricalcola il genere inferito.
- Evidenza: `tags.save(str(p), v2_version=3)`; `if title:` prima di `delall`/`add`; `except Exception: pass` in `_process_metadata`.
- Soluzione: scrivere su un file temporaneo nella stessa directory e sostituire atomicamente; distinguere "non modificare" da "svuota" nel contratto; loggare l'errore con path e fase; ricalcolare `genre_guess` sulla traccia restituita.
- Alternative: per gli MP3 usare `ID3.save` su una copia e `os.replace`; per gli altri formati applicare lo stesso schema.
- Sforzo: M. Impatto: medio-alto.

### AUD-306 - Contratto progress: `speed` numerica e' sempre zero, indice playlist fragile

- Severita': GIALLO
- Layer: sidecar / main
- Categoria: contratto, UI
- File: `python/interface/log.py:98`, `118-142`; `python/downloader/progress.py:96-122`, `174-188`; `src/main/python-bridge.ts:36-44`
- Problema: Python emette `speed` come stringa (`"1.2MiB/s"`), il bridge fa `Number(...)` e ottiene `NaN`, poi azzera. Il valore numerico e' sempre 0; la UI usa la stringa, quindi il bug e' nascosto. L'indice playlist ha due proprietari: `playlist_state` in `core.py` e `ProgressCalculator`; il primo aggiunge 1 e il secondo sovrascrive il campo, quindi oggi il risultato e' corretto ma fragile.
- Evidenza: `'speed': speed_str` in `format_progress`; `Number.isFinite(rawSpeed) ? rawSpeed : 0` nel bridge; `playlist_state['current_index'] + 1` in `core.py:242`.
- Soluzione: emettere `speed_bytes_per_sec` numerico e `speed_text` separato; un solo proprietario dell'indice playlist; test di contratto con playlist da 1, 2 e N tracce.
- Alternative: normalizzare tutto nel bridge con un parser dedicato e rimuovere i campi raw dalla UI.
- Sforzo: S. Impatto: medio, evita regressioni future.

### AUD-307 - Playlist parziali riportate come successo; `output_path` ambiguo

- Severita': GIALLO
- Layer: sidecar / main / renderer
- Categoria: correttezza, UX
- File: `python/downloader/core.py:257-267`, `340-473`, `542-545`; `src/main/python-bridge.ts:222-239`
- Problema: `ignoreerrors=True` fa continuare yt-dlp sulle entry fallite; il loop salta `None` e restituisce successo se la cartella playlist esiste, anche se alcune tracce non sono state scaricate. `output_path` e' una cartella per le playlist e un file per i singoli; il main e il renderer trattano il valore come path generico. Il journal per playlist dipende dagli eventi `saved`, non dal result.
- Evidenza: `ignoreerrors: True`; `if not entry: continue`; `return True, str(output_path), ...` con `output_path = playlist_folder`.
- Soluzione: restituire un result con `items: [{path, success, error}]`, `failed_count`, `playlist_folder` distinto da `file_path`; mostrare nella UI "8/9 scaricati" e i fallimenti. Non usare `ignoreerrors` senza raccogliere gli errori.
- Alternative: continuare a usare `saved` per il journal ma aggiungere un result aggregato.
- Sforzo: M. Impatto: medio.

### AUD-308 - Precisione dei generi non misurata; seed a substring e tassonomia sbilanciata

- Severita': GIALLO
- Layer: sidecar
- Categoria: qualita' dati
- File: `python/library/genres.py:111-159`, `243-250`, `253-309`; `docs/genre-audit-2026-10-26.md:7-75`
- Problema: la copertura e' 77,2% (1076/1394), ma la precisione non e' misurata. I seed sono matchati come substring (`key in cleaned`), quindi "future" matcha anche "Future Islands", "drake" matcha "Drake Bell", "nas" matcha "Nasty". `daft punk` compare due volte con generi diversi (Electronic e House); il dict tiene l'ultimo. Il voto artista non scatta mai (0 tracce). Soundtrack e' 703/1076 (65%), quindi la vista Generi e' molto sbilanciata.
- Evidenza: `if key and key in cleaned`; chiave duplicata alle righe 125 e 128; `artist` vote 0 nell'audit; `Soundtrack` 703.
- Soluzione: matchare i seed su token/confine di parola e normalizzare l'artista completo; rimuovere o correggere il duplicato; misurare la precisione su un campione etichettato (il piano `GENRE_ASSESSMENT.md` lo prevede); separare `Rap` e `Hip Hop` o documentare la scelta; dare piu' peso ai tag espliciti.
- Alternative: usare solo tag + cartelle e rimuovere i seed finche' non sono valutati.
- Sforzo: M. Impatto: medio sulla qualita' percepita.

### AUD-309 - Moduli legacy rotti o non usati

- Severita': VERDE
- Layer: sidecar
- Categoria: manutenzione
- File: `python/interface/ipc.py:23-80`, `python/interface/args_parser.py:150-186`, `python/downloader/config.py:1-115`, `python/setup.py:1-33`, `python/downloader/search.py:15`
- Problema: `ipc.read_input` e il percorso stdin non sono usati dal bridge; il supporto batch e' morto; `config.get_ydl_opts` non importa `logging` e contiene chiavi duplicate, quindi fallirebbe se chiamato; `python/setup.py` e' boilerplate con entry point inesistente e versione 1.0.0; `search.py:15` ha una sequenza di escape non valida che genera `SyntaxWarning` e diventera' errore in una versione futura.
- Evidenza: `logging.getLogger` in `config.py` senza import; `entry_points` `ytmp3_next.main:main` inesistente; `C:\ ` nel docstring.
- Soluzione: rimuovere i moduli morti o ripararli; rendere il docstring raw (`r"""`); allineare `setup.py` alla struttura reale o eliminarlo.
- Alternative: tenere il codice legacy ma marcarlo e coprirlo con test.
- Sforzo: S. Impatto: basso, ma riduce confusione e warning.

### AUD-310 - Scan e art ripetono la parse mutagen e non hanno limiti

- Severita': GIALLO
- Layer: sidecar
- Categoria: performance
- File: `python/library/scan.py:37-93`, `142-185`, `96-133`
- Problema: ogni file viene aperto due volte nella scan (una easy, una raw per l'art); `get_art` apre il file una terza volta per ogni richiesta. La scansione segue symlink e directory nascoste, senza limiti di profondita', dimensione o tempo. L'art viene restituita come data URL base64 fino a 4 MB per traccia.
- Evidenza: `MutagenFile(str(path), easy=True)` e poi `MutagenFile(str(path))`; `scan_directory` usa `rglob("*")`; `MAX_ART_BYTES` 4 MB.
- Soluzione: una sola parse per file, caching opzionale delle thumbnail in una cache disco (256 px), limiti di profondita' e skip dei symlink/hidden, limite di concorrenza lato main. Restituire art solo su richiesta della riga visibile, non per tutte.
- Alternative: usare `mutagen.File` una volta e leggere sia i tag sia le picture.
- Sforzo: M. Impatto: medio-alto su librerie grandi.

## 3. Punti di forza

- stdout e stderr separati, JSON a righe, `flush=True`.
- Encoding UTF-8 esplicito in main e sidecar.
- yt-dlp con opzioni conservative: `quiet`, `no_warnings`, `merge_output_format`, `FFmpegExtractAudio`.
- Fallback senza mutagen: lo scan degrada invece di fallire.
- Gestione errori per file nello scan: un file rotto non blocca la libreria.
- Arte: embedded -> folder, con limite 4 MB e MIME corretto.
- Generi deterministici e strumentati con `genre_rule`, `genre_source`, `genre_confidence`.
- Script di audit generi separato, read-only, con report markdown e JSON.
- Tag editor supporta MP3, M4A/MP4, FLAC/OGG/Opus, WMA.

## 4. Priorita'

1. `AUD-301`, `AUD-302`: evitare perdita dati e path sbagliati.
2. `AUD-303`: togliere l'update pip rotto dal percorso download.
3. `AUD-305`: atomicita' tag e persistenza DB.
4. `AUD-307`: result playlist aggregato.
5. `AUD-304`, `AUD-306`: contratto opzioni e progress.
6. `AUD-308`: misurare la precisione prima di estendere i seed.
7. `AUD-310`: performance scan/art.
8. `AUD-309`: pulizia legacy.

## Riferimenti

- yt-dlp options: <https://github.com/yt-dlp/yt-dlp#usage-and-options>
- yt-dlp `download_archive`: <https://github.com/yt-dlp/yt-dlp#download-archive>
- mutagen: <https://mutagen.readthedocs.io/>
- Python subprocess: <https://docs.python.org/3/library/subprocess.html>
- Python `os.replace`: <https://docs.python.org/3/library/os.html#os.replace>
- ID3v1 genres: <https://en.wikipedia.org/wiki/ID3#ID3v1>

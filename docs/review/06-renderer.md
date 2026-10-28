# S6 - Renderer

Snapshot: `dev` @ `2bda478`. Review statica.
Copertura: file visti = 29, non visti = 0, troncati = 0.
File: `src/app/*` (testo), `src/components/**`, `src/types/electron.d.ts`, `globals.css`. I due file binari (`favicon.ico`, `icon.png`) sono esclusi.

## 1. Struttura

- `page.tsx`: shell, titolo, tab downloader/library, popover globali, stato download, harvest.
- `PlayerSection`: unico proprietario dello stato player, coda, root, playlist, vista, mini bridge.
- `LibraryHome`: query SQLite per All/Recent, gruppi in memoria per artisti/album/generi.
- `FoldersView`: raggruppamento per directory, azioni per cartella.
- `PlaylistsPanel`, `QueueView`, `TagEditor`: gestione locale.
- `PlayerBar`, `NowPlaying`, `Visualizer`, `MiniView`: riproduzione e stato.
- `Waves`: sfondo canvas full screen.
- `useArt`, `EQEngine`, `playlists`: servizi renderer.

La UI e' congelata: i finding di copy e accessibilita' non propongono modifiche visive immediate, ma annotano il debito.

## 2. Finding

### AUD-501 - `useArt` spawna Python per ogni traccia e non ha limiti di cache

- Severita': GIALLO
- Layer: renderer / main
- Categoria: performance, memoria
- File: `src/components/player/useArt.ts:6-52`, `src/main/library.ts:223-271`, `python/library/scan.py:142-216`
- Problema: ogni chiamata a `getTrackArt` avvia un processo Python che riapre il file con mutagen. Non c'e' deduplica delle richieste in volo: piu' componenti sulla stessa traccia possono spawnare piu' processi. La cache e' una `Map` senza limite e conserva data URL base64 fino a 4 MB per traccia; con 1.400 tracce il potenziale e' di centinaia di MB.
- Evidenza: `cache` globale senza LRU; `api?.getTrackArt?.(filePath)` dentro `useEffect` senza un set di richieste pendenti; `MAX_ART_BYTES = 4 * 1024 * 1024`.
- Soluzione: cache lato main con thumbnail 256 px e LRU; endpoint batch per le righe visibili; mappa `inFlight` nel renderer; invalidazione su tag edit; limite di memoria. In alternativa usare `media://` per l'art e un file thumbnail su disco.
- Alternative: caricare l'art solo nella vista Now Playing e non in ogni riga.
- Sforzo: M. Impatto: medio-alto su RAM e reattivita'.

### AUD-502 - La coda di "All Songs" e' limitata alla pagina caricata; totali e stati possono essere incoerenti

- Severita': GIALLO
- Layer: renderer
- Categoria: correttezza, UX
- File: `src/components/player/LibraryHome.tsx:115-168`, `233-272`; `src/components/player/PlayerSection.tsx:282-286`
- Problema: `onPlay(t, list)` passa solo gli elementi caricati. In "All Songs" la pagina e' di 200 elementi; premendo play su una traccia si accoda solo quella pagina, non l'intera libreria. `total` resta l'ultimo valore della query DB quando si passa a un gruppo (artisti/album/generi), quindi l'header puo' mostrare un conteggio sbagliato. Le richieste di ricerca non sono annullate: una risposta vecchia puo' sovrascrivere una nuova. `fetchPage` non ha `catch`: un errore FTS lascia la lista vuota senza messaggio.
- Evidenza: `setItems(...)` con `limit: PAGE_SIZE`; `onPlay={() => onPlay(t, list)}`; `setTotal` solo in `fetchPage`; nessun `AbortController` o request id; `try/finally` senza `catch`.
- Soluzione: separare il contesto di riproduzione dai risultati paginati: il player deve ricevere una query o un resolver che carichi tutte le tracce in modo lazy. Calcolare i conteggi dei gruppi da query aggregate o da un array completo esplicitamente. Aggiungere request id/abort, stato di errore e virtualizzazione dei gruppi.
- Alternative: alzare il limite a tutta la libreria per il contesto di play, accettando il costo.
- Sforzo: M. Impatto: medio-alto sull'uso reale.

### AUD-503 - Il tag editor parte dal genere raw, non dal genere inferito

- Severita': GIALLO
- Layer: renderer / DB / sidecar
- Categoria: coerenza dati
- File: `src/components/player/TagEditor.tsx:15-20`, `36-37`; `src/components/player/PlayerSection.tsx:345-349`; `python/library/scan.py:299-307`
- Problema: il campo Genre viene inizializzato con `track.genre`, non con `genre_guess`. Una traccia con genere solo inferito mostra un campo vuoto; salvando, il sidecar ignora il campo vuoto e restituisce la traccia senza `genre_guess`. La chip sparisce e il DB non viene aggiornato (vedi `AUD-202`).
- Evidenza: `genre: track.genre || ''`; `onSaved(res.track)` sostituisce la traccia; `write_tags` non chiama `infer_tracks`.
- Soluzione: mostrare il genere effettivo (`genre || genre_guess`) con un'indicazione "inferito"; gestire esplicitamente il campo vuoto; arricchire la traccia restituita e fare upsert.
- Alternative: mantenere separati "genre tag" e "genre stimato" con due campi nel form.
- Sforzo: S. Impatto: medio.

### AUD-504 - Rimuovere la traccia corrente o svuotare la coda lascia l'audio in riproduzione

- Severita': GIALLO
- Layer: renderer
- Categoria: comportamento player
- File: `src/components/player/PlayerSection.tsx:321-327`, `466`; `src/components/player/PlayerBar.tsx:55-76`, `99-111`
- Problema: `removeFromQueue` imposta `queueIndex = -1` se si rimuove la traccia corrente; `onClear` svuota la coda. `PlayerBar` calcola `current = queue[queueIndex]` e, se non c'e', non cambia `src` ne' mette in pausa l'elemento audio. La traccia precedente continua a suonare senza controlli visibili.
- Evidenza: l'effetto su `current?.path` fa `return` quando non c'e' current; non c'e' un `el.pause()` in `removeFromQueue` o `onClear`.
- Soluzione: quando si rimuove la traccia corrente, scegliere la successiva (o fermare e azzerare `src`); su clear, mettere in pausa, `removeAttribute('src')`, `load()` e resettare posizione/durata. Gestire anche la rimozione di una traccia prima della corrente con l'indice aggiornato.
- Alternative: lasciare la riproduzione ma mostrare la traccia "in riproduzione ma non in coda" nella UI.
- Sforzo: S. Impatto: medio.

### AUD-505 - Il visualizer continua a girare quando la tab o la finestra sono nascoste

- Severita': GIALLO
- Layer: renderer / main
- Categoria: performance
- File: `src/components/player/Visualizer.tsx:37-147`; `src/app/page.tsx:767`, `879`; `src/main/window.ts:79`
- Problema: `Visualizer` ridisegna ogni frame, anche con canvas a larghezza zero (ramo `cssW <= 0` che richiama `requestAnimationFrame`). La sezione Library resta montata ma `hidden` quando si usa il downloader; la finestra main ha `backgroundThrottling: false`. Il risultato e' un loop rAF inutile con la tab nascosta o la finestra minimizzata. `Waves` invece gestisce `visibilitychange`.
- Evidenza: `if (cssW <= 0) { raf = requestAnimationFrame(draw); return; }`; nessun handler `visibilitychange` o `IntersectionObserver` in `Visualizer`.
- Soluzione: mettere in pausa il loop quando il canvas non e' visibile o `document.hidden`; riprendere al primo frame visibile; ridurre a 30 fps quando non c'e' audio; usare CSS per l'idle.
- Alternative: smontare il visualizer quando la vista non e' attiva (gia' accade per il cambio vista, non per la tab).
- Sforzo: S. Impatto: medio.

### AUD-506 - Il mini player mostra per un frame la UI completa

- Severita': GIALLO
- Layer: renderer
- Categoria: UX, performance
- File: `src/app/page.tsx:155`, `168-182`, `559-561`; `src/main/mini-player.ts:88-102`
- Problema: `isMini` parte da `false` e viene impostato in un `useEffect` dopo il mount. Nella finestra mini il primo paint puo' mostrare la shell completa (sfondo, header, tab) prima di passare a `MiniView`. Il preload conosce gia' `isMiniWindow`, quindi il ritardo e' evitabile.
- Evidenza: `useState(false)`; `useEffect(() => { if (window.electronAPI?.isMiniWindow) setIsMini(true); ... }, [])`; il contenuto e' scelto al render.
- Soluzione: inizializzare lo stato da una funzione client-only che legge `window.electronAPI.isMiniWindow`, con un gate "unknown" che non renderizza la shell finche' il valore non e' noto. In alternativa, un entrypoint HTML separato per il mini.
- Alternative: nascondere la shell con CSS finche' `data-mini` non e' impostato dal preload.
- Sforzo: S. Impatto: basso-medio.

### AUD-507 - Lo stato del mini invia l'art base64 ogni secondo

- Severita': GIALLO
- Layer: renderer / main
- Categoria: performance IPC
- File: `src/components/player/PlayerSection.tsx:366-396`; `src/components/player/MiniView.tsx:47-50`; `src/main/preload.ts:78-83`
- Problema: ogni secondo `sendPlayerState` include `art` come data URL completo, anche se la traccia non e' cambiata. Con un'art da centinaia di KB sono centinaia di KB/s di IPC e copie di stringa, anche quando il mini e' nascosto (il main inoltra solo se aperto, ma il renderer prepara comunque l'oggetto). `MiniView` ascolta `onPlayerState` senza cleanup.
- Evidenza: `art: (current?.path && miniArtCache.current.get(current.path)) || null` dentro `setInterval(..., 1000)`; `api?.onPlayerState?.((s) => setState(s))` senza remove listener.
- Soluzione: inviare lo stato leggero ogni secondo (posizione, playing) e l'art solo quando cambia `artPath`; usare un canale separato o `media://` con cache nel mini. Inviare solo se il mini e' visibile. Rimuovere il listener al unmount.
- Alternative: il mini richiede l'art on demand quando riceve un nuovo path.
- Sforzo: S. Impatto: medio.

### AUD-508 - Copy: em dash, versioni e lingue incoerenti

- Severita': VERDE
- Layer: renderer
- Categoria: copy, coerenza
- File: `src/components/player/PlayerBar.tsx:173`, `175`; `NowPlaying.tsx:37`, `41`; `MiniView.tsx:89`; `EqualizerPanel.tsx:78`; `Info.tsx:17`, `57`; `FoldersView.tsx:128`; `PlaylistsPanel.tsx:90`, `95`; `QueueView.tsx:49`, `87`; `TagEditor.tsx:30`; `layout.tsx:7`; `src/main/tray.ts:27`, `57-58`
- Problema: la UI usa em dash in diverse stringhe, nonostante la richiesta di non usarli. `Info` mostra "Audit v1.3" mentre `package.json` e' 1.3.1. Il metadata del layout e' ancora "Generated by create next app". Il tray mescola italiano e inglese ("Mini player (mostra/nascondi)", "Audit è nel tray"). La UI e' congelata, quindi non si applica nulla in questa review.
- Evidenza: stringhe con carattere em dash in PlayerBar, NowPlaying, MiniView, EqualizerPanel, Info, FoldersView, PlaylistsPanel, QueueView, TagEditor; `Audit v1.3`; `Generated by create next app`.
- Soluzione: in una futura passata di copy, sostituire gli em dash con due punti, virgola o parentesi; leggere la versione da una costante condivisa; uniformare la lingua; aggiornare il metadata. Nessuna modifica ora.
- Alternative: lasciare lo stile attuale e accettare l'incoerenza.
- Sforzo: S. Impatto: basso, ma e' una richiesta esplicita dell'utente.

### AUD-509 - Accessibilita' minima incompleta

- Severita': VERDE
- Layer: renderer
- Categoria: accessibilita'
- File: `src/app/page.tsx:577-641`; `src/components/player/MiniView.tsx:112-124`; `src/app/globals.css:16-20`; `src/components/player/PlayerBar.tsx:178-187`; `src/components/player/QueueView.tsx:91-102`
- Problema: molti pulsanti icon-only hanno solo `title`, non `aria-label`; la barra di seek del mini e' un `div` cliccabile, non un controllo da tastiera; gli scrollbar sono nascosti globalmente; i controlli custom della finestra non hanno equivalenti da tastiera; le righe della coda non hanno un'etichetta per i pulsanti di riordino oltre al title.
- Evidenza: `title="Personalize"` senza `aria-label`; `onClick` su `div` in `MiniView`; `::-webkit-scrollbar { display: none }`; range senza `aria-label` in PlayerBar.
- Soluzione: aggiungere `aria-label` a tutti i pulsanti icon-only, usare `<input type="range">` o `role="slider"` per il seek, mantenere gli scrollbar visibili o offrire un'alternativa, aggiungere focus visibile e scorciatoie da tastiera.
- Alternative: audit con axe DevTools e test manuale da tastiera.
- Sforzo: S/M. Impatto: medio per utenti con disabilita'.

### AUD-510 - Colori hardcoded fuori dal sistema accent

- Severita': VERDE
- Layer: renderer
- Categoria: design system
- File: `src/app/page.tsx:775`, `786`; `src/components/DownloadButton.tsx:45`; `src/components/StatusMessage.tsx:14`, `22`; `src/components/player/EqualizerPanel.tsx:105-108`
- Problema: focus ring blu, checkbox viola, stop rosso, successo verde e preamp ambra non passano dal sistema `--audit-accent`. In parte sono colori semantici (errore/successo), ma focus e checkbox dovrebbero seguire l'accent scelto. La UI e' congelata.
- Evidenza: `focus:ring-blue-500/50`; `text-purple-500`; `bg-red-600/20`; `bg-green-900/30`; `accent-amber-500`.
- Soluzione: mappare focus e selezione su `acc-*`; mantenere rosso/verde solo per stati semantici; documentare l'eccezione del preamp.
- Alternative: lasciare il blu come colore di focus standard per accessibilita'.
- Sforzo: S. Impatto: basso.

### AUD-511 - Nessun error boundary nel renderer

- Severita': VERDE
- Layer: renderer
- Categoria: resilienza
- File: `src/app/layout.tsx:10-20`, `src/app/page.tsx:59-891`
- Problema: un'eccezione in un componente (per esempio un `track` malformato o un canvas) fa crashare l'intero albero React e lascia una finestra vuota/trasparente. Non c'e' un boundary con messaggio e reload.
- Evidenza: nessun `ErrorBoundary` o `error.tsx` nel progetto; il layout rende direttamente `children`.
- Soluzione: aggiungere un boundary a livello di layout e per la sezione player, con log e pulsante "Ricarica". In Electron, riportare l'errore al main.
- Alternative: `window.onerror`/`unhandledrejection` con overlay di diagnostica.
- Sforzo: S. Impatto: medio in caso di errore.

### AUD-512 - La normalizzazione del progress e' duplicata tra bridge e pagina

- Severita': GIALLO
- Layer: renderer
- Categoria: contratto
- File: `src/app/page.tsx:219-322`; `src/main/python-bridge.ts:16-65`; `src/types/electron.d.ts:30-65`
- Problema: il bridge normalizza il progress, poi la pagina lo rinormalizza con una seconda logica (parse di `_speed_str`, ETA, playlist index, status). Due implementazioni divergono facilmente; per esempio il bridge emette `speed` numerico 0 e la pagina ricalcola dalla stringa. I log `console.log` sono numerosi.
- Evidenza: `safeProgressData` e `handleProgress` fanno lo stesso lavoro su campi diversi; la pagina ha un `try/catch` che inghiotte errori di parsing.
- Soluzione: un solo normalizzatore nel main; il renderer riceve un payload gia' validato e si limita a mostrarlo. Tipi stretti e test di contratto. Rimuovere i log di progress in produzione.
- Alternative: spostare la normalizzazione nel renderer e lasciare il bridge come passthrough.
- Sforzo: S. Impatto: medio, riduce bug difficili.

## 3. Punti di forza

- `PlayerSection` e' memoizzato e resta montato tra i tab: l'audio non si interrompe cambiando tab.
- Coda virtualizzata con overscan e chiavi stabili; `content-visibility` sulle righe.
- Cache art in memoria e `useArt` con stato `undefined/null` distinto.
- Palette accent centralizzata in CSS (`acc-*`), contrasto calcolato per il testo sull'accent.
- Hydration curata: colori, tab, sort e playlist vengono letti dopo il mount.
- Nessun `dangerouslySetInnerHTML`, `eval` o accesso Node nel renderer.
- Mini player con flag preload, quindi niente race hash in produzione.
- `Waves` ha cleanup, resize, touch e pausa su `visibilitychange`.
- Visualizer e waveform usano un canvas a bassa risoluzione, non DOM.

## 4. Domande aperte

- `EQEngine.attach` crea `MediaElementSource` su un elemento `media://`. Con un'origine custom e CORS abilitato il comportamento atteso e' audio non tainted, ma va verificato su build pacchettizzata e macOS: se il media element viene trattato come cross-origin, l'EQ puo' restituire silenzio o un analyser a zero. Test manuale consigliato: riprodurre con EQ Flat e gain +12 su una traccia locale, verificare output e spettro.
- La posizione del mini player non e' persistita; il piano `GENRE_ASSESSMENT.md` lo elenca come gap noto.
- La UI deve restare invariata: i fix di copy/accessibilita' richiedono approvazione separata.

## Riferimenti

- React effects: <https://react.dev/reference/react/useEffect>
- Next hydration: <https://nextjs.org/docs/messages/react-hydration-error>
- Web Audio API: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API>
- MediaElementAudioSourceNode e CORS: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API>
- WCAG 2.1 quick reference: <https://www.w3.org/WAI/WCAG21/quickref/>
- React error boundaries: <https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary>
- content-visibility: <https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility>

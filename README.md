# TinyGit

Un mini-Git giocattolo che gira interamente nel browser — oggetti content-addressed
SHA-1 veri, staging area, branch, merge a 3 vie con conflitti reali — con un
percorso guidato in italiano e una modalità libera con grafo dei commit,
mini-terminale e ispettore delle tre aree (working / index / HEAD).

Nessun backend: tutto lo stato vive in `localStorage` del browser.

## Sviluppo locale

```bash
npm install
npm run dev
```

Apri http://localhost:3000

## Build di produzione (verificata)

```bash
npm run build
npm start
```

## Deploy su Vercel

### Opzione A — da GitHub (consigliata)
1. Crea un repository (es. `tinygit`) e pusha questo codice:
   ```bash
   git init
   git add .
   git commit -m "TinyGit standalone"
   git branch -M main
   git remote add origin https://github.com/<tuo-utente>/tinygit.git
   git push -u origin main
   ```
2. Su [vercel.com](https://vercel.com) → "Add New… → Project" → importa il repository.
   Vercel riconosce Next.js automaticamente, nessuna configurazione da toccare
   (Build Command e Output Directory restano quelli di default).
3. Deploy.

### Opzione B — da CLI, senza GitHub
```bash
npm install -g vercel
vercel
```
Segui le istruzioni interattive (prima esegue un deploy di anteprima; `vercel --prod`
per pubblicarlo).

## Struttura del progetto

```
src/app/
  page.js              # entry point, switch Percorso guidato / Modalità libera
  layout.js            # layout radice (metadata, import CSS)
  globals.css          # direttive Tailwind
  hooks/
    useTinyGit.js       # hook centrale: stato repo, exec comandi, selezioni UI
  lib/
    sha1.js, codec.js, store.js       # fondamenta (hash, encoding, persistenza)
    readers.js, plumbing.js           # lettura/scrittura oggetti Git di basso livello
    porcelain.js                      # comandi di alto livello (status, checkout, staging)
    merge.js                          # merge a 3 vie, fast-forward, conflitti
    graph.js                          # costruzione del grafo dei commit (corsie, righe)
    diff.js                           # diff riga-per-riga (LCS) per la UI
    cli.js                            # parser/dispatcher dei comandi del mini-terminale
    lessons.js                        # contenuto delle 10 fermate del percorso guidato
    faq.js                            # contenuto del pannello "Domande frequenti"
  components/
    StoryMode.js, FreeMode.js         # le due modalità principali
    CommitGraph.js                    # grafo SVG dei commit
    ThreeStageInspector.js            # ispettore working/index/HEAD, diff, mini-editor
    ConflictResolver.js               # risoluzione conflitti di merge
    MiniTerminal.js                   # terminale condiviso (con cronologia comandi)
    HelpModal.js, RepoIoPanel.js      # pannello FAQ, export/import repository JSON
```

## Note tecniche

- Richiede WebCrypto (`crypto.subtle`), disponibile in ogni browser moderno su
  https o `http://localhost` — Vercel serve sempre in https, quindi nessun problema.
- Persistenza: due chiavi in `localStorage`, `tinygit_repo@1` (stato del
  repository) e `tinygit_story_progress@1` (avanzamento del percorso guidato).
- Nessuna variabile d'ambiente richiesta.

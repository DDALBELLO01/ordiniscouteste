# Deployment Guide - Wasmer

## 🦞 Come Deployare su Wasmer

Wasmer è un WebAssembly runtime che ti permette di eseguire applicazioni compilate a WASM in modo universale.

### Prerequisiti
- Wasmer CLI installato
- Docker (opzionale)
- Account Wasmer.io

### Installazione Wasmer

```bash
curl https://get.wasmer.io -sSfL | sh
```

### Step 1: Preparare l'Applicazione

```bash
cd "Ordini scout"
npm install
npm run build
```

### Step 2: Database PostgreSQL

Wasmer Edge supporta database gestiti PostgreSQL/MySQL, non SQLite gestito.
Il backend usa SQLite in locale e passa automaticamente a PostgreSQL quando
sono presenti `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME` e `DB_PASSWORD`.

Per migrare il backup SQLite:

```bash
cd server
npm run migrate:postgres
```

### Step 3: Package e runtime Wasmer

Wasmer Edge richiede un package WASM pubblicato nel registry e un `app.yaml`.
Il solo `server.js` non è un package WASM e il vecchio esempio `wasmtime.toml`
con `wasmer:sqlite` non è sufficiente per eseguire Express/Node.

```toml
[package]
name = "ordini-scout"
version = "1.0.0"
description = "Gestione ordini scout con Wasmer"

[dependencies]
# SQLite per Wasmer
"wasmer:sqlite" = "0.1.0"
```

### Step 4: Build per Wasmer

Per Node.js su Wasmer, usare il Node.js compilato:

```bash
# Usando la build Node.js di Wasmer
wasmer run ./server/server.js
```

### Step 5: Configurazione Ambiente

Creare un file `.env.wasmer`:

```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-app.wasmer.app

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@ordini-scout.it

ADMIN_EMAIL=admin@ordini-scout.it
ADMIN_PASSWORD=admin123

# PostgreSQL gestito da Wasmer: usare le variabili DB_* fornite dall'app.
```

### Step 6: Deploy su Wasmer.io

```bash
# Login a Wasmer
wasmer login

# Publish l'app
wasmer publish --private

# Oppure creare un package WASM
wasmer pack
```

### Step 7: Configurare SSL e Custom Domain

Accedere a wasmer.io dashboard:
1. Andare su Applications
2. Configurare HTTPS
3. Aggiungere custom domain (opzionale)
4. Impostare variabili d'ambiente

## 📊 Architettura su Wasmer

```
┌─────────────────────────────────────┐
│  Wasmer.io (WebAssembly Runtime)   │
├─────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Node.js (Compiled to WASM)  │   │
│  │  + Express Server            │   │
│  │  + SQLite Database           │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Static Files (React Build)  │   │
│  │  + Nginx (Reverse Proxy)     │   │
│  └──────────────────────────────┘   │
│                                      │
└─────────────────────────────────────┘
         ↕
    Wasmer Registry
```

## 🔗 Collegamento Database Persistente

Per mantenere i dati persistenti su Wasmer:

### Opzione 1: Volumes Wasmer
```bash
wasmer run \
  --dir=/data \
  --mount=/data:/persistent \
  ./server/server.js
```

### Opzione 2: Database Esterno (Consigliato)

Modificare `server/database.js`:

```javascript
const dbUrl = process.env.DATABASE_URL || 'sqlite:///tmp/ordini.db';

// Oppure usare PostgreSQL remoto
const db = new Pool({
  connectionString: process.env.DATABASE_URL
});
```

### Opzione 3: Network Storage

```bash
# Su Wasmer, montare uno storage persistente
wasmer run \
  --mount=/data:/persistent \
  --env DATABASE_PATH=/persistent/ordini.db \
  ./server/server.js
```

## 📈 Monitoraggio

```bash
# Visualizzare logs in tempo reale
wasmer logs <app-id>

# Monitorare memoria e CPU
wasmer stats <app-id>
```

## ⚡ Ottimizzazione Wasmer

1. **Ridurre bundle size**
   ```bash
   npm run build --prefix client
   # Verificare dimensione
   du -sh client/dist
   ```

2. **Abilitare gzip compression**
   ```javascript
   // server.js
   import compression from 'compression';
   app.use(compression());
   ```

3. **Cachare risorse statiche**
   ```javascript
   app.use(express.static('public', {
     maxAge: '1d',
     etag: false
   }));
   ```

## 🚀 CI/CD con GitHub Actions per Wasmer

Creare `.github/workflows/deploy-wasmer.yml`:

```yaml
name: Deploy to Wasmer

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install & Build
        run: |
          npm install
          npm run build
      
      - name: Install Wasmer
        run: curl https://get.wasmer.io -sSfL | sh
      
      - name: Deploy
        run: |
          source $HOME/.wasmer/env.sh
          wasmer publish
        env:
          WASMER_TOKEN: ${{ secrets.WASMER_TOKEN }}
```

## 🐛 Troubleshooting

### Errore: "WASM module not found"
```bash
# Verificare che Node.js sia compilato per Wasmer
wasmer run --version
wasmer run node --version
```

### Database lock error
```bash
# Usare WAL mode per SQLite
# In database.js
await db.exec('PRAGMA journal_mode = WAL;');
```

### Timeout su deploy
```bash
# Aumentare timeout
wasmer deploy --timeout 600
```

## 📚 Risorse Utili

- Documentazione Wasmer: https://docs.wasmer.io
- Wasmer WASI: https://wasi.dev
- Node.js su Wasmer: https://nodejs.org
- SQLite WASM: https://sqlite.org/wasm

## 💾 Backup e Restore

```bash
# Esportare database
wasmer download <app-id>:/data/ordini.db ./backup/

# Ripristinare database
wasmer upload ./backup/ordini.db <app-id>:/data/
```

---

**Nota**: Per supporto tecnico, consultare la documentazione ufficiale di Wasmer.

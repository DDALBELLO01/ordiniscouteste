# 🏕️ Ordini Scout - Gestione Materiale

Una moderna applicazione web per la gestione degli ordini e della prenotazione di materiale scout, completamente rilasciabile su **Wasmer**.

## ✨ Caratteristiche

### Pagina Pubblica (Prenotazioni)
- 📦 Catalogo completo del materiale organizzato per branca
- 🛒 Carrello con selezione quantità
- 📧 Conferma automatica via email
- 🔒 Admin può disabilitare le prenotazioni quando necessario
- 📱 Responsive design per mobile

### Pannello Admin
- 👤 Accesso protetto con login
- 📊 Gestione completa anagrafica prodotti
- 🏷️ Campi: Nome, Tipologia, Branca, Quantità, Prezzo
- 📋 Visualizzazione e gestione di tutte le prenotazioni
- 🔄 Cambio stato prenotazioni (attiva → confermata → ritirata/annullata)
- ⚙️ Controllo abilitazione/disabilitazione prenotazioni

### Sistema Email
- ✅ Riepilogo automatico inviato al cliente
- 📬 Notifica all'admin per ogni nuova prenotazione
- 🎨 Template HTML formattato e professionale

## 🛠️ Stack Tecnologico

### Backend
- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **SQLite3** - Database leggero e portabile
- **Nodemailer** - Servizio email

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool moderno
- **Axios** - HTTP client
- **CSS3** - Styling responsivo

### Deployment
- **Wasmer** - WebAssembly runtime per WASM compatibility
- **Docker** - Containerizzazione (opzionale)

## 📋 Requisiti

- Node.js >= 18.0.0
- npm o yarn
- Un account SMTP per le email (Gmail, SendGrid, etc.)

## 🚀 Installazione

### 1. Clonare il repository
```bash
git clone <repo-url>
cd "Ordini scout"
```

### 2. Setup Backend
```bash
cd server
npm install
cp .env.example .env
```

Configurare il file `.env`:
```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@ordini-scout.it

ADMIN_EMAIL=admin@ordini-scout.it
ADMIN_PASSWORD=admin123
```

### 3. Setup Frontend
```bash
cd client
npm install
```

## 🏃 Esecuzione in Sviluppo

### Terminal 1 - Backend
```bash
cd server
npm run dev
```
Server disponibile su: `http://localhost:5000`

### Terminal 2 - Frontend
```bash
cd client
npm run dev
```
App disponibile su: `http://localhost:5173`

## 📦 Build per Produzione

### Backend
```bash
cd server
npm run build
```

### Frontend
```bash
cd client
npm run build
```
I file ottimizzati saranno in `client/dist`

## 🐳 Deployment con Docker

### Build Docker Image
```bash
docker build -t ordini-scout .
```

### Run Container
```bash
docker run -p 5000:5000 \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=587 \
  -e SMTP_USER=your-email@gmail.com \
  -e SMTP_PASSWORD=your-password \
  -e ADMIN_EMAIL=admin@ordini-scout.it \
  -e ADMIN_PASSWORD=admin123 \
  ordini-scout
```

## 🦞 Deployment su Wasmer

### 1. Installare Wasmer
```bash
curl https://get.wasmer.io -sSfL | sh
```

### 2. Preparare il package
```bash
wasmer publish
```

### 3. Eseguire su Wasmer
```bash
wasmer run ordini-scout-app
```

Per il full setup Wasmer con database SQLite, seguire:
https://docs.wasmer.io/ecosystem/wasix/tutorials

## 📱 Utilizzo

### Come Utente Pubblico
1. Accedere alla home page
2. Selezionare i prodotti desiderati per branca
3. Specificare le quantità
4. Inserire nome, email e note
5. Ricevere conferma via email

### Come Admin
1. Cliccare su "Admin" nell'header
2. Inserire credenziali (default: admin@ordini-scout.it / admin123)
3. Navigare tra le sezioni:
   - **Gestione Prodotti**: CRUD completo dei prodotti
   - **Prenotazioni**: Visualizzazione e gestione dello stato
   - **Configurazione**: Abilitazione/disabilitazione prenotazioni

## 🔒 Sicurezza

⚠️ **Nota di Sviluppo**: Le credenziali di default devono essere cambiate in produzione.

Per un sistema di autenticazione robusto:
1. Implementare JWT tokens
2. Hash delle password con bcrypt
3. Rate limiting per login
4. HTTPS in produzione

## 📋 API Endpoints

### Pubblici
- `GET /api/prodotti` - Elenco prodotti
- `GET /api/config/prenotazioni-abilitate` - Stato prenotazioni
- `POST /api/prenotazioni` - Crea nuova prenotazione

### Admin
- `POST /api/admin/login` - Login
- `POST /api/admin/prodotti` - Crea prodotto
- `PUT /api/admin/prodotti/:id` - Modifica prodotto
- `DELETE /api/admin/prodotti/:id` - Elimina prodotto
- `GET /api/admin/prenotazioni` - Elenco prenotazioni
- `GET /api/admin/prenotazioni/:id` - Dettagli prenotazione
- `PUT /api/admin/prenotazioni/:id/stato` - Cambia stato
- `PUT /api/admin/config/prenotazioni` - Abilita/disabilita prenotazioni

## 📚 Struttura Cartelle

```
Ordini scout/
├── server/
│   ├── package.json
│   ├── server.js (Entry point)
│   ├── database.js (SQLite setup)
│   ├── emailService.js (Nodemailer)
│   ├── .env.example
│   └── database/
│       └── ordini.db (SQLite database)
│
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── PublicBooking.jsx
│   │   │   └── AdminPanel.jsx
│   │   ├── components/
│   │   │   ├── ProductSelector.jsx
│   │   │   ├── BookingForm.jsx
│   │   │   ├── ProductManagement.jsx
│   │   │   ├── BookingManagement.jsx
│   │   │   └── LoginForm.jsx
│   │   └── styles/
│   │       ├── PublicBooking.css
│   │       ├── AdminPanel.css
│   │       └── components.css
│   └── dist/ (Build output)
│
├── README.md (questo file)
└── .gitignore
```

## 🤝 Contribuire

Le pull request sono benvenute! Per grandi cambiamenti, aprire prima un issue.

## 📝 Licenza

MIT License - vedi LICENSE file per dettagli

## 📞 Contatti

Per domande o problemi, contattare: admin@ordini-scout.it

---

**Realizzato con ❤️ per la comunità Scout**

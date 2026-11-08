# Contributing Guidelines

## Come Contribuire

Grazie per l'interesse nel contribuire a Ordini Scout! Ecco le linee guida:

### 🐛 Segnalare Bug

Se trovi un bug:
1. Verifica che il bug non sia già segnalato
2. Apri una issue con:
   - Descrizione chiara del bug
   - Passi per riprodurlo
   - Comportamento atteso vs effettivo
   - Environment (OS, Node version, etc.)

### 💡 Suggerire Miglioramenti

Per suggerire una feature:
1. Apri una issue con il tag `enhancement`
2. Descrivi il caso d'uso
3. Spiega come dovrebbe funzionare
4. Se possibile, fornisci mockup/sketch

### 🔧 Sviluppare Modifiche

1. **Fork il repository**
   ```bash
   git clone <your-fork-url>
   cd "Ordini scout"
   ```

2. **Crea un branch**
   ```bash
   git checkout -b feature/nome-feature
   ```

3. **Apporta le modifiche**
   - Segui lo stile di codice esistente
   - Aggiungi commenti dove appropriato
   - Testa localmente

4. **Commit e Push**
   ```bash
   git add .
   git commit -m "Fix: descrizione breve" 
   # o "Feat: ..." per nuove feature
   git push origin feature/nome-feature
   ```

5. **Apri una Pull Request**
   - Descrivi le modifiche
   - Collega le issue correlate
   - Richiedi review

### 📝 Convenzioni di Codice

- **JavaScript/React**: Usa ES6+
- **Indentazione**: 2 spazi
- **Nomi**: camelCase per variabili, PascalCase per componenti
- **Formato**: Usa prettier se disponibile

### 🧪 Testing

#### Prenotazioni e accesso capi unità

- L'admin vede gli articoli raggruppati per nome, taglia, specialità e
  condizione nuovo/usato, anche se presenti in più schede prodotto; i
  dettagli mostrano nome, email, branca, data e quantità di ogni ordinante.
  I filtri limitano anche le righe interessate dalla selezione massiva.
- Lo stato appartiene alla singola riga articolo: Prenotato, Pagato,
  Non disponibile, Non pagato, Ordinato, Ricevuto. Una riga con quantità
  maggiore di uno cambia stato per tutta la sua quantità.
- Passare a Ricevuto, Non disponibile o Non pagato crea una notifica per
  prenotazione, con i soli articoli modificati. Reimpostare lo stesso stato
  non crea un'altra email; uscire da quello stato e tornarci sì.
- Le notifiche sono salvate nel database insieme al cambio stato. Il server
  controlla la coda ogni 10 secondi e ritenta gli errori SMTP con attese
  crescenti fino a un'ora. L'admin vede i conteggi di email in coda e in errore.
  Un arresto subito dopo l'accettazione SMTP ma prima della conferma nel
  database può causare un reinvio: la consegna è almeno una volta, non
  esattamente una volta. La configurazione SMTP esistente resta necessaria.
- Nella scheda **Capi Unità** l'admin crea account con nome, email, password
  di almeno 10 caratteri e una o più branche. I capi vedono solo le
  prenotazioni delle branche assegnate, raggruppate per persona/prenotazione,
  e possono confermare il pagamento dell'intera prenotazione, anche quando
  contiene articoli non disponibili. La conferma del pagamento è conservata
  separatamente: gli stati logistici Ordinato, Ricevuto e Non disponibile non
  vengono sovrascritti. L'admin può impostare Non pagato per revocare la
  conferma dei singoli articoli.
- Le password dei capi sono memorizzate con scrypt; le sessioni durano
  12 ore e sono verificate dal server. L'admin continua a usare le credenziali
  configurate. Dopo l'aggiornamento è necessario accedere nuovamente.
  Eliminare un account revoca anche le sue sessioni.
  Le denominazioni storiche Coccinelle, Lupetti, Rover e Capi sono riconosciute
  rispettivamente come Cerchio, Branco, Clan e RS.
- Le migrazioni automatiche supportano SQLite e PostgreSQL. I vecchi
  articoli segnati come acquistati diventano Ordinati; gli altri Prenotati.
  Lo storico archiviato rimane consultabile, ma **Archivia tutto** è rimosso.
  Gli stati non archiviano automaticamente prenotazioni né modificano
  giacenze. L'azione preesistente **Da acquistare** mantiene la gestione
  giacenze e imposta Ordinato, limitandosi alle righe Prenotate o Pagate.
  La modifica della prenotazione conserva identità, stato e pagamento delle
  righe esistenti; le righe nuove iniziano come Prenotate.

Per verificare API, permessi, pagamenti completi, transizioni, migrazioni,
conservazione degli stati durante le modifiche e retry delle notifiche:

```bash
DB_HOST= npm test --prefix server
npm run build --prefix server
npm run build --prefix client
```

I test usano un file SQLite temporaneo se `DB_HOST` non è configurato.
Per eseguirli con PostgreSQL, configurare le variabili `DB_*` verso un
database **temporaneo e vuoto**: non usare il database di produzione.
L'esecuzione su PostgreSQL richiede anche `WORKFLOW_TEST_POSTGRES=1`.

#### Docker con PostgreSQL locale (Linux)

Il servizio `server` usa la rete host per raggiungere PostgreSQL su
`127.0.0.1:5432` e ascolta direttamente sulla porta 5000 dell'host.
Il servizio `client` pubblica la porta 3001 e usa `extra_hosts` per risolvere
`server` verso il gateway dell'host: Nginx puo' quindi inoltrare `/api` a
`http://server:5000` anche se il backend non appartiene alla rete Docker.
Le porte 3001 e 5000 devono essere libere. Non e' necessario esporre PostgreSQL
alle reti Docker.

Dopo modifiche alla rete, esegui `docker compose up -d` per ricreare i servizi
interessati; un semplice `docker compose restart` non applica la configurazione.

Prima di fare una PR, testa:
```bash
# Backend
cd server
npm test

# Frontend
cd client
npm test
```

### 📚 Documentazione

Se aggiungi una feature:
1. Aggiorna README.md
2. Aggiungi commenti al codice
3. Aggiorna la documentazione API se necessario

### 🎨 Stilistica

- Mantieni il design coerente
- Usa i colori definiti nel CSS
- Testa il responsive design

### ✅ Checklist prima di fare PR

- [ ] Codice testato localmente
- [ ] No console.log() rimasti
- [ ] README aggiornato (se necessario)
- [ ] Commit message chiaro
- [ ] Nessun merge conflict

---

Grazie per il contributo! 🙏

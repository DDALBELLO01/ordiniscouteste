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

#### Prezzi degli articoli

- La testata articolo gestisce **Prezzo di vendita** e **Costo di acquisto**,
  applicabili alle varianti tramite **Modifica testata**. La scelta delle
  branche occupa una riga orizzontale con ritorno a capo; URL e prezzi sono
  affiancati per coppie, mentre su mobile i campi si dispongono in colonna.
  Ogni articolo ha una scheda testata con nome, immagine, tipologia, branche,
  prezzi, condizione e visibilità. Sotto, una tabella separata mostra soltanto
  taglia, quantità e azioni delle varianti, senza duplicare i dati comuni.
- Il flag di testata **Non a catalogo scouting** limita la prenotazione
  alla giacenza disponibile, come per gli articoli usati: a zero o sotto
  zero le varianti non sono mostrate nel catalogo pubblico. Una giacenza
  vuota mantiene il significato esistente di disponibilita illimitata.
  Il server verifica le quantita nella transazione di prenotazione, anche
  per righe duplicate e richieste concorrenti, e durante le modifiche.
  Questi articoli compaiono nel riepilogo del materiale richiesto, ma non
  sono riordinati dall'azione di acquisto. Il flag non riattiva sincronizzazioni esterne.
  Il vecchio campo
  `prezzo` viene migrato automaticamente nei due nuovi campi e poi rimosso,
  sia su SQLite sia su PostgreSQL. I successivi avvii non sovrascrivono i valori.
- Catalogo pubblico, carrello, prenotazioni e importi da riscuotere usano il
  prezzo di vendita. Le righe di prenotazione conservano il prezzo concordato
  in `prezzo_unitario`; modificarne la testata non cambia gli ordini esistenti.
  La sezione **Da acquistare** mostra il costo di acquisto.
- Il catalogo completo usa l'API autenticata `/api/admin/prodotti`; soltanto
  l'admin riceve anche il costo di acquisto. L'API pubblica non espone costi.
  Campi e sincronizzazione Scouting sono rimossi, senza eliminare articoli,
  immagini o guide taglie.

#### Prenotazioni e accesso capi unità

- L'admin vede gli articoli raggruppati per nome, taglia, specialità e
  condizione nuovo/usato, anche se presenti in più schede prodotto; i
  dettagli mostrano nome, email, branca, data e quantità di ogni ordinante.
  Il popup dettagli usa una larghezza fino a 1400 px; sotto 900 px presenta
  schede con etichette per mostrare tutti i campi senza scorrimento orizzontale.
  Con molti ordinanti rimane disponibile lo scorrimento verticale dei dettagli,
  mentre titolo e azione di conferma restano visibili.
  I filtri limitano anche le righe interessate dalla selezione massiva.
  **Elimina selezionati** elimina le righe articolo selezionate per l'admin
  e le intere prenotazioni selezionate per il capo unità, solo se tutte sono
  della sua branca, attive e interamente da pagare. Serve conferma esplicita.
  Il server esegue l'intera selezione in una transazione: un errore annulla
  tutte le eliminazioni. Le giacenze limitate delle righe non acquistate sono
  ripristinate; le prenotazioni rimaste senza articoli vengono eliminate.
  Lo storico archiviato non consente eliminazioni massive.
  Le viste per taglia e per prenotazione hanno collegamenti reciproci e
  gli stessi pulsanti **Attive / Archiviate**. Nella vista per prenotazione
  l'admin può selezionare le prenotazioni attive e **Archivia selezionate**.
  La selezione globale riguarda solo i risultati filtrati e viene azzerata
  cambiando filtri o vista. L'archiviazione richiede conferma, è atomica e
  registra la data senza cambiare righe, pagamenti, giacenze o inviare email.
  Il menu del nuovo stato usa lo stile del pannello, con focus visibile
  da tastiera e stato disabilitato distinto, mantenendo il select nativo.
- Lo stato appartiene alla singola riga articolo: Prenotato, Pagato,
  Non disponibile, Ordinato, Ricevuto. Una riga con quantità
  maggiore di uno cambia stato per tutta la sua quantità.
- Passare a Ricevuto o Non disponibile crea una notifica per
  prenotazione, con i soli articoli modificati. Reimpostare lo stesso stato
  non crea un'altra email; uscire da quello stato e tornarci sì.
- Passare a **Ordinato**, anche da **Da acquistare**, accoda una mail per
  branca a ogni capo unità corrispondente. Ogni operazione include soltanto
  le righe appena modificate, raggruppate per articolo/taglia/specialità e
  importi uguali. La mail separa il totale costo di acquisto (dalla testata
  al momento dell'ordine) dal totale vendita da chiedere ai clienti (dalle
  righe prenotate), entrambi moltiplicati per le quantità. I valori vengono
  salvati nella notifica: modificare i prezzi non cambia i successivi retry.
  Reimpostare Ordinato non invia duplicati; tornare a Ordinato dopo un altro
  stato crea una nuova notifica. Non vengono notificati ordini preesistenti.
- Le notifiche sono salvate nel database insieme al cambio stato. Il server
  controlla la coda ogni 10 secondi e ritenta gli errori SMTP con attese
  crescenti fino a un'ora. L'admin vede i conteggi di email in coda e in errore.
  Un arresto subito dopo l'accettazione SMTP ma prima della conferma nel
  database può causare un reinvio: la consegna è almeno una volta, non
  esattamente una volta. La configurazione SMTP esistente resta necessaria.
- Quando una persona conferma la prenotazione dal carrello, il server accoda
  una mail a ogni account capo unità con la branca corrispondente (anche per
  le denominazioni storiche). La mail contiene prenotante, articoli, taglie,
  quantità, totale da pagare e note. Non attende pagamento o ricezione articoli.
  Tutte le email (conferma cliente, notifica admin, capi unità, cambi stato,
  articoli ordinati e riepilogo di chiusura) condividono lo stesso layout:
  intestazione blu, scheda bianca da 640 px, caratteri, tabelle, totali e
  piè di pagina uniformi, con stili inline compatibili con i client email.
  Layout e componenti sono centralizzati nel servizio email per evitare
  differenze tra notifiche. Ogni messaggio include anche il testo semplice.
  Le note
  compaiono solo se presenti; rimane disponibile la versione testuale.
  Prenotazione e notifiche ai capi sono salvate nella stessa transazione;
  gli errori SMTP vengono ritentati dalla coda esistente. Gli indirizzi sono
  quelli degli account **Capi Unità**, non della vecchia configurazione email.
  Senza un account corrispondente, la prenotazione resta consentita e il server
  registra un avviso. Non vengono inviate notifiche retroattive.
- Nella scheda **Capi Unità** l'admin crea account con nome, email, password
  di almeno 10 caratteri e una sola branca, selezionata tramite radio button.
  Anche il server rifiuta assegnazioni vuote o multiple. Eventuali account
  preesistenti con più branche non possono gestire prenotazioni: l'admin deve
  ricrearli con la branca corretta, senza assegnazioni automatiche.
  I capi vedono solo le
  prenotazioni delle branche assegnate, raggruppate per persona/prenotazione,
  e possono confermare il pagamento dell'intera prenotazione, anche quando
  contiene articoli non disponibili. La conferma del pagamento è conservata
  separatamente: gli stati logistici Ordinato, Ricevuto e Non disponibile non
  vengono sovrascritti. I capi possono modificare dati e articoli o eliminare
  le prenotazioni attive della propria branca solo se nessuna riga risulta
  pagata. I controlli sono applicati anche dal server; non è consentito
  spostare prenotazioni in altre branche né alterare i prezzi degli articoli.
- Le password dei capi sono memorizzate con scrypt; le sessioni durano
  12 ore e sono verificate dal server. L'admin continua a usare le credenziali
  configurate. Dopo l'aggiornamento è necessario accedere nuovamente.
  Il ricaricamento della pagina ripristina il ruolo dal server, senza cache.
  Tutte le risposte API amministrative usano `Cache-Control: no-store` e
  `Vary: Authorization` per evitare il riutilizzo tra sessioni diverse.
  Eliminare un account revoca anche le sue sessioni.
  La vecchia sezione di configurazione email per branca non è più presente
  nel pannello: email e branche dei capi si gestiscono tramite gli account.
  Il vecchio indirizzo `/admin/impostazioni` reindirizza a **Capi Unità**.
  Le checkbox del pannello amministrativo hanno focus da tastiera e stati
  selezionato/disabilitato distinguibili; in Capi Unità le branche sono
  schede selezionabili e i campi account mantengono etichette e suggerimenti.
  Le denominazioni storiche Coccinelle, Lupetti, Rover e Capi sono riconosciute
  rispettivamente come Cerchio, Branco, Clan e RS.
- Le migrazioni automatiche supportano SQLite e PostgreSQL. I vecchi
  articoli segnati come acquistati diventano Ordinati; gli altri Prenotati.
  Lo stato Non pagato è rimosso: le righe preesistenti diventano Prenotate
  senza pagamento registrato e le relative notifiche non inviate sono rimosse.
  Lo storico archiviato rimane consultabile, ma **Archivia tutto** è rimosso.
  Gli stati non archiviano automaticamente prenotazioni.
  Passare a Ordinato sposta il fabbisogno dal magazzino al fornitore;
  riaprire una riga acquistata come Prenotata/Pagata la riserva nuovamente.
  La modifica della prenotazione conserva identità, stato e pagamento delle
  righe esistenti; le righe nuove iniziano come Prenotate.

#### Materiale da magazzino e da acquistare

- **Da acquistare** riepiloga tutte le varianti richieste nelle prenotazioni
  attive: quantita richieste, copertura da magazzino, mancanti da ordinare,
  pezzi ordinati in attesa di arrivo, ricevuti e non disponibili.
  Include usato e fuori catalogo, acquistabili soltanto da magazzino.
  Filtri e selezione globale riguardano le righe visibili; i dettagli
  mostrano l'assegnazione per cliente e branca.
- La giacenza in anagrafica resta **netta delle prenotazioni**, come prima:
  il checkout la scala subito e puo renderla negativa per articoli a catalogo.
  La copertura delle richieste ancora Prenotate/Pagate e non acquistate e
  `min(richieste, max(0, giacenza_netta + richieste))`.
  Da Gestione Prodotti, **Rettifica giacenza** registra i pezzi fisicamente
  presenti e ricalcola la giacenza netta sottraendo le prenotazioni ancora da
  evadere; per esempio, zero pezzi fisici e una prenotazione producono una
  giacenza netta di -1 e un pezzo da ordinare. La rettifica non modifica le
  prenotazioni.
  Le righe ricevono copertura in ordine di data prenotazione, poi ID
  prenotazione e ID riga, senza priorita ai pagamenti.
  Una giacenza vuota non limita il checkout, ma nel riepilogo non costituisce
  disponibilita fisica: tutte le richieste sono mancanti.
- **Prepara da magazzino** segna Ricevuti soltanto i pezzi coperti e accoda
  la normale email al cliente. **Ordina mancanti** segna Ordinati soltanto
  i pezzi scoperti, escludendo usato e fuori catalogo, e accoda il riepilogo
  ai capi con i soli importi di questi pezzi. Il costo dei mancanti esclude
  materiale gia ordinato o coperto da magazzino.
  Se necessario una riga viene divisa, conservando prodotto, specialita,
  prezzo concordato e pagamento. Non cambia il totale della prenotazione.
- Ordinare non carica merce fisica: rimuove soltanto la prenotazione dei
  pezzi mancanti dalla giacenza netta e imposta `acquistato = 1`.
  **Registra arrivo fornitore** passa da Ordinato a Ricevuto e avvisa i
  clienti; i pezzi sono gia destinati a loro e non diventano scorta libera.
  Tutte le operazioni ricalcolano le quantita nella transazione e non
  duplicano cambi stato o notifiche se ripetute senza nuovi fabbisogni.
- Le prenotazioni archiviate non compaiono. Le righe Non disponibili e
  quelle archiviate mantengono le precedenti riserve di magazzino: nessuno
  svincolo automatico o rettifica retroattiva delle giacenze storiche.
  La nuova pagina non ricostruisce inventari fisici da vecchi ordini:
  eventuali errori storici vanno corretti con **Rettifica giacenza**
  nell'anagrafica varianti.

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

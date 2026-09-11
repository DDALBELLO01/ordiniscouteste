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


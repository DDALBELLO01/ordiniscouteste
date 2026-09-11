#!/bin/bash

# Script di installazione e setup del progetto
# Uso: ./setup.sh

set -e

echo "🏕️ Setup Ordini Scout - Gestione Materiale"
echo "==========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trovato. Installare Node.js 18+ da https://nodejs.org"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Setup Backend
echo "📦 Setup Backend..."
cd server

if [ ! -f .env ]; then
    echo "📝 Creando .env dal template..."
    cp .env.example .env
    echo "⚠️  Editare server/.env con i dati SMTP prima di avviare!"
fi

echo "📥 Installando dipendenze backend..."
npm install

cd ..
echo "✅ Backend setup completato"
echo ""

# Setup Frontend
echo "🎨 Setup Frontend..."
cd client

echo "📥 Installando dipendenze frontend..."
npm install

cd ..
echo "✅ Frontend setup completato"
echo ""

# Create database directory
mkdir -p server/database

echo "==========================================="
echo "✅ Setup completato con successo!"
echo ""
echo "📝 Prossimi step:"
echo "1. Editare server/.env con le credenziali SMTP"
echo "2. Eseguire in due terminali:"
echo "   Terminal 1: cd server && npm run dev"
echo "   Terminal 2: cd client && npm run dev"
echo ""
echo "🌐 Accedere a: http://localhost:5173"
echo "📧 Credenziali Admin (default): admin@ordini-scout.it / admin123"

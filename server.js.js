const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Inicialização da aplicação Express
const app = express();

// Middlewares
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// Inicialização do Firebase Admin SDK
// Tenta carregar das variáveis de ambiente (Vercel/Produção) ou arquivo local
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : process.env.FIREBASE_SERVICE_ACCOUNT;
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
  console.error('Erro ao inicializar Firebase Admin SDK:', error.message);
}

const db = admin.firestore();

// Middleware de Autenticação (Verificação de Token JWT do Firebase)
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token não fornecido.' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
}

// Middleware para verificar se o usuário é Líder
async function leaderMiddleware(req, res, next) {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    const isLeader = userData.role === 'lider' || 
      (userData.tempLeaderUntil && new Date(userData.tempLeaderUntil) > new Date());

    if (!isLeader) {
      return res.status(403).json({ error: 'Acesso permitido apenas para líderes.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao verificar permissão de liderança.' });
  }
}

// --- ROTAS DA API ---

// Rota de Teste / Helthcheck
app.get('/api', (req, res) => {
  res.json({ message: 'API Louvor IBVC rodando com sucesso na Vercel!' });
});

// 1. USUÁRIOS
app.get('/api/users', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    const docRef = await db.collection('users').add(userData);
    res.status(201).json({ id: docRef.id, ...userData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).update(req.body);
    res.json({ message: 'Usuário atualizado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. MURAL DE AVISOS
app.get('/api/avisos', async (req, res) => {
  try {
    const snapshot = await db.collection('avisos').get();
    const avisos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(avisos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/avisos', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const avisoData = {
      ...req.body,
      authorId: req.user.uid,
      date: new Date().toLocaleDateString('pt-BR')
    };
    const docRef = await db.collection('avisos').add(avisoData);
    res.status(201).json({ id: docRef.id, ...avisoData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/avisos/:id', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('avisos').doc(id).update(req.body);
    res.json({ message: 'Aviso atualizado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/avisos/:id', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('avisos').doc(id).delete();
    res.json({ message: 'Aviso removido com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. ESCALAS DE LOUVOR
app.get('/api/escalas', async (req, res) => {
  try {
    const snapshot = await db.collection('escalas').get();
    const escalas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(escalas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/escalas', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const escalaData = req.body;
    const docRef = await db.collection('escalas').add(escalaData);
    res.status(201).json({ id: docRef.id, ...escalaData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/escalas/:id', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('escalas').doc(id).update(req.body);
    res.json({ message: 'Escala atualizada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/escalas/:id', authMiddleware, leaderMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('escalas').doc(id).delete();
    res.json({ message: 'Escala removida com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. INDICAÇÕES DE LOUVOR
app.get('/api/indicacoes', async (req, res) => {
  try {
    const snapshot = await db.collection('indicacoes').get();
    const indicacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(indicacoes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/indicacoes', authMiddleware, async (req, res) => {
  try {
    const indicacaoData = {
      ...req.body,
      createdBy: req.user.uid,
      createdAt: new Date().toISOString()
    };
    const docRef = await db.collection('indicacoes').add(indicacaoData);
    res.status(201).json({ id: docRef.id, ...indicacaoData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/indicacoes/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('indicacoes').doc(id).delete();
    res.json({ message: 'Indicação removida com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicialização do servidor local (caso esteja rodando fora da Vercel)
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando localmente na porta ${PORT}`);
  });
}

// Exportação necessária para Serverless Functions na Vercel
module.exports = app;
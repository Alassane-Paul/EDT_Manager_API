const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
let ioInstance = null;

// Middleware de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://fundacionesperanzatogo.tg',
  'https://www.fundacionesperanzatogo.tg'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-etablissement-code', 'x-etablissement-access-code']
}));


// Limitation de requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' }
});
app.use('/api/', limiter);

// Middleware pour parser le JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging des requêtes
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Import des routes
const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/users.route');
const etablissementRoutes = require('./routes/etablissements.route');
const classeRoutes = require('./routes/classes.route');
const matiereRoutes = require('./routes/matieres.route');
const enseignantRoutes = require('./routes/enseignants.route');
const salleRoutes = require('./routes/salles.route');
const coursRoutes = require('./routes/cours.route');
const emploiTempsRoutes = require('./routes/emplois-temps.route');
const rattrapageRoutes = require('./routes/rattrapages.route');
const absenceRoutes = require('./routes/absences.route');
const teacherAbsenceRoutes = require('./routes/teacherAbsences.route');
const statistiqueRoutes = require('./routes/statistiques.route');
const notificationRoutes = require('./routes/notifications.route');
const eleveRoutes = require('./routes/eleves.route');
const directeurRoutes = require('./routes/directeurs.route');
const rpRoutes = require('./routes/responsables.route');
const periodeRoutes = require('./routes/periodes.route');
const evaluationRoutes = require('./routes/evaluations.route');
const noteRoutes = require('./routes/notes.route');
const bulletinRoutes = require('./routes/bulletins.route');
const ressourceRoutes = require('./routes/ressources.route');
const seanceVirtuelleRoutes = require('./routes/seancesVirtuelles.route');
const examenRoutes = require('./routes/examens.route');
const sessionExamenRoutes = require('./routes/sessionsExamen.route');
const repartitionRoutes = require('./routes/repartitions.route');
const subscriptionRoutes = require('./routes/subscriptions.route');
const invoiceRoutes = require('./routes/invoices.route');
const pricingRoutes = require('./routes/pricing.route');
const paymentRoutes = require('./routes/payments.route');
const accreditationRoutes = require('./routes/accreditation.route');
const chatRoutes = require('./routes/chat.route');

const { logAccess } = require('./middleware/auth');

// Logging applicatif global (après parsing et avant routes)
app.use((req, res, next) => {
  // on logge tout ; action générique "global"
  return logAccess('global')(req, res, next);
});

// Middleware pour rendre io accessible dans les routes
app.use((req, res, next) => {
  req.io = ioInstance;
  next();
});

// Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes API - Supportent avec et sans le préfixe /api pour la flexibilité en production
const routesMapping = [
  { path: '/auth', router: authRoutes },
  { path: '/users', router: userRoutes },
  { path: '/etablissements', router: etablissementRoutes },
  { path: '/classes', router: classeRoutes },
  { path: '/matieres', router: matiereRoutes },
  { path: '/enseignants', router: enseignantRoutes },
  { path: '/salles', router: salleRoutes },
  { path: '/cours', router: coursRoutes },
  { path: '/emplois-temps', router: emploiTempsRoutes },
  { path: '/rattrapages', router: rattrapageRoutes },
  { path: '/absences', router: absenceRoutes },
  { path: '/teacher/absences', router: teacherAbsenceRoutes },
  { path: '/statistiques', router: statistiqueRoutes },
  { path: '/notifications', router: notificationRoutes },
  { path: '/eleves', router: eleveRoutes },
  { path: '/directeurs', router: directeurRoutes },
  { path: '/responsables-pedagogiques', router: rpRoutes },
  { path: '/periodes', router: periodeRoutes },
  { path: '/evaluations', router: evaluationRoutes },
  { path: '/subscriptions', router: subscriptionRoutes },
  { path: '/invoices', router: invoiceRoutes },
  { path: '/pricing', router: pricingRoutes },
  { path: '/payments', router: paymentRoutes },
  { path: '/notes', router: noteRoutes },
  { path: '/bulletins', router: bulletinRoutes },
  { path: '/ressources', router: ressourceRoutes },
  { path: '/seances-virtuelles', router: seanceVirtuelleRoutes },
  { path: '/examens', router: examenRoutes },
  { path: '/sessions-examen', router: sessionExamenRoutes },
  { path: '/repartitions', router: repartitionRoutes },
  { path: '/accreditations', router: accreditationRoutes },
  { path: '/chat', router: chatRoutes }

];

routesMapping.forEach(route => {
  app.use(`/api${route.path}`, route.router);
  app.use(route.path, route.router);
});

// Routes système
app.get('/api/health', async (req, res) => {
  let dbStatus = 'Unknown';
  try {
    const { sequelize } = require('./config/database');
    await sequelize.authenticate();
    dbStatus = 'Connected';
  } catch (e) {
    dbStatus = 'Error: ' + e.message;
  }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.6-Diagnostic',
    database: dbStatus,
    service: 'EDT Generator API'
  });
});


app.get('/api', (req, res) => {
  res.json({
    message: 'API EDT Generator - Système de gestion des emplois du temps',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      etablissements: '/api/etablissements',
      classes: '/api/classes',
      matieres: '/api/matieres',
      enseignants: '/api/enseignants',
      salles: '/api/salles',
      cours: '/api/cours',
      emplois_temps: '/api/emplois-temps',
      rattrapages: '/api/rattrapages',
      absences: '/api/absences',
      statistiques: '/api/statistiques',
      notifications: '/api/notifications'
    },
    documentation: '/api/docs'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Backend EDT Generator est en ligne',
    requested_url: req.originalUrl,
    mode: process.env.NODE_ENV
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/health',
      '/api/etablissements',
      '/api/classes',
      '/api/emplois-temps'
    ]
  });
});

// Middleware de gestion d'erreurs global
app.use((error, req, res, next) => {
  console.error('Erreur globale:', error);

  // Erreur de validation Sequelize
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Données invalides',
      details: error.errors.map(err => ({
        champ: err.path,
        message: err.message
      }))
    });
  }

  // Erreur de contrainte unique
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Conflit de données',
      details: 'Une ressource avec ces données existe déjà'
    });
  }

  // Erreur JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token invalide' });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expiré' });
  }

  // Erreur par défaut
  const status = error.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Erreur interne du serveur'
    : error.message;

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.details
    })
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test de la connexion à la base de données
    const { testConnection } = require('./config/database');
    await testConnection();

    // Configuration Socket.io
    const http = require('http');
    const { Server } = require("socket.io");
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:1102',
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    ioInstance = io;

    // Presence Tracking
    const onlineUsers = new Map(); // userId -> socketIds Set
    const socketToUser = new Map(); // socketId -> userId

    io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Rejoindre la room globale de l'utilisateur (pour notifs privées)
      socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);

        // Presence Logic
        if (!onlineUsers.has(userId)) {
          onlineUsers.set(userId, new Set());
          // Broadcast status change only if this is the first connection for this user
          io.emit('user_status_change', { userId, status: 'online' });
          console.log(`User ${userId} is now ONLINE`);
        }
        onlineUsers.get(userId).add(socket.id);
        socketToUser.set(socket.id, userId);

        console.log(`User ${userId} joined their personal room (Socket: ${socket.id})`);
      });

      // Request initial online users list
      socket.on('get_online_users', () => {
        const users = Array.from(onlineUsers.keys());
        socket.emit('online_users_list', users);
      });

      // Rejoindre une conversation spécifique
      socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
      });

      // Quitter une conversation
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
      });

      // Typing indicators - Broadcast to conversation room AND participants' user rooms (for sidebar)
      socket.on('typing', async (data) => {
        // data: { conversationId, userId, isTyping, userName }
        socket.to(`conversation_${data.conversationId}`).emit('user_typing', data);

        try {
          // Lazy require to avoid potential circular dependency issues
          const { ConversationParticipant } = require('./database/models');
          const participants = await ConversationParticipant.findAll({
            where: { conversation_id: data.conversationId },
            attributes: ['utilisateur_id']
          });

          participants.forEach(p => {
            if (p.utilisateur_id !== data.userId) {
              io.to(`user_${p.utilisateur_id}`).emit('user_typing_sidebar', data);
            }
          });
        } catch (error) {
          console.error('Error during typing broadcast:', error);
        }
      });

      socket.on('disconnect', () => {
        const userId = socketToUser.get(socket.id);
        if (userId && onlineUsers.has(userId)) {
          const sockets = onlineUsers.get(userId);
          sockets.delete(socket.id);
          socketToUser.delete(socket.id);

          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            // Broadcast offline status
            io.emit('user_status_change', { userId, status: 'offline' });
            console.log(`User ${userId} is now OFFLINE`);
          }
        }
        console.log("User Disconnected", socket.id);
      });
    });

    // Synchronisation des modèles désactivée temporairement pour éviter l'erreur de limite d'index MySQL
    const { sequelize } = require('./config/database');
    // await sequelize.sync({ force: false });
    console.log('✅ Base de données prête (sync sautée)');

    // Gestion robuste des erreurs de port
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`❌ Le port ${PORT} est déjà utilisé.`);
        console.log(`💡 Tentative de libération du port ${PORT}...`);

        const { exec } = require('child_process');
        const command = process.platform === 'win32'
          ? `powershell -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force"`
          : `npx kill-port ${PORT}`;

        exec(command, (err) => {
          if (err) {
            console.error(`❌ Impossible de libérer le port ${PORT}. Fermez le processus manuellement.`);
            process.exit(1);
          } else {
            console.log(`✅ Port ${PORT} libéré. Redémarrage dans 2 secondes...`);
            setTimeout(() => {
              server.listen(PORT, () => {
                console.log(`🚀 Serveur redémarré sur le port ${PORT}`);
              });
            }, 2000);
          }
        });
      } else {
        console.error('❌ Erreur serveur:', e);
      }
    });

    server.listen(PORT, () => {
      console.log('🚀 Serveur EDT Generator démarré avec succès!');
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`📚 API: http://localhost:${PORT}/api`);
      console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
      console.log('\n📋 Endpoints disponibles:');
      console.log('   POST /api/auth/login');
      console.log('   POST /api/auth/register');
      console.log('   GET  /api/etablissements');
      console.log('   GET  /api/classes');
      console.log(`POST /api/emplois-temps/generer`);

      // Démarrer le scheduler de tâches automatisées
      const schedulerService = require('./services/scheduler.service');
      schedulerService.start();
    });
  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
};

startServer();
// routes/statistiques.js
const express = require('express');
const router = express.Router();
const statistiqueController = require('../controllers/statistique.controller');
const { authenticateToken, requireRole, logAccess } = require('../middleware/auth');
const { queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('statistiques'));

// Routes accessibles aux administrateurs, directeurs, responsables pédagogiques et enseignants
const rolesAutorises = [
  RoleUtilisateur.ADMIN,
  RoleUtilisateur.DIRECTEUR,
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE,
  RoleUtilisateur.ENSEIGNANT
];

router.get('/general',
  requireRole(rolesAutorises),
  statistiqueController.getStatistiquesGenerales
);

router.get('/periodic',
  requireRole(rolesAutorises),
  queryValidation.dateRange,
  handleValidationErrors,
  statistiqueController.getStatistiquesPeriodiques
);

router.get('/classes',
  requireRole(rolesAutorises),
  statistiqueController.getStatistiquesParClasse
);

router.get('/enseignants',
  requireRole(rolesAutorises),
  statistiqueController.getStatistiquesEnseignants
);

router.get('/dashboard',
  statistiqueController.getTableauDeBord
);

module.exports = router;
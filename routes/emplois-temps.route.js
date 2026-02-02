// routes/emplois-temps.js
const express = require('express');
const router = express.Router();
const emploiTempsController = require('../controllers/emploiTemps.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { emploiTempsValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('emplois_temps'));

// Export - doit être AVANT les routes avec paramètres :id
router.get('/export/pdf',
  emploiTempsController.exportPDF
);

// Roles autorisés pour la gestion
const rolesAutorises = [
  RoleUtilisateur.ADMIN,
  RoleUtilisateur.DIRECTEUR,
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
];

// Routes publiques (pour utilisateurs authentifiés)
router.get('/me',
  emploiTempsController.getMonEmploiTemps
);

router.get('/classe/:classeId',
  emploiTempsController.getEmploiTempsParClasse
);

router.get('/enseignant/:enseignantId',
  emploiTempsController.getEmploiTempsParEnseignant
);

// Routes administratives
router.get('/',
  requireRole(rolesAutorises),
  queryValidation.pagination,
  handleValidationErrors,
  emploiTempsController.getAllEmploisTemps
);

router.post('/generer',
  requireRole(rolesAutorises),
  emploiTempsValidation.generer,
  handleValidationErrors,
  emploiTempsController.genererEmploiTemps
);

router.get('/:id',
  emploiTempsController.getEmploiTempsById
);

router.get('/:id/status',
  emploiTempsController.getEmploiTempsStatus
);

router.get('/:id/stats',
  emploiTempsController.getEmploiTempsStats
);

router.post('/:id/validate',
  requireRole(rolesAutorises),
  emploiTempsController.validerEmploiTemps
);

router.post('/:id/publish',
  requireRole(rolesAutorises),
  emploiTempsController.publierEmploiTemps
);

router.post('/:id/archive',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsController.archiverEmploiTemps
);

router.delete('/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsController.deleteEmploiTemps
);

router.post('/:id/duplicate',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsController.dupliquerEmploiTemps
);

// Gestion des séances
router.post('/seances',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsValidation.seance,
  handleValidationErrors,
  emploiTempsController.createSeance
);

router.put('/seances/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsValidation.seance,
  handleValidationErrors,
  emploiTempsController.updateSeance
);

router.delete('/seances/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsController.deleteSeance
);

router.put('/seances/:id/annuler',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  emploiTempsValidation.annulation,
  handleValidationErrors,
  emploiTempsController.annulerSeance
);



module.exports = router;
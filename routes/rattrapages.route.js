// routes/rattrapages.js
const express = require('express');
const router = express.Router();
const rattrapageController = require('../controllers/rattrapage.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { rattrapageValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('rattrapages'));

// Routes accessibles aux administrateurs, directeurs, responsables pédagogiques et enseignants
const rolesAutorises = [
  RoleUtilisateur.ADMIN,
  RoleUtilisateur.DIRECTEUR,
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE,
  RoleUtilisateur.ENSEIGNANT
];

router.get('/',
  requireRole(rolesAutorises),
  queryValidation.pagination,
  handleValidationErrors,
  rattrapageController.getAllRattrapages
);

router.post('/',
  requireRole(rolesAutorises),
  rattrapageValidation.create,
  handleValidationErrors,
  rattrapageController.createRattrapage
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id',
  rattrapageController.getRattrapageById
);

// Routes accessibles aux rôles autorisés seulement
router.post('/:id/schedule',
  requireRole(rolesAutorises),
  rattrapageValidation.planifier,
  handleValidationErrors,
  rattrapageController.planifierRattrapage
);

router.post('/:id/complete',
  requireRole(rolesAutorises),
  rattrapageController.marquerRealise
);

router.post('/:id/validate',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
  rattrapageController.validerRattrapage
);

router.post('/:id/reject',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
  rattrapageController.rejeterRattrapage
);

router.post('/:id/cancel',
  requireRole(rolesAutorises),
  rattrapageController.annulerRattrapage
);

// Routes statistiques
router.get('/stats/urgent',
  requireRole(rolesAutorises),
  rattrapageController.getRattrapagesUrgents
);

router.get('/stats/overview',
  requireRole(rolesAutorises),
  rattrapageController.getRattrapageStats
);

module.exports = router;
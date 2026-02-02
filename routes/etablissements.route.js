// routes/etablissements.js
const express = require('express');
const router = express.Router();
const etablissementController = require('../controllers/etablissement.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { etablissementValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('etablissements'));

// Routes accessibles aux administrateurs seulement
router.get('/', 
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]), 
  queryValidation.pagination,
  handleValidationErrors,
  etablissementController.getAllEtablissements
);

router.post('/', 
  requireRole([RoleUtilisateur.ADMIN]),
  requireEtablissementAccessCode,
  etablissementValidation.create,
  handleValidationErrors,
  etablissementController.createEtablissement
);

// Routes accessibles aux administrateurs et directeurs
router.get('/:id', 
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]), 
  etablissementValidation.idParam,
  handleValidationErrors,
  etablissementController.getEtablissementById
);

router.put('/:id', 
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
  requireEtablissementAccessCode,
  etablissementValidation.update,
  handleValidationErrors,
  etablissementController.updateEtablissement
);

router.get('/:id/stats', 
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]), 
  etablissementValidation.idParam,
  handleValidationErrors,
  etablissementController.getEtablissementStats
);

router.post('/:id/generate-access-code', 
  requireRole([RoleUtilisateur.ADMIN]),
  requireEtablissementAccessCode,
  etablissementValidation.idParam,
  handleValidationErrors,
  etablissementController.generateNewAccessCode
);

module.exports = router;
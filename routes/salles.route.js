// routes/salles.js
const express = require('express');
const router = express.Router();
const salleController = require('../controllers/salle.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { salleValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('salles'));

// Routes accessibles aux administrateurs, directeurs et responsables pédagogiques
const rolesAutorises = [
  RoleUtilisateur.ADMIN, 
  RoleUtilisateur.DIRECTEUR, 
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
];

router.get('/', 
  requireRole(rolesAutorises), 
  queryValidation.pagination,
  handleValidationErrors,
  salleController.getAllSalles
);

router.post('/', 
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  salleValidation.create,
  handleValidationErrors,
  salleController.createSalle
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id', 
  salleController.getSalleById
);

router.get('/:id/stats', 
  salleController.getSalleStats
);

router.post('/:id/check-availability', 
  salleController.checkDisponibilite
);

// Routes accessibles aux rôles autorisés seulement
router.put('/:id', 
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  salleValidation.update,
  handleValidationErrors,
  salleController.updateSalle
);

router.post('/:id/maintenance', 
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  salleController.setMaintenance
);

router.post('/:id/available', 
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  salleController.setDisponible
);

module.exports = router;
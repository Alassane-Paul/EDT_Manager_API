// routes/classes.js
const express = require('express');
const router = express.Router();
const classeController = require('../controllers/classe.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { classeValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('classes'));

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
  classeController.getAllClasses
);

router.post('/',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  classeValidation.create,
  handleValidationErrors,
  classeController.createClasse
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id',
  classeController.getClasseById
);

router.get('/:id/stats',
  classeController.getClasseStats
);

// Routes accessibles aux rôles autorisés seulement
router.put('/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  classeValidation.update,
  handleValidationErrors,
  classeController.updateClasse
);

router.post('/:id/archive',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  classeValidation.idParam,
  handleValidationErrors,
  classeController.archiveClasse
);

router.post('/:id/activate',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  classeValidation.idParam,
  handleValidationErrors,
  classeController.activateClasse
);

router.post('/:id/students',
  requireRole(rolesAutorises),
  classeController.assignStudent
);

router.delete('/:id/students/:studentId',
  requireRole(rolesAutorises),
  classeController.removeStudent
);

module.exports = router;
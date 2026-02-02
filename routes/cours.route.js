// routes/cours.js
const express = require('express');
const router = express.Router();
const coursController = require('../controllers/cours.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('cours'));

// Routes accessibles aux administrateurs, directeurs et responsables pédagogiques
const rolesAutorises = [
  RoleUtilisateur.ADMIN,
  RoleUtilisateur.DIRECTEUR,
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
];

// Route pour les enseignants - Mes cours
router.get('/me',
  requireRole([...rolesAutorises, RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ETUDIANT]),
  coursController.getMesCours
);

router.get('/',
  requireRole(rolesAutorises),
  queryValidation.pagination,
  handleValidationErrors,
  coursController.getAllCours
);

router.post('/',
  requireRole(rolesAutorises),
  coursController.createCours
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id',
  coursController.getCoursById
);

router.get('/:id/slots',
  coursController.getCreneaux
);

router.get('/:id/stats',
  coursController.getCoursStats
);

// Routes accessibles aux rôles autorisés seulement
router.put('/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  coursController.updateCours
);

router.delete('/:id',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  coursController.deleteCours
);

module.exports = router;
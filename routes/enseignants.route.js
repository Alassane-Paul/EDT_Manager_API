// routes/enseignants.js
const express = require('express');
const router = express.Router();
const enseignantController = require('../controllers/enseignant.controller');
const { authenticateToken, requireRole, requireRoleOrSelfEnseignant, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { enseignantValidation, queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('enseignants'));

// Routes accessibles aux administrateurs, directeurs et responsables pédagogiques
const rolesGestion = [
  RoleUtilisateur.ADMIN, 
  RoleUtilisateur.DIRECTEUR, 
  RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
];

const rolesLectureEtablissement = [
  ...rolesGestion,
  RoleUtilisateur.PERSONNEL
];

router.get('/', 
  requireRole(rolesLectureEtablissement), 
  queryValidation.pagination,
  handleValidationErrors,
  enseignantController.getAllEnseignants
);

router.post('/', 
  requireRole(rolesGestion),
  requireEtablissementAccessCode,
  enseignantValidation.create,
  handleValidationErrors,
  enseignantController.createEnseignant
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id', 
  requireRoleOrSelfEnseignant(rolesLectureEtablissement),
  enseignantController.getEnseignantById
);

router.get('/:id/schedule', 
  requireRoleOrSelfEnseignant(rolesLectureEtablissement),
  enseignantController.getEmploiTemps
);

router.get('/:id/stats', 
  requireRoleOrSelfEnseignant(rolesLectureEtablissement),
  enseignantController.getEnseignantStats
);

// Routes de gestion des disponibilités
router.get('/:id/disponibilites',
  requireRoleOrSelfEnseignant(rolesLectureEtablissement),
  enseignantController.getDisponibilites
);

router.post('/:id/disponibilites',
  requireRoleOrSelfEnseignant(rolesGestion),
  requireEtablissementAccessCode,
  enseignantController.createDisponibilite
);

router.delete('/:id/disponibilites/:disponibiliteId',
  requireRoleOrSelfEnseignant(rolesGestion),
  requireEtablissementAccessCode,
  enseignantController.deleteDisponibilite
);


// Routes accessibles aux rôles autorisés seulement
router.put('/:id', 
  requireRole(rolesGestion),
  requireEtablissementAccessCode,
  enseignantValidation.update,
  handleValidationErrors,
  enseignantController.updateEnseignant
);

router.post('/:id/assign-subjects', 
  requireRole(rolesGestion),
  requireEtablissementAccessCode,
  enseignantController.assignMatieres
);

module.exports = router;
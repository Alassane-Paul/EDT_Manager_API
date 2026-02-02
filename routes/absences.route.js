// routes/absences.js
const express = require('express');
const router = express.Router();
const absenceController = require('../controllers/absence.controller');
const { authenticateToken, requireRole, requireRoleOrSelfEnseignant, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);
router.use(logAccess('absences'));

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
  absenceController.getAllAbsences
);

router.get('/me',
  requireRole([RoleUtilisateur.ETUDIANT]),
  absenceController.getMesAbsencesEtudiant
);

router.post('/',
  requireRole(rolesAutorises),
  requireEtablissementAccessCode,
  absenceController.declarerAbsence
);

router.post('/bulk',
  requireRole(rolesAutorises),
  absenceController.declarerAbsencesEleves
);

// Routes accessibles à tous les utilisateurs authentifiés de l'établissement
router.get('/:id',
  requireRoleOrSelfEnseignant(rolesAutorises),
  absenceController.getAbsenceById
);

// Routes accessibles aux rôles autorisés seulement
router.post('/:id/validate',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
  requireEtablissementAccessCode,
  absenceController.validerAbsence
);

router.post('/:id/refuse',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
  requireEtablissementAccessCode,
  absenceController.refuserAbsence
);

// Routes statistiques
router.get('/stats/current',
  requireRole(rolesAutorises),
  absenceController.getAbsencesEnCours
);

router.get('/stats/overview',
  requireRole(rolesAutorises),
  absenceController.getAbsenceStats
);

module.exports = router;
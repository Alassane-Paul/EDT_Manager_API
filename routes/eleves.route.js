// routes/eleves.js
const express = require('express');
const router = express.Router();
const eleveController = require('../controllers/eleve.controller');
const { authenticateToken, requireRole, logAccess } = require('../middleware/auth');
const { eleveValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);
router.use(logAccess('eleves'));

const rolesGestion = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE];
const rolesLecture = [...rolesGestion, RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.PERSONNEL];

router.get('/', requireRole(rolesLecture), eleveController.getAllEleves);
router.post('/', requireRole(rolesGestion), eleveValidation.create, handleValidationErrors, eleveController.createEleve);
router.put('/:id', requireRole(rolesGestion), eleveValidation.update, handleValidationErrors, eleveController.updateEleve);
router.delete('/:id', requireRole(rolesGestion), eleveController.deleteEleve);

module.exports = router;

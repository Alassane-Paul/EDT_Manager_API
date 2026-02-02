// routes/responsables.js
const express = require('express');
const router = express.Router();
const rpController = require('../controllers/rp.controller');
const { authenticateToken, requireRole, logAccess } = require('../middleware/auth');
const { rpValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);
router.use(logAccess('responsables_pedagogiques'));

const rolesGestion = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR];
const rolesLecture = [...rolesGestion, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE];

router.get('/', requireRole(rolesLecture), rpController.getAllRPs);
router.post('/', requireRole(rolesGestion), rpValidation.create, handleValidationErrors, rpController.createRP);
router.put('/:id', requireRole(rolesGestion), rpValidation.update, handleValidationErrors, rpController.updateRP);
router.delete('/:id', requireRole(rolesGestion), rpController.deleteRP);

module.exports = router;

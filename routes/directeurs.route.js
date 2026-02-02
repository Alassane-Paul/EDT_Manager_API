// routes/directeurs.js
const express = require('express');
const router = express.Router();
const directeurController = require('../controllers/directeur.controller');
const { authenticateToken, requireRole, logAccess } = require('../middleware/auth');
const { directeurValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);
router.use(logAccess('directeurs'));

const rolesAdmin = [RoleUtilisateur.ADMIN];
const rolesGestion = [RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR];

router.get('/', requireRole(rolesGestion), directeurController.getAllDirecteurs);
router.post('/', requireRole(rolesAdmin), directeurValidation.create, handleValidationErrors, directeurController.createDirecteur);
router.put('/:id', requireRole(rolesAdmin), directeurValidation.update, handleValidationErrors, directeurController.updateDirecteur);
router.delete('/:id', requireRole(rolesAdmin), directeurController.deleteDirecteur);

module.exports = router;

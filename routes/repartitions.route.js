const express = require('express');
const router = express.Router();
const repartitionController = require('../controllers/repartition.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.post('/auto-assign/:sessionId',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
    repartitionController.autoAssign
);

router.get('/session/:sessionId', repartitionController.getRepartition);

router.put('/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE]),
    repartitionController.updateRepartition
);

module.exports = router;

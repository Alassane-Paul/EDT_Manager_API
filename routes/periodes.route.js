const express = require('express');
const router = express.Router();
const periodeController = require('../controllers/periode.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.get('/', periodeController.getAllPeriodes);

router.post('/',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    periodeController.createPeriode
);

router.put('/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    periodeController.updatePeriode
);

router.delete('/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    periodeController.deletePeriode
);

module.exports = router;

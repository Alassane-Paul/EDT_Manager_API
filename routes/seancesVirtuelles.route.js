const express = require('express');
const router = express.Router();
const seanceVirtuelleController = require('../controllers/seanceVirtuelle.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.get('/cours/:cours_id', seanceVirtuelleController.getSeancesByCours);

router.post('/',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    seanceVirtuelleController.createSeance
);

router.delete('/:id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    seanceVirtuelleController.deleteSeance
);

module.exports = router;

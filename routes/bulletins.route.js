const express = require('express');
const router = express.Router();
const bulletinController = require('../controllers/bulletin.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.post('/generer',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR, RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE, RoleUtilisateur.ENSEIGNANT]), // Enseignant peut générer pour sa classe princ? 
    bulletinController.generateBulletin
);

router.get('/', bulletinController.getBulletin);

module.exports = router;

const express = require('express');
const router = express.Router();
const ressourceController = require('../controllers/ressource.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.get('/cours/:cours_id', ressourceController.getRessourcesByCours);

router.post('/',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    upload.single('fichier'), // Expect form-data with 'fichier'
    ressourceController.addRessource
);

router.delete('/:id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    ressourceController.deleteRessource
);

module.exports = router;

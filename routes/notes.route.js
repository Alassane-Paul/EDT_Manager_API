const express = require('express');
const router = express.Router();
const noteController = require('../controllers/note.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

// Récupérer les notes d'une évaluation (prof/admin)
router.get('/evaluation/:evaluation_id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    noteController.getNotesByEvaluation
);

// Mettre à jour les notes en masse (prof/admin)
router.post('/bulk/:evaluation_id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    noteController.bulkUpdateNotes
);

// Notes de l'élève (élève/parent)
router.get('/eleve/:eleve_id?', noteController.getStudentGrades);

module.exports = router;

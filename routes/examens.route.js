const express = require('express');
const router = express.Router();
const examenController = require('../controllers/examen.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

// Routes enseignants
router.get('/cours/:cours_id', examenController.getExamensByCours);

router.post('/',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    examenController.createExamen
);

router.post('/:examen_id/questions',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    examenController.addQuestion
);

router.put('/:id/publish',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    examenController.publishExamen
);

// Routes étudiants
router.post('/:examen_id/start',
    requireRole([RoleUtilisateur.ETUDIANT, RoleUtilisateur.ADMIN]),
    examenController.startTentative
);

router.post('/tentatives/:tentative_id/submit',
    requireRole([RoleUtilisateur.ETUDIANT, RoleUtilisateur.ADMIN]),
    examenController.submitReponses
);

router.get('/tentatives/:tentative_id/resultats', examenController.getResultats);

module.exports = router;

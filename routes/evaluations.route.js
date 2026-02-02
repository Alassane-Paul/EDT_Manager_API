const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluation.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

router.use(authenticateToken);

router.get('/', evaluationController.getAllEvaluations);

router.post('/',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    evaluationController.createEvaluation
);

router.put('/:id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    evaluationController.updateEvaluation
);

router.delete('/:id',
    requireRole([RoleUtilisateur.ENSEIGNANT, RoleUtilisateur.ADMIN]),
    evaluationController.deleteEvaluation
);

module.exports = router;

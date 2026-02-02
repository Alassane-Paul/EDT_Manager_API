// routes/teacherAbsences.js
const express = require('express');
const router = express.Router();
const teacherAbsenceController = require('../controllers/teacherAbsence.controller');
const { authenticateToken, requireRoleOrSelfEnseignant } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

// All teacher‑absence routes require authentication and teacher role
router.use(authenticateToken);
router.use(requireRoleOrSelfEnseignant([RoleUtilisateur.ENSEIGNANT]));

// Get all absences for the logged‑in teacher
router.get('/', teacherAbsenceController.getMyAbsences);

// Declare a new absence for the logged‑in teacher
router.post('/', teacherAbsenceController.declarerMyAbsence);

module.exports = router;

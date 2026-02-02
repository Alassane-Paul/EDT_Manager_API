const express = require('express');
const router = express.Router();
const accreditationController = require('../controllers/accreditation.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

/**
 * @route   POST /api/accreditations
 * @desc    Créer une accréditation (Directeur uniquement)
 */
router.post(
    '/',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    accreditationController.create
);

/**
 * @route   GET /api/accreditations
 * @desc    Lister les accréditations de l'établissement
 */
router.get(
    '/',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    accreditationController.listByEtablissement
);

/**
 * @route   DELETE /api/accreditations/:id
 * @desc    Révoquer une accréditation
 */
router.delete(
    '/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    accreditationController.delete
);

/**
 * @route   GET /api/accreditations/check/:module
 * @desc    Vérifier si l'utilisateur actuel est accrédité pour un module
 */
router.get(
    '/check/:module',
    accreditationController.checkMyAccreditation
);

/**
 * @route   GET /api/accreditations/me/active
 * @desc    Récupérer mes accréditations actives
 */
router.get(
    '/me/active',
    accreditationController.getMyActiveAccreditations
);

module.exports = router;

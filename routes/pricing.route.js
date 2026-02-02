const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricing.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');
const { body } = require('express-validator');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

/**
 * @route   GET /api/pricing/rules
 * @desc    Obtenir toutes les règles de tarification
 * @access  Admin
 */
router.get(
    '/rules',
    requireRole([RoleUtilisateur.ADMIN]),
    pricingController.getPricingRules
);

/**
 * @route   POST /api/pricing/rules
 * @desc    Créer une nouvelle règle de tarification
 * @access  Admin
 */
router.post(
    '/rules',
    requireRole([RoleUtilisateur.ADMIN]),
    [
        body('nom').notEmpty().withMessage('Nom requis'),
        body('type_metrique').isIn(['user', 'class', 'course', 'storage', 'timetable']).withMessage('Type de métrique invalide'),
        body('prix_unitaire').isFloat({ min: 0 }).withMessage('Prix unitaire invalide'),
        body('seuil_min').optional().isInt({ min: 0 }).withMessage('Seuil min invalide'),
        body('seuil_max').optional().isInt({ min: 0 }).withMessage('Seuil max invalide')
    ],
    pricingController.createPricingRule
);

/**
 * @route   PUT /api/pricing/rules/:id
 * @desc    Mettre à jour une règle de tarification
 * @access  Admin
 */
router.put(
    '/rules/:id',
    requireRole([RoleUtilisateur.ADMIN]),
    pricingController.updatePricingRule
);

/**
 * @route   DELETE /api/pricing/rules/:id
 * @desc    Supprimer une règle de tarification
 * @access  Admin
 */
router.delete(
    '/rules/:id',
    requireRole([RoleUtilisateur.ADMIN]),
    pricingController.deletePricingRule
);

/**
 * @route   GET /api/pricing/estimate
 * @desc    Calculer une estimation de coût
 * @access  Directeur, Admin
 */
router.get(
    '/estimate',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    pricingController.calculateEstimate
);

/**
 * @route   GET /api/pricing/plans
 * @desc    Obtenir les plans disponibles
 * @access  Tous les utilisateurs authentifiés
 */
router.get(
    '/plans',
    pricingController.getPlans
);

module.exports = router;

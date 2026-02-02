const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');
const { body } = require('express-validator');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

/**
 * @route   GET /api/subscriptions/usage/stats
 * @desc    Obtenir les statistiques d'utilisation
 * @access  Directeur, Admin
 */
router.get(
    '/usage/stats',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    subscriptionController.getUsageStats
);

/**
 * @route   GET /api/subscriptions
 * @desc    Obtenir l'abonnement actuel de l'établissement
 * @access  Directeur, Admin
 */
router.get(
    '/',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    subscriptionController.getSubscription
);

/**
 * @route   POST /api/subscriptions
 * @desc    Créer un nouvel abonnement
 * @access  Admin
 */
router.post(
    '/',
    requireRole([RoleUtilisateur.ADMIN]),
    [
        body('etablissement_id').isUUID().withMessage('ID établissement invalide'),
        body('plan_type').isIn(['trial', 'basic', 'premium', 'enterprise']).withMessage('Type de plan invalide'),
        body('date_debut').optional().isISO8601().withMessage('Date de début invalide')
    ],
    subscriptionController.createSubscription
);

/**
 * @route   PUT /api/subscriptions/:id
 * @desc    Mettre à jour un abonnement (upgrade/downgrade)
 * @access  Admin, Directeur
 */
router.put(
    '/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    [
        body('plan_type').isIn(['trial', 'basic', 'premium', 'enterprise']).withMessage('Type de plan invalide')
    ],
    subscriptionController.updateSubscription
);

/**
 * @route   DELETE /api/subscriptions/:id
 * @desc    Annuler un abonnement
 * @access  Admin, Directeur
 */
router.delete(
    '/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    subscriptionController.cancelSubscription
);

module.exports = router;

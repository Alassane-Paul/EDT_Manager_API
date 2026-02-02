const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');

/**
 * @route   POST /api/payments/initiate
 * @desc    Initier une transaction FedaPay pour une facture
 * @access  Directeur, Admin
 */
router.post(
    '/initiate',
    authenticateToken,
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    paymentController.initiatePayment
);

/**
 * @route   POST /api/payments/subscribe
 * @desc    Initier une transaction FedaPay pour un abonnement
 * @access  Directeur, Admin
 */
router.post(
    '/subscribe',
    authenticateToken,
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    paymentController.initiateSubscription
);

/**
 * @route   POST /api/payments/process
 * @desc    Traiter un paiement direct (Mobile Money ou Carte)
 * @access  Directeur, Admin
 */
router.post(
    '/process',
    authenticateToken,
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    paymentController.processPayment
);

/**
 * @route   GET /api/payments/verify/:transactionId
 * @desc    Vérifier manuellement le statut d'une transaction
 * @access  Directeur, Admin
 */
router.get(
    '/verify/:transactionId',
    authenticateToken,
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    paymentController.verifyPayment
);

/**
 * @route   POST /api/payments/webhook
 * @desc    Réception des webhooks FedaPay
 * @access  Public
 */
router.post(
    '/webhook',
    paymentController.handleWebhook
);

module.exports = router;

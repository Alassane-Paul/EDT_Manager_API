const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice.controller');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { RoleUtilisateur } = require('../utils/enums');
const { body } = require('express-validator');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

/**
 * @route   GET /api/invoices
 * @desc    Obtenir toutes les factures de l'établissement
 * @access  Directeur, Admin
 */
router.get(
    '/',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    invoiceController.getAllInvoices
);

/**
 * @route   GET /api/invoices/summary
 * @desc    Obtenir le résumé des factures
 * @access  Directeur, Admin
 */
router.get(
    '/summary',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    invoiceController.getInvoiceSummary
);

/**
 * @route   GET /api/invoices/:id
 * @desc    Obtenir une facture par ID
 * @access  Directeur, Admin
 */
router.get(
    '/:id',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    invoiceController.getInvoiceById
);

/**
 * @route   POST /api/invoices/generate
 * @desc    Générer une facture manuellement
 * @access  Admin
 */
router.post(
    '/generate',
    requireRole([RoleUtilisateur.ADMIN]),
    [
        body('etablissement_id').isUUID().withMessage('ID établissement invalide'),
        body('periode_debut').isISO8601().withMessage('Date de début invalide'),
        body('periode_fin').isISO8601().withMessage('Date de fin invalide')
    ],
    invoiceController.generateInvoice
);

/**
 * @route   PUT /api/invoices/:id/pay
 * @desc    Marquer une facture comme payée
 * @access  Admin, Directeur
 */
router.put(
    '/:id/pay',
    requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
    [
        body('mode_paiement').optional().isString().withMessage('Mode de paiement invalide'),
        body('reference').optional().isString().withMessage('Référence invalide')
    ],
    invoiceController.markAsPaid
);

module.exports = router;

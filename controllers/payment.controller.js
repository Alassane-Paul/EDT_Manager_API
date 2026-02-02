const paymentService = require('../services/payment.service');
const { validationResult } = require('express-validator');
const { Invoice } = require('../database/models');

/**
 * Contrôleur pour la gestion des paiements FedaPay
 */
const paymentController = {
    /**
     * Initie une transaction de paiement pour une facture
     */
    initiatePayment: async (req, res) => {
        try {
            const { invoiceId } = req.body;

            if (!invoiceId) {
                return res.status(400).json({
                    error: 'L\'ID de la facture est requis',
                    code: 'INVOICE_ID_REQUIRED'
                });
            }

            // Vérifier que la facture appartient à l'établissement de l'utilisateur
            const invoice = await Invoice.findByPk(invoiceId);
            if (!invoice) {
                return res.status(404).json({
                    error: 'Facture introuvable',
                    code: 'INVOICE_NOT_FOUND'
                });
            }

            if (invoice.etablissement_id !== req.utilisateur.etablissement_id && req.utilisateur.role !== 'admin') {
                return res.status(403).json({
                    error: 'Vous n\'avez pas l\'autorisation de payer cette facture',
                    code: 'UNAUTHORIZED_PAYMENT'
                });
            }

            const transactionData = await paymentService.createTransaction(invoiceId);

            res.json({
                success: true,
                ...transactionData
            });
        } catch (error) {
            console.error('Erreur initiant le paiement:', error);
            res.status(500).json({
                error: error.message || 'Erreur lors de l\'initialisation du paiement',
                code: 'PAYMENT_INIT_ERROR'
            });
        }
    },

    /**
     * Initie une transaction pour un abonnement à un plan
     */
    initiateSubscription: async (req, res) => {
        try {
            const { planType } = req.body;
            const etablissementId = req.utilisateur.etablissement_id;

            if (!planType) {
                return res.status(400).json({
                    error: 'Le type de plan est requis',
                    code: 'PLAN_TYPE_REQUIRED'
                });
            }

            const transactionData = await paymentService.createSubscriptionTransaction(planType, etablissementId);

            res.json({
                success: true,
                ...transactionData
            });
        } catch (error) {
            console.error('Erreur initiant l\'abonnement:', error.message);
            res.status(500).json({
                error: error.message || 'Erreur lors de l\'initialisation de l\'abonnement',
                fedapay_error: error.response ? error.response.data : (error.errors || null),
                details: error.stack,
                code: 'SUBSCRIPTION_INIT_ERROR'
            });
        }
    },

    /**
     * Traite un paiement direct (Mobile Money ou Carte)
     */
    processPayment: async (req, res) => {
        try {
            const { transactionId, mode, phoneNumber, country } = req.body;

            if (!transactionId || !mode) {
                return res.status(400).json({
                    error: 'Paramètres manquants (transactionId, mode)',
                    code: 'MISSING_PARAMETERS'
                });
            }

            const result = await paymentService.processDirectPayment(transactionId, mode, phoneNumber, country);

            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('Erreur traitant le paiement direct:', error);
            res.status(500).json({
                error: error.message || 'Erreur lors du traitement du paiement',
                fedapay_error: error.response ? error.response.data : (error.errors || null),
                details: error.stack,
                code: 'PAYMENT_PROCESS_ERROR'
            });
        }
    },

    /**
     * Vérifie manuellement le statut d'une transaction
     */
    verifyPayment: async (req, res) => {
        try {
            const { transactionId } = req.params;

            if (!transactionId) {
                return res.status(400).json({
                    error: 'L\'ID de transaction est requis',
                    code: 'TRANSACTION_ID_REQUIRED'
                });
            }

            const transaction = await paymentService.verifyTransaction(transactionId);

            res.json({
                success: true,
                status: transaction.status,
                transaction
            });
        } catch (error) {
            console.error('Erreur vérifiant le paiement:', error);
            res.status(500).json({
                error: error.message || 'Erreur lors de la vérification du paiement',
                details: error.stack,
                code: 'PAYMENT_VERIFY_ERROR'
            });
        }
    },

    /**
     * Gère les notifications webhook de FedaPay
     */
    handleWebhook: async (req, res) => {
        try {
            const event = req.body;
            console.log('[FedaPay Webhook] Événement reçu:', event.name);

            // FedaPay envoie des événements comme 'transaction.approved'
            if (event.name === 'transaction.approved') {
                const transaction = event.data;
                await paymentService.verifyTransaction(transaction.id);
            }

            res.status(200).send('Webhook processed');
        } catch (error) {
            console.error('Erreur webhook FedaPay:', error);
            res.status(500).send('Webhook error');
        }
    }
};

module.exports = paymentController;

const { Invoice, Subscription, Etablissement } = require('../database/models');
const { StatutInvoice } = require('../utils/enums');
const BillingService = require('../services/billing.service');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');

const invoiceController = {
    /**
     * Obtenir toutes les factures de l'établissement
     */
    getAllInvoices: async (req, res) => {
        try {
            const etablissementId = req.utilisateur.etablissement_id;
            const { page = 1, limit = 20, statut } = req.query;
            const offset = (page - 1) * limit;

            const whereClause = { etablissement_id: etablissementId };
            if (statut) {
                whereClause.statut = statut;
            }

            const { count, rows: invoices } = await Invoice.findAndCountAll({
                where: whereClause,
                include: [{
                    association: 'subscription',
                    attributes: ['plan_type']
                }],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['date_emission', 'DESC']]
            });

            res.json({
                invoices,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                },
                code: 'INVOICES_RETRIEVED'
            });
        } catch (error) {
            console.error('Erreur récupération factures:', error);
            res.status(500).json({
                error: 'Erreur lors de la récupération des factures',
                code: 'INVOICES_RETRIEVAL_ERROR'
            });
        }
    },

    /**
     * Obtenir une facture par ID
     */
    getInvoiceById: async (req, res) => {
        try {
            const { id } = req.params;
            const etablissementId = req.utilisateur.etablissement_id;

            const invoice = await Invoice.findOne({
                where: {
                    id,
                    etablissement_id: etablissementId
                },
                include: [
                    {
                        association: 'etablissement',
                        attributes: ['nom', 'adresse', 'ville', 'email', 'telephone']
                    },
                    {
                        association: 'subscription',
                        attributes: ['plan_type']
                    }
                ]
            });

            if (!invoice) {
                return res.status(404).json({
                    error: 'Facture non trouvée',
                    code: 'INVOICE_NOT_FOUND'
                });
            }

            res.json({
                invoice,
                code: 'INVOICE_RETRIEVED'
            });
        } catch (error) {
            console.error('Erreur récupération facture:', error);
            res.status(500).json({
                error: 'Erreur lors de la récupération de la facture',
                code: 'INVOICE_RETRIEVAL_ERROR'
            });
        }
    },

    /**
     * Générer une facture manuellement
     */
    generateInvoice: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Données invalides',
                    details: errors.array(),
                    code: 'VALIDATION_ERROR'
                });
            }

            const { etablissement_id, periode_debut, periode_fin } = req.body;

            // Vérifier les permissions (admin seulement)
            if (req.utilisateur.role !== 'admin' && req.utilisateur.etablissement_id !== etablissement_id) {
                return res.status(403).json({
                    error: 'Non autorisé',
                    code: 'FORBIDDEN'
                });
            }

            const invoice = await BillingService.generateInvoice(
                etablissement_id,
                new Date(periode_debut),
                new Date(periode_fin)
            );

            res.status(201).json({
                message: 'Facture générée avec succès',
                invoice,
                code: 'INVOICE_GENERATED'
            });
        } catch (error) {
            console.error('Erreur génération facture:', error);
            res.status(500).json({
                error: error.message || 'Erreur lors de la génération de la facture',
                code: 'INVOICE_GENERATION_ERROR'
            });
        }
    },

    /**
     * Marquer une facture comme payée
     */
    markAsPaid: async (req, res) => {
        try {
            const { id } = req.params;
            const { mode_paiement, reference } = req.body;

            const invoice = await Invoice.findByPk(id);
            if (!invoice) {
                return res.status(404).json({
                    error: 'Facture non trouvée',
                    code: 'INVOICE_NOT_FOUND'
                });
            }

            // Vérifier les permissions
            if (req.utilisateur.role !== 'admin' && req.utilisateur.etablissement_id !== invoice.etablissement_id) {
                return res.status(403).json({
                    error: 'Non autorisé',
                    code: 'FORBIDDEN'
                });
            }

            await invoice.markAsPaid({
                mode_paiement,
                reference
            });

            // Si l'établissement était suspendu, le réactiver
            const etablissement = await Etablissement.findByPk(invoice.etablissement_id);
            if (etablissement && etablissement.statut === 'suspendu') {
                etablissement.statut = 'actif';
                etablissement.date_suspension = null;
                await etablissement.save();
            }

            res.json({
                message: 'Facture marquée comme payée',
                invoice,
                code: 'INVOICE_PAID'
            });
        } catch (error) {
            console.error('Erreur marquage paiement:', error);
            res.status(500).json({
                error: 'Erreur lors du marquage de la facture',
                code: 'INVOICE_PAYMENT_ERROR'
            });
        }
    },

    /**
     * Obtenir le résumé des factures
     */
    getInvoiceSummary: async (req, res) => {
        try {
            const etablissementId = req.utilisateur.etablissement_id;

            const [total, paid, pending, overdue] = await Promise.all([
                Invoice.count({ where: { etablissement_id: etablissementId } }),
                Invoice.count({ where: { etablissement_id: etablissementId, statut: StatutInvoice.PAID } }),
                Invoice.count({ where: { etablissement_id: etablissementId, statut: StatutInvoice.PENDING } }),
                Invoice.count({ where: { etablissement_id: etablissementId, statut: StatutInvoice.OVERDUE } })
            ]);

            const totalAmount = await Invoice.sum('montant_ttc', {
                where: { etablissement_id: etablissementId, statut: StatutInvoice.PAID }
            });

            const unpaidAmount = await Invoice.sum('montant_ttc', {
                where: {
                    etablissement_id: etablissementId,
                    statut: { [Op.in]: [StatutInvoice.PENDING, StatutInvoice.OVERDUE] }
                }
            });

            res.json({
                summary: {
                    total_invoices: total,
                    paid_invoices: paid,
                    pending_invoices: pending,
                    overdue_invoices: overdue,
                    total_paid_amount: totalAmount || 0,
                    total_unpaid_amount: unpaidAmount || 0
                },
                code: 'INVOICE_SUMMARY_RETRIEVED'
            });
        } catch (error) {
            console.error('Erreur résumé factures:', error);
            res.status(500).json({
                error: 'Erreur lors de la récupération du résumé',
                code: 'INVOICE_SUMMARY_ERROR'
            });
        }
    }
};

module.exports = invoiceController;

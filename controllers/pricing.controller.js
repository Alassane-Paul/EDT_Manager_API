const { RegleTarification, Etablissement, Facture, Subscription } = require('../database/models');
const { TypeMetrique } = require('../utils/enums');
const { Op } = require('sequelize');

/**
 * Contrôleur pour la gestion de la tarification et des plans
 */
const pricingController = {
    /**
     * Récupère toutes les règles de tarification actives
     */
    getPricingRules: async (req, res) => {
        try {
            const rules = await RegleTarification.findAll({
                order: [['ordre', 'ASC']]
            });
            res.json({ success: true, rules });
        } catch (error) {
            console.error('Erreur lors de la récupération des prix:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    },

    /**
     * Créer une nouvelle règle de tarification
     */
    createPricingRule: async (req, res) => {
        try {
            const rule = await RegleTarification.create(req.body);
            res.status(201).json({ success: true, rule });
        } catch (error) {
            console.error('Erreur création règle:', error);
            res.status(500).json({ error: 'Erreur lors de la création de la règle' });
        }
    },

    /**
     * Met à jour une règle de tarification
     * Admin uniquement
     */
    updatePricingRule: async (req, res) => {
        try {
            const { id } = req.params;
            const rule = await RegleTarification.findByPk(id);
            if (!rule) return res.status(404).json({ error: 'Règle non trouvée' });

            await rule.update(req.body);
            res.json({ success: true, rule });
        } catch (error) {
            res.status(500).json({ error: 'Erreur lors de la mise à jour' });
        }
    },

    /**
     * Supprimer une règle de tarification
     */
    deletePricingRule: async (req, res) => {
        try {
            const { id } = req.params;
            const rule = await RegleTarification.findByPk(id);
            if (!rule) return res.status(404).json({ error: 'Règle non trouvée' });

            await rule.destroy();
            res.json({ success: true, message: 'Règle supprimée' });
        } catch (error) {
            res.status(500).json({ error: 'Erreur lors de la suppression' });
        }
    },

    /**
     * Calcule le montant estimé pour une consommation donnée
     */
    calculateEstimate: async (req, res) => {
        try {
            const { utilisateurs, classes, stockage_mb } = req.body;
            const rules = await RegleTarification.findAll({ where: { actif: true } });

            let estimation = {
                details: [],
                total_mensuel: 0
            };

            // Calcul pour chaque métrique
            rules.forEach(rule => {
                let quantite = 0;
                if (rule.type_metrique === TypeMetrique.USER) quantite = utilisateurs;
                if (rule.type_metrique === TypeMetrique.CLASS) quantite = classes;
                if (rule.type_metrique === TypeMetrique.STORAGE) quantite = stockage_mb;

                const a_payer = Math.max(0, quantite - rule.seuil_min);
                const cout = a_payer * rule.prix_unitaire;

                if (cout > 0) {
                    estimation.details.push({
                        nom: rule.nom,
                        quantite: a_payer,
                        unite: rule.type_metrique,
                        prix_unitaire: rule.prix_unitaire,
                        total: cout
                    });
                    estimation.total_mensuel += cout;
                }
            });

            res.json({ success: true, estimation });
        } catch (error) {
            res.status(500).json({ error: 'Erreur lors de l\'estimation' });
        }
    },

    /**
     * Récupère les statistiques de facturation d'un établissement
     */
    getEstablishmentBillingQuery: async (req, res) => {
        try {
            const etablissement_id = req.utilisateur.etablissement_id;

            const stats = await Facture.findAll({
                where: { etablissement_id },
                attributes: [
                    [Facture.sequelize.fn('SUM', Facture.sequelize.col('montant_ttc')), 'total_consomme'],
                    [Facture.sequelize.fn('COUNT', Facture.sequelize.col('id')), 'nombre_factures']
                ]
            });

            res.json({ success: true, stats: stats[0] });
        } catch (error) {
            res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
        }
    },

    /**
     * Liste les factures d'un établissement
     */
    getInvoices: async (req, res) => {
        try {
            const etablissement_id = req.utilisateur.etablissement_id;
            const invoices = await Facture.findAll({
                where: { etablissement_id },
                order: [['date_emission', 'DESC']]
            });

            // Calculer un petit résumé
            const summary = {
                total_paid_amount: invoices
                    .filter(inv => inv.statut === 'paid')
                    .reduce((sum, inv) => sum + parseFloat(inv.montant_ttc), 0),
                total_unpaid_amount: invoices
                    .filter(inv => inv.statut === 'pending' || inv.statut === 'overdue')
                    .reduce((sum, inv) => sum + parseFloat(inv.montant_ttc), 0),
                paid_invoices: invoices.filter(inv => inv.statut === 'paid').length,
                overdue_invoices: invoices.filter(inv => inv.statut === 'overdue').length
            };

            res.json({ success: true, invoices, summary });
        } catch (error) {
            console.error('Erreur récupération factures:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des factures' });
        }
    },

    /**
     * Récupère une facture spécifique
     */
    getInvoiceById: async (req, res) => {
        try {
            const { id } = req.params;
            const etablissement_id = req.utilisateur.etablissement_id;

            const invoice = await Facture.findOne({
                where: { id, etablissement_id }
            });

            if (!invoice) return res.status(404).json({ error: 'Facture non trouvée' });

            res.json({ success: true, invoice });
        } catch (error) {
            res.status(500).json({ error: 'Erreur lors de la récupération de la facture' });
        }
    },

    /**
     * Récupère les plans disponibles (hardcoded pour le moment ou depuis DB)
     */
    getPlans: async (req, res) => {
        try {
            const plans = [
                {
                    type: 'trial',
                    nom: 'Période d\'essai',
                    prix_base: 0,
                    limites: {
                        utilisateurs: 5,
                        classes: 2,
                        stockage_mb: 500
                    },
                    features: [
                        'Accès complet pendant 30 jours',
                        'Support par email',
                        'Génération d\'emplois du temps'
                    ]
                },
                {
                    type: 'basic',
                    nom: 'Basic',
                    prix_base: 2500,
                    prix_par_utilisateur: 500,
                    prix_par_classe: 1000,
                    limites: {
                        utilisateurs: 50,
                        classes: 10,
                        stockage_mb: 5000
                    },
                    features: [
                        'Jusqu\'à 50 utilisateurs',
                        'Jusqu\'à 10 classes',
                        '5 GB de stockage',
                        'Support par email',
                        'Génération d\'emplois du temps',
                        'Gestion des absences'
                    ]
                },
                {
                    type: 'premium',
                    nom: 'Premium',
                    prix_base: 5000,
                    prix_par_utilisateur: 300,
                    prix_par_classe: 600,
                    limites: {
                        utilisateurs: 200,
                        classes: 50,
                        stockage_mb: 20000
                    },
                    features: [
                        'Jusqu\'à 200 utilisateurs',
                        'Jusqu\'à 50 classes',
                        '20 GB de stockage',
                        'Support prioritaire',
                        'Toutes les fonctionnalités Basic',
                        'Rapports avancés',
                        'API access'
                    ]
                },
                {
                    type: 'enterprise',
                    nom: 'Enterprise',
                    prix_base: 'Sur devis',
                    limites: {
                        utilisateurs: null,
                        classes: null,
                        stockage_mb: null
                    },
                    features: [
                        'Utilisateurs illimités',
                        'Classes illimitées',
                        'Stockage sur mesure',
                        'Account Manager dédié',
                        'Service on-premise possible',
                        'SLA garanti'
                    ]
                }
            ];

            res.json({ success: true, plans });
        } catch (error) {
            console.error('Erreur plans:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des plans' });
        }
    }
};

module.exports = pricingController;

const { Invoice, Subscription, UsageMetric, PricingRule, Etablissement } = require('../database/models');
const { StatutInvoice, PlanType, TypeMetrique } = require('../utils/enums');
const { Op } = require('sequelize');

class BillingService {
    /**
     * Calculer le montant d'une facture basé sur l'utilisation
     */
    static async calculateInvoiceAmount(etablissementId, periodeDebut, periodeFin) {
        try {
            // Récupérer l'abonnement actif
            const subscription = await Subscription.findOne({
                where: {
                    etablissement_id: etablissementId,
                    statut: 'active'
                }
            });

            if (!subscription) {
                throw new Error('Aucun abonnement actif trouvé');
            }

            // Montant de base
            let montantTotal = parseFloat(subscription.prix_base_mensuel);

            // Récupérer les métriques d'utilisation
            const metrics = await UsageMetric.findOne({
                where: {
                    etablissement_id: etablissementId,
                    periode_debut: periodeDebut,
                    periode_fin: periodeFin
                },
                order: [['date_capture', 'DESC']]
            });

            if (!metrics) {
                console.warn(`[Billing] Aucune métrique trouvée pour ${etablissementId}`);
                return montantTotal;
            }

            // Récupérer les règles de tarification actives
            const pricingRules = await PricingRule.findAll({
                where: { actif: true },
                order: [['ordre', 'ASC']]
            });

            // Calculer les coûts additionnels selon les règles
            const details = [];

            for (const rule of pricingRules) {
                let quantity = 0;

                switch (rule.type_metrique) {
                    case TypeMetrique.USER:
                        quantity = metrics.nb_utilisateurs_actifs;
                        break;
                    case TypeMetrique.CLASS:
                        quantity = metrics.nb_classes;
                        break;
                    case TypeMetrique.COURSE:
                        quantity = metrics.nb_cours;
                        break;
                    case TypeMetrique.STORAGE:
                        quantity = metrics.stockage_utilise_mb;
                        break;
                    case TypeMetrique.TIMETABLE:
                        quantity = metrics.nb_emplois_temps_generes;
                        break;
                }

                const cost = rule.calculatePrice(quantity);
                if (cost > 0) {
                    montantTotal += cost;
                    details.push({
                        metrique: rule.type_metrique,
                        nom: rule.nom,
                        quantite: quantity,
                        prix_unitaire: parseFloat(rule.prix_unitaire),
                        montant: cost
                    });
                }
            }

            return {
                montant_ht: montantTotal,
                details
            };
        } catch (error) {
            console.error('[Billing] Erreur calcul montant:', error);
            throw error;
        }
    }

    /**
     * Générer une facture pour un établissement
     */
    static async generateInvoice(etablissementId, periodeDebut, periodeFin) {
        try {
            const subscription = await Subscription.findOne({
                where: {
                    etablissement_id: etablissementId,
                    statut: 'active'
                }
            });

            if (!subscription) {
                throw new Error('Aucun abonnement actif');
            }

            // Calculer le montant
            const { montant_ht, details } = await this.calculateInvoiceAmount(
                etablissementId,
                periodeDebut,
                periodeFin
            );

            // Créer la facture
            const invoice = await Invoice.create({
                etablissement_id: etablissementId,
                subscription_id: subscription.id,
                periode_debut: periodeDebut,
                periode_fin: periodeFin,
                montant_ht,
                details_json: { lignes: details },
                statut: StatutInvoice.PENDING
            });

            console.log(`[Billing] Facture ${invoice.numero_facture} générée: ${invoice.montant_ttc}€`);

            return invoice;
        } catch (error) {
            console.error('[Billing] Erreur génération facture:', error);
            throw error;
        }
    }

    /**
     * Générer les factures mensuelles pour tous les établissements
     */
    static async generateMonthlyInvoices() {
        try {
            console.log('[Billing] Début génération factures mensuelles');

            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

            // Récupérer tous les abonnements actifs
            const subscriptions = await Subscription.findAll({
                where: {
                    statut: 'active',
                    date_prochaine_facturation: {
                        [Op.lte]: today
                    }
                },
                include: [{
                    association: 'etablissement'
                }]
            });

            let successCount = 0;
            let errorCount = 0;

            for (const subscription of subscriptions) {
                try {
                    // Vérifier qu'une facture n'existe pas déjà pour cette période
                    const existingInvoice = await Invoice.findOne({
                        where: {
                            etablissement_id: subscription.etablissement_id,
                            periode_debut: lastMonth,
                            periode_fin: endOfLastMonth
                        }
                    });

                    if (existingInvoice) {
                        console.log(`[Billing] Facture déjà existante pour ${subscription.etablissement.nom}`);
                        continue;
                    }

                    // Générer la facture
                    await this.generateInvoice(
                        subscription.etablissement_id,
                        lastMonth,
                        endOfLastMonth
                    );

                    // Mettre à jour la date de prochaine facturation
                    subscription.date_prochaine_facturation = new Date(
                        today.getFullYear(),
                        today.getMonth() + 1,
                        1
                    );
                    await subscription.save();

                    successCount++;
                } catch (error) {
                    console.error(`[Billing] Erreur pour ${subscription.etablissement.nom}:`, error);
                    errorCount++;
                }
            }

            console.log(`[Billing] Génération terminée: ${successCount} succès, ${errorCount} erreurs`);

            return { successCount, errorCount };
        } catch (error) {
            console.error('[Billing] Erreur génération factures mensuelles:', error);
            throw error;
        }
    }

    /**
     * Envoyer une facture par email
     */
    static async sendInvoiceEmail(invoiceId) {
        try {
            const invoice = await Invoice.findByPk(invoiceId, {
                include: [{
                    association: 'etablissement'
                }]
            });

            if (!invoice) {
                throw new Error('Facture non trouvée');
            }

            // TODO: Implémenter l'envoi d'email avec le service d'email
            console.log(`[Billing] Email de facture envoyé à ${invoice.etablissement.email}`);

            return true;
        } catch (error) {
            console.error('[Billing] Erreur envoi email:', error);
            throw error;
        }
    }

    /**
     * Vérifier et suspendre les établissements avec factures impayées
     */
    static async checkOverdueInvoices() {
        try {
            console.log('[Billing] Vérification des factures en retard');

            const today = new Date();
            const overdueInvoices = await Invoice.findAll({
                where: {
                    statut: StatutInvoice.PENDING,
                    date_echeance: {
                        [Op.lt]: today
                    }
                },
                include: [{
                    association: 'etablissement'
                }]
            });

            for (const invoice of overdueInvoices) {
                // Marquer la facture comme en retard
                invoice.statut = StatutInvoice.OVERDUE;
                await invoice.save();

                // Suspendre l'établissement si > 30 jours de retard
                const daysOverdue = Math.floor((today - new Date(invoice.date_echeance)) / (1000 * 60 * 60 * 24));

                if (daysOverdue > 30 && invoice.etablissement.statut === 'actif') {
                    invoice.etablissement.statut = 'suspendu';
                    invoice.etablissement.date_suspension = today;
                    await invoice.etablissement.save();

                    console.log(`[Billing] Établissement ${invoice.etablissement.nom} suspendu pour non-paiement`);
                }
            }

            console.log(`[Billing] ${overdueInvoices.length} factures en retard traitées`);
        } catch (error) {
            console.error('[Billing] Erreur vérification factures:', error);
            throw error;
        }
    }
}

module.exports = BillingService;

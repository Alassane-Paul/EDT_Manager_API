const { FedaPay, Transaction, Customer } = require('fedapay');
const { Invoice, Etablissement, Utilisateur, Subscription } = require('../database/models');
const { StatutInvoice } = require('../utils/enums');

/**
 * Service pour la gestion des paiements via FedaPay
 */
class PaymentService {
    constructor() {
        this.init();
    }

    /**
     * Initialise le SDK FedaPay
     */
    init() {
        FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
        FedaPay.setEnvironment(process.env.FEDAPAY_ENVIRONMENT || 'sandbox');
    }

    /**
     * Crée une transaction FedaPay pour une facture donnée
     * @param {string} invoiceId - ID de la facture
     * @returns {Promise<Object>} - La transaction FedaPay créée avec son token
     */
    async createTransaction(invoiceId) {
        try {
            const invoice = await Invoice.findByPk(invoiceId, {
                include: [{ model: Etablissement, as: 'etablissement' }]
            });

            if (!invoice) {
                throw new Error('Facture introuvable');
            }

            if (invoice.statut === StatutInvoice.PAID) {
                throw new Error('Cette facture est déjà payée');
            }

            // Récupérer le contact de l'établissement (directeur) pour FedaPay
            const directeur = await Utilisateur.findOne({
                where: {
                    etablissement_id: invoice.etablissement_id,
                    role: 'directeur'
                }
            });

            // Créer ou récupérer le client dans FedaPay
            const customerData = {
                firstname: (directeur ? directeur.prenom : invoice.etablissement.nom) || 'Etablissement',
                lastname: (directeur ? directeur.nom : 'Directeur') || 'Contact',
                email: (directeur ? directeur.email : invoice.etablissement.email) || 'contact@etablissement.com',
                phone_number: {
                    number: (invoice.etablissement.telephone || '00000000').replace(/[^0-9]/g, ''),
                    country: 'TG' // Par défaut
                }
            };

            // Création de la transaction dans FedaPay
            const transaction = await Transaction.create({
                description: `Paiement facture ${invoice.numero_facture}`,
                amount: Math.round(invoice.montant_ttc),
                currency: { iso: 'XOF' },
                customer: customerData,
                callback_url: `${process.env.FRONTEND_URL}/billing/invoices?status=success&invoiceId=${invoice.id}`,
                cancel_url: `${process.env.FRONTEND_URL}/billing/invoices?status=cancel&invoiceId=${invoice.id}`
            });

            // Générer le token de paiement
            const tokenResponse = await transaction.generateToken();

            // Mettre à jour la facture avec l'ID de transaction
            await invoice.update({
                reference_paiement: transaction.id
            });

            return {
                id: transaction.id,
                url: tokenResponse.url,
                token: tokenResponse.token
            };
        } catch (error) {
            console.error('Erreur PaymentService.createTransaction:', error);
            throw error;
        }
    }

    /**
     * Crée une transaction FedaPay pour une souscription à un plan
     * @param {string} planType - Type du plan (basic, premium, etc.)
     * @param {string} etablissementId - ID de l'établissement
     * @returns {Promise<Object>} - La transaction FedaPay créée
     */
    async createSubscriptionTransaction(planType, etablissementId) {
        try {
            const etablissement = await Etablissement.findByPk(etablissementId);
            if (!etablissement) {
                throw new Error('Etablissement introuvable');
            }

            // Récupérer les prix des plans
            // Note: On baisse les prix pour le Sandbox car FedaPay Sandbox limite à 5000 XOF
            const planPrices = {
                basic: 2500,
                premium: 5000,
                enterprise: 10000
            };

            const amount = planPrices[planType.toLowerCase()] || 0;
            if (amount === 0 && planType !== 'trial') {
                throw new Error('Plan invalide ou prix non configuré');
            }

            const directeur = await Utilisateur.findOne({
                where: {
                    etablissement_id: etablissementId,
                    role: 'directeur'
                }
            });

            const customerData = {
                firstname: (directeur ? directeur.prenom : etablissement.nom) || 'Etablissement',
                lastname: (directeur ? directeur.nom : 'Directeur') || 'Contact',
                email: (directeur ? directeur.email : etablissement.email) || 'contact@etablissement.com',
                phone_number: {
                    number: (etablissement.telephone || '00000000').replace(/[^0-9]/g, ''),
                    country: 'TG'
                }
            };

            console.log('[FedaPay] Creating subscription transaction:', { planType, etablissementId, amount });
            console.log('[FedaPay] Customer Data:', customerData);

            const transaction = await Transaction.create({
                description: `Abonnement au plan ${planType.toUpperCase()} - ${etablissement.nom}`,
                amount: amount,
                currency: { iso: 'XOF' },
                customer: customerData,
                metadata: {
                    type: 'subscription_upgrade',
                    plan_type: planType,
                    etablissement_id: etablissementId
                },
                callback_url: `${process.env.FRONTEND_URL}/billing?status=success&plan=${planType}`,
                cancel_url: `${process.env.FRONTEND_URL}/billing?status=cancel`
            });

            const tokenResponse = await transaction.generateToken();

            return {
                id: transaction.id,
                url: tokenResponse.url,
                token: tokenResponse.token
            };
        } catch (error) {
            console.error('Erreur PaymentService.createSubscriptionTransaction:', error.message);
            if (error.response) {
                console.error('FedaPay Status:', error.response.status);
                console.error('FedaPay Error Details:', JSON.stringify(error.response.data, null, 2));
            } else if (error.errors) {
                console.error('FedaPay SDK Errors:', error.errors);
            }
            throw error;
        }
    }

    /**
     * Traite directement une transaction (Mobile Money USSD Push)
     * @param {string|number} transactionId - ID de transaction FedaPay
     * @param {string} mode - mtn, orange, moov, card
     * @param {string} phoneNumber - Numéro de téléphone (pour Mobile Money)
     * @param {string} country - Code pays (TG, BJ, CI, etc.)
     */
    async processDirectPayment(transactionId, mode, phoneNumber, country = 'TG') {
        try {
            const transaction = await Transaction.retrieve(transactionId);

            if (mode === 'card') {
                // Pour la carte, on retourne simplement l'URL de redirection déjà générée ou une nouvelle
                const tokenResponse = await transaction.generateToken();
                return {
                    redirectUrl: tokenResponse.url
                };
            }

            // Pour Mobile Money, on déclenche le "sendNow" (USSD Push)
            // Note: Le SDK FedaPay peut avoir des méthodes différentes selon la version
            // Généralement, on envoie un objet avec le mode et les infos client

            const response = await transaction.sendNow(mode, {
                phone_number: {
                    number: phoneNumber.replace(/[^0-9]/g, ''),
                    country: country // Utiliser le pays passé
                }
            });

            return {
                message: 'Demande envoyée vers votre mobile. Veuillez valider avec votre code PIN.',
                response
            };
        } catch (error) {
            console.error('Erreur PaymentService.processDirectPayment:', error.message);
            throw error;
        }
    }

    /**
     * Vérifie le statut d'une transaction FedaPay
     * @param {number|string} transactionId - ID de transaction FedaPay
     * @returns {Promise<Object>} - La transaction vérifiée
     */
    async verifyTransaction(transactionId) {
        try {
            const transaction = await Transaction.retrieve(transactionId);

            if (transaction.status === 'approved') {
                // Vérifier les metadata
                const metadata = transaction.metadata || {};

                if (metadata.type === 'subscription_upgrade') {
                    // Appliquer l'upgrade
                    const { plan_type, etablissement_id } = metadata;
                    const subscription = await Subscription.findOne({
                        where: { etablissement_id: etablissement_id, statut: 'active' }
                    });

                    if (subscription) {
                        await subscription.update({
                            plan_type: plan_type,
                            date_debut: new Date()
                        });

                        const etablissement = await Etablissement.findByPk(etablissement_id);
                        if (etablissement) {
                            const planLimits = {
                                basic: { users: 50, classes: 10, storage: 5000 },
                                premium: { users: 200, classes: 50, storage: 20000 }
                            };
                            const limits = planLimits[plan_type.toLowerCase()];
                            if (limits) {
                                await etablissement.update({
                                    limite_utilisateurs: limits.users,
                                    limite_classes: limits.classes,
                                    limite_stockage_mb: limits.storage
                                });
                            }
                        }
                    }
                } else {
                    const invoice = await Invoice.findOne({
                        where: { reference_paiement: transactionId }
                    });

                    if (invoice && invoice.statut !== StatutInvoice.PAID) {
                        await invoice.markAsPaid({
                            mode_paiement: 'FedaPay',
                            reference: transactionId
                        });
                    }
                }
            }

            return transaction;
        } catch (error) {
            console.error('Erreur PaymentService.verifyTransaction:', error);
            throw error;
        }
    }
}

module.exports = new PaymentService();

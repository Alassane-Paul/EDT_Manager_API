const { Etablissement, Utilisateur, Classe, Cours, EmploiTemps, UsageMetric } = require('../database/models');
const { Op } = require('sequelize');

class UsageTrackingService {
    /**
     * Capturer les métriques d'utilisation pour un établissement
     */
    static async captureUsageMetrics(etablissementId) {
        try {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

            // Compter les utilisateurs actifs (connectés dans les 30 derniers jours)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const nbUtilisateursActifs = await Utilisateur.count({
                where: {
                    etablissement_id: etablissementId,
                    actif: true,
                    date_derniere_connexion: {
                        [Op.gte]: thirtyDaysAgo
                    }
                }
            });

            // Compter les classes
            const nbClasses = await Classe.count({
                where: {
                    etablissement_id: etablissementId
                }
            });

            // Compter les cours
            const nbCours = await Cours.count({
                include: [{
                    association: 'classe',
                    where: { etablissement_id: etablissementId }
                }]
            });

            // Compter les emplois du temps générés ce mois
            const nbEmploisTemps = await EmploiTemps.count({
                where: {
                    etablissement_id: etablissementId,
                    created_at: {
                        [Op.between]: [startOfMonth, endOfMonth]
                    }
                }
            });

            // TODO: Calculer le stockage utilisé (fichiers uploadés)
            const stockageUtiliseMb = 0; // À implémenter avec le système de fichiers

            // Créer la métrique
            const metric = await UsageMetric.create({
                etablissement_id: etablissementId,
                periode_debut: startOfMonth,
                periode_fin: endOfMonth,
                nb_utilisateurs_actifs: nbUtilisateursActifs,
                nb_classes: nbClasses,
                nb_cours: nbCours,
                nb_emplois_temps_generes: nbEmploisTemps,
                stockage_utilise_mb: stockageUtiliseMb,
                date_capture: new Date()
            });

            console.log(`[UsageTracking] Métriques capturées pour établissement ${etablissementId}:`, {
                utilisateurs: nbUtilisateursActifs,
                classes: nbClasses,
                cours: nbCours,
                emplois_temps: nbEmploisTemps
            });

            return metric;
        } catch (error) {
            console.error('[UsageTracking] Erreur capture métriques:', error);
            throw error;
        }
    }

    /**
     * Vérifier si un établissement dépasse ses limites
     */
    static async checkLimits(etablissementId) {
        try {
            const etablissement = await Etablissement.findByPk(etablissementId);
            if (!etablissement) {
                throw new Error('Établissement non trouvé');
            }

            const warnings = [];

            // Vérifier limite utilisateurs
            if (etablissement.limite_utilisateurs) {
                const nbUtilisateurs = await Utilisateur.count({
                    where: { etablissement_id: etablissementId, actif: true }
                });

                if (nbUtilisateurs >= etablissement.limite_utilisateurs) {
                    warnings.push({
                        type: 'users',
                        current: nbUtilisateurs,
                        limit: etablissement.limite_utilisateurs,
                        exceeded: nbUtilisateurs > etablissement.limite_utilisateurs
                    });
                }
            }

            // Vérifier limite classes
            if (etablissement.limite_classes) {
                const nbClasses = await Classe.count({
                    where: { etablissement_id: etablissementId }
                });

                if (nbClasses >= etablissement.limite_classes) {
                    warnings.push({
                        type: 'classes',
                        current: nbClasses,
                        limit: etablissement.limite_classes,
                        exceeded: nbClasses > etablissement.limite_classes
                    });
                }
            }

            // Vérifier limite stockage
            if (etablissement.limite_stockage_mb) {
                // TODO: Implémenter le calcul du stockage réel
                const stockageUtilise = 0;

                if (stockageUtilise >= etablissement.limite_stockage_mb) {
                    warnings.push({
                        type: 'storage',
                        current: stockageUtilise,
                        limit: etablissement.limite_stockage_mb,
                        exceeded: stockageUtilise > etablissement.limite_stockage_mb
                    });
                }
            }

            return {
                hasWarnings: warnings.length > 0,
                warnings
            };
        } catch (error) {
            console.error('[UsageTracking] Erreur vérification limites:', error);
            throw error;
        }
    }

    /**
     * Obtenir les métriques d'utilisation pour une période
     */
    static async getUsageForPeriod(etablissementId, periodeDebut, periodeFin) {
        try {
            const metrics = await UsageMetric.findAll({
                where: {
                    etablissement_id: etablissementId,
                    periode_debut: {
                        [Op.gte]: periodeDebut
                    },
                    periode_fin: {
                        [Op.lte]: periodeFin
                    }
                },
                order: [['periode_debut', 'ASC']]
            });

            return metrics;
        } catch (error) {
            console.error('[UsageTracking] Erreur récupération métriques:', error);
            throw error;
        }
    }

    /**
     * Tâche cron pour capturer les métriques quotidiennes
     */
    static async scheduleDailyCapture() {
        try {
            console.log('[UsageTracking] Début de la capture quotidienne des métriques');

            const etablissements = await Etablissement.findAll({
                where: {
                    statut: 'actif'
                }
            });

            for (const etablissement of etablissements) {
                try {
                    await this.captureUsageMetrics(etablissement.id);
                } catch (error) {
                    console.error(`[UsageTracking] Erreur pour établissement ${etablissement.id}:`, error);
                    // Continue avec les autres établissements
                }
            }

            console.log(`[UsageTracking] Capture terminée pour ${etablissements.length} établissements`);
        } catch (error) {
            console.error('[UsageTracking] Erreur capture quotidienne:', error);
            throw error;
        }
    }
}

module.exports = UsageTrackingService;

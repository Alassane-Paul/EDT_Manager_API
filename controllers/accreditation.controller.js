const { Accreditation, Utilisateur } = require('../database/models');
const { RoleUtilisateur } = require('../utils/enums');
const { Op } = require('sequelize');

/**
 * Contrôleur pour la gestion des accréditations temporaires
 */
const accreditationController = {
    /**
     * Crée une nouvelle accréditation (Directeur uniquement)
     */
    create: async (req, res) => {
        try {
            const { utilisateur_id, module, date_debut, date_fin, description } = req.body;
            const etablissement_id = req.utilisateur.etablissement_id;

            if (!utilisateur_id || !module || !date_debut || !date_fin) {
                return res.status(400).json({
                    error: 'Tous les champs obligatoires doivent être remplis',
                    code: 'MISSING_FIELDS'
                });
            }

            // Vérifier que l'utilisateur appartient à l'établissement
            const staff = await Utilisateur.findOne({
                where: { id: utilisateur_id, etablissement_id }
            });

            if (!staff) {
                return res.status(404).json({
                    error: 'Membre du personnel introuvable dans votre établissement',
                    code: 'STAFF_NOT_FOUND'
                });
            }

            const accreditation = await Accreditation.create({
                utilisateur_id,
                etablissement_id,
                module,
                date_debut,
                date_fin,
                description,
                statut: 'actif'
            });

            res.status(201).json({
                success: true,
                accreditation
            });
        } catch (error) {
            console.error('Erreur lors de la création de l\'accréditation:', error);
            res.status(500).json({
                error: 'Erreur lors de la création de l\'accréditation',
                code: 'ACCREDITATION_CREATE_ERROR'
            });
        }
    },

    /**
     * Liste toutes les accréditations de l'établissement
     */
    listByEtablissement: async (req, res) => {
        try {
            const etablissement_id = req.utilisateur.etablissement_id;

            const accreditations = await Accreditation.findAll({
                where: { etablissement_id },
                include: [{
                    model: Utilisateur,
                    as: 'utilisateur',
                    attributes: ['id', 'nom', 'prenom', 'email', 'role']
                }],
                order: [['created_at', 'DESC']]
            });

            res.json({
                success: true,
                accreditations
            });
        } catch (error) {
            console.error('Erreur lors de la récupération des accréditations:', error);
            res.status(500).json({
                error: 'Erreur lors de la récupération des accréditations',
                code: 'ACCREDITATION_LIST_ERROR'
            });
        }
    },

    /**
     * Révoque (supprime) une accréditation
     */
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const etablissement_id = req.utilisateur.etablissement_id;

            const accreditation = await Accreditation.findOne({
                where: { id, etablissement_id }
            });

            if (!accreditation) {
                return res.status(404).json({
                    error: 'Accréditation introuvable',
                    code: 'ACCREDITATION_NOT_FOUND'
                });
            }

            await accreditation.destroy();

            res.json({
                success: true,
                message: 'Accréditation révoquée avec succès'
            });
        } catch (error) {
            console.error('Erreur lors de la révocation de l\'accréditation:', error);
            res.status(500).json({
                error: 'Erreur lors de la révocation de l\'accréditation',
                code: 'ACCREDITATION_DELETE_ERROR'
            });
        }
    },

    /**
     * Vérifie si l'utilisateur actuel est accrédité pour un module spécifique
     */
    checkMyAccreditation: async (req, res) => {
        try {
            const { module } = req.params;
            const utilisateur_id = req.utilisateur.id;
            const now = new Date();

            const accreditation = await Accreditation.findOne({
                where: {
                    utilisateur_id,
                    module,
                    statut: 'actif',
                    date_debut: { [Op.lte]: now },
                    date_fin: { [Op.gte]: now }
                }
            });

            res.json({
                success: true,
                isAccredited: !!accreditation,
                accreditation
            });
        } catch (error) {
            console.error('Erreur lors de la vérification de l\'accréditation:', error);
            res.status(500).json({
                error: 'Erreur lors de la vérification de l\'accréditation',
                code: 'ACCREDITATION_CHECK_ERROR'
            });
        }
    },

    /**
     * Récupère toutes les accréditations actives de l'utilisateur connecté
     */
    getMyActiveAccreditations: async (req, res) => {
        try {
            const utilisateur_id = req.utilisateur.id;
            const now = new Date();

            const accreditations = await Accreditation.findAll({
                where: {
                    utilisateur_id,
                    statut: 'actif',
                    date_debut: { [Op.lte]: now },
                    date_fin: { [Op.gte]: now }
                },
                attributes: ['module', 'id']
            });

            res.json({
                success: true,
                modules: accreditations.map(a => a.module)
            });
        } catch (error) {
            console.error('Erreur lors de la récupération des accréditations actives:', error);
            res.status(500).json({
                error: 'Erreur lors de la récupération des accréditations actives',
                code: 'MY_ACCREDITATIONS_ERROR'
            });
        }
    }
};

module.exports = accreditationController;

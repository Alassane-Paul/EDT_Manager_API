const { Periode, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { TypeOperation, RoleUtilisateur } = require('../utils/enums');

const isAdminSystem = (utilisateur = {}) => utilisateur.role === RoleUtilisateur.ADMIN;

const resolveScopedEtablissementId = (req) => {
    const fromQuery = req.query?.etablissement_id;
    const fromBody = req.body?.etablissement_id;
    if (isAdminSystem(req.utilisateur)) {
        return fromQuery || fromBody || req.utilisateur?.etablissement_id || null;
    }
    return req.utilisateur?.etablissement_id || null;
};

const applyEtablissementScope = (req, baseWhere = {}) => {
    const scopedId = resolveScopedEtablissementId(req);
    if (!isAdminSystem(req.utilisateur)) {
        return { ...baseWhere, etablissement_id: scopedId };
    }
    if (scopedId) {
        return { ...baseWhere, etablissement_id: scopedId };
    }
    return baseWhere;
};

const periodeController = {
    getAllPeriodes: async (req, res) => {
        try {
            const whereClause = applyEtablissementScope(req, {});
            const periodes = await Periode.findAll({
                where: whereClause,
                order: [['date_debut', 'ASC']]
            });
            res.json({ periodes, code: 'PERIODES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération périodes:', error);
            res.status(500).json({
                error: 'Erreur récupération périodes',
                message: error.message,
                details: error.stack,
                code: 'PERIODES_ERROR'
            });
        }
    },

    createPeriode: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides', details: errors.array() });

            const { libelle, date_debut, date_fin, annee_scolaire } = req.body;
            const etablissement_id = resolveScopedEtablissementId(req);

            if (!etablissement_id) return res.status(400).json({ error: 'Etablissement requis' });

            const periode = await Periode.create({
                libelle, date_debut, date_fin, annee_scolaire, etablissement_id, actif: true
            });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'periodes',
                id_entite_concernee: periode.id,
                type_operation: TypeOperation.CREATION,
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'Période créée', periode, code: 'PERIODE_CREATED' });
        } catch (error) {
            console.error('Erreur création période:', error);
            res.status(500).json({ error: 'Erreur création période', code: 'PERIODE_CREATION_ERROR' });
        }
    },

    updatePeriode: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const periode = await Periode.findOne({ where: whereClause });

            if (!periode) return res.status(404).json({ error: 'Période non trouvée' });

            await periode.update(updates);

            res.json({ message: 'Période mise à jour', periode, code: 'PERIODE_UPDATED' });
        } catch (error) {
            console.error('Erreur MAJ période:', error);
            res.status(500).json({ error: 'Erreur MAJ période', code: 'PERIODE_UPDATE_ERROR' });
        }
    },

    deletePeriode: async (req, res) => {
        try {
            const { id } = req.params;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const periode = await Periode.findOne({ where: whereClause });

            if (!periode) return res.status(404).json({ error: 'Période non trouvée' });

            await periode.destroy();
            res.json({ message: 'Période supprimée', code: 'PERIODE_DELETED' });
        } catch (error) {
            console.error('Erreur suppression période:', error);
            res.status(500).json({ error: 'Erreur suppression période', code: 'PERIODE_DELETE_ERROR' });
        }
    }
};

module.exports = periodeController;

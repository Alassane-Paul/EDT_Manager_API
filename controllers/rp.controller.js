// controllers/rpController.js
const { ResponsablePedagogique, Utilisateur, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
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

const rpController = {
    getAllRPs: async (req, res) => {
        try {
            const { page = 1, limit = 100, search } = req.query;
            const offset = (page - 1) * limit;
            const whereClause = applyEtablissementScope(req, {});

            if (search) {
                whereClause[Op.or] = [
                    { '$utilisateur.nom$': { [Op.like]: `%${search}%` } },
                    { '$utilisateur.prenom$': { [Op.like]: `%${search}%` } },
                    { matricule: { [Op.like]: `%${search}%` } }
                ];
            }

            const { count, rows: rps } = await ResponsablePedagogique.findAndCountAll({
                where: whereClause,
                include: [{ association: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] }],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['created_at', 'DESC']]
            });

            res.json({ rps, pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }, code: 'RECUPERATION_RP_SUCCESS' });
        } catch (error) {
            console.error('Erreur récupération RPs:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des RPs', code: 'RECUPERATION_RP_ERROR' });
        }
    },

    createRP: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides', details: errors.array(), code: 'VALIDATION_ERROR' });

            const { utilisateur_id, matricule, date_prise_fonction } = req.body;
            const targetEtablissementId = resolveScopedEtablissementId(req);

            if (!targetEtablissementId) return res.status(400).json({ error: 'Établissement requis', code: 'ESTABLISSEMENT_REQUIRED' });

            const existing = await ResponsablePedagogique.findOne({ where: { matricule, etablissement_id: targetEtablissementId } });
            if (existing) return res.status(409).json({ error: 'Matricule déjà utilisé', code: 'RP_MATRICULE_EXISTS' });

            const utilisateur = await Utilisateur.findOne({ where: { id: utilisateur_id, etablissement_id: targetEtablissementId } });
            if (!utilisateur) return res.status(404).json({ error: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });

            const rp = await ResponsablePedagogique.create({ utilisateur_id, matricule, date_prise_fonction, etablissement_id: targetEtablissementId });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'responsables_pedagogiques',
                id_entite_concernee: rp.id,
                type_operation: TypeOperation.CREATION,
                valeur_apres: { utilisateur_id, matricule },
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'RP créé avec succès', rp, code: 'RP_CREATED' });
        } catch (error) {
            console.error('Erreur création RP:', error);
            res.status(500).json({ error: 'Erreur lors de la création du RP', code: 'RP_CREATION_ERROR' });
        }
    },

    updateRP: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const rp = await ResponsablePedagogique.findOne({ where: whereClause });

            if (!rp) {
                return res.status(404).json({ error: 'Responsable Pédagogique non trouvé', code: 'RP_NOT_FOUND' });
            }

            if (updates.matricule && updates.matricule !== rp.matricule) {
                const existing = await ResponsablePedagogique.findOne({
                    where: { matricule: updates.matricule, etablissement_id: rp.etablissement_id, id: { [Op.ne]: id } }
                });
                if (existing) return res.status(409).json({ error: 'Matricule déjà utilisé', code: 'RP_MATRICULE_EXISTS' });
            }

            await rp.update(updates);

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'responsables_pedagogiques',
                id_entite_concernee: id,
                type_operation: TypeOperation.MODIFICATION,
                valeur_apres: updates,
                adresse_ip: req.ip
            });

            res.json({ message: 'Responsable Pédagogique mis à jour', rp, code: 'RP_UPDATED' });
        } catch (error) {
            console.error('Erreur mise à jour RP:', error);
            res.status(500).json({ error: 'Erreur mise à jour RP', code: 'RP_UPDATE_ERROR' });
        }
    },

    deleteRP: async (req, res) => {
        try {
            const { id } = req.params;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const rp = await ResponsablePedagogique.findOne({ where: whereClause });

            if (!rp) {
                return res.status(404).json({ error: 'Responsable Pédagogique non trouvé', code: 'RP_NOT_FOUND' });
            }

            await rp.destroy();

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'responsables_pedagogiques',
                id_entite_concernee: id,
                type_operation: TypeOperation.SUPPRESSION,
                adresse_ip: req.ip
            });

            res.json({ message: 'Responsable Pédagogique supprimé', code: 'RP_DELETED' });
        } catch (error) {
            console.error('Erreur suppression RP:', error);
            res.status(500).json({ error: 'Erreur suppression RP', code: 'RP_DELETION_ERROR' });
        }
    }
};

module.exports = rpController;

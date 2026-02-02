// controllers/directeurController.js
const { Directeur, Utilisateur, LogModification } = require('../database/models');
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

const directeurController = {
    getAllDirecteurs: async (req, res) => {
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

            const { count, rows: directeurs } = await Directeur.findAndCountAll({
                where: whereClause,
                include: [{ association: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] }],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['created_at', 'DESC']]
            });

            res.json({ directeurs, pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }, code: 'RECUPERATION_DIRECTORS_SUCCESS' });
        } catch (error) {
            console.error('Erreur récupération directeurs:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des directeurs', code: 'RECUPERATION_DIRECTORS_ERROR' });
        }
    },

    createDirecteur: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides', details: errors.array(), code: 'VALIDATION_ERROR' });

            const { utilisateur_id, matricule, date_nomination } = req.body;
            const targetEtablissementId = resolveScopedEtablissementId(req);

            if (!targetEtablissementId) return res.status(400).json({ error: 'Établissement requis', code: 'ESTABLISSEMENT_REQUIRED' });

            const existing = await Directeur.findOne({ where: { matricule, etablissement_id: targetEtablissementId } });
            if (existing) return res.status(409).json({ error: 'Matricule déjà utilisé', code: 'DIRECTOR_MATRICULE_EXISTS' });

            const utilisateur = await Utilisateur.findOne({ where: { id: utilisateur_id, etablissement_id: targetEtablissementId } });
            if (!utilisateur) return res.status(404).json({ error: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });

            const directeur = await Directeur.create({ utilisateur_id, matricule, date_nomination, etablissement_id: targetEtablissementId });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'directeurs',
                id_entite_concernee: directeur.id,
                type_operation: TypeOperation.CREATION,
                valeur_apres: { utilisateur_id, matricule },
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'Directeur créé avec succès', directeur, code: 'DIRECTOR_CREATED' });
        } catch (error) {
            console.error('Erreur création directeur:', error);
            res.status(500).json({ error: 'Erreur lors de la création du directeur', code: 'DIRECTOR_CREATION_ERROR' });
        }
    },

    updateDirecteur: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const directeur = await Directeur.findOne({ where: whereClause });

            if (!directeur) {
                return res.status(404).json({ error: 'Directeur non trouvé', code: 'DIRECTOR_NOT_FOUND' });
            }

            if (updates.matricule && updates.matricule !== directeur.matricule) {
                const existing = await Directeur.findOne({
                    where: { matricule: updates.matricule, etablissement_id: directeur.etablissement_id, id: { [Op.ne]: id } }
                });
                if (existing) return res.status(409).json({ error: 'Matricule déjà utilisé', code: 'DIRECTOR_MATRICULE_EXISTS' });
            }

            await directeur.update(updates);

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'directeurs',
                id_entite_concernee: id,
                type_operation: TypeOperation.MODIFICATION,
                valeur_apres: updates,
                adresse_ip: req.ip
            });

            res.json({ message: 'Directeur mis à jour', directeur, code: 'DIRECTOR_UPDATED' });
        } catch (error) {
            console.error('Erreur mise à jour directeur:', error);
            res.status(500).json({ error: 'Erreur mise à jour directeur', code: 'DIRECTOR_UPDATE_ERROR' });
        }
    },

    deleteDirecteur: async (req, res) => {
        try {
            const { id } = req.params;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }
            const directeur = await Directeur.findOne({ where: whereClause });

            if (!directeur) {
                return res.status(404).json({ error: 'Directeur non trouvé', code: 'DIRECTOR_NOT_FOUND' });
            }

            await directeur.destroy();

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'directeurs',
                id_entite_concernee: id,
                type_operation: TypeOperation.SUPPRESSION,
                adresse_ip: req.ip
            });

            res.json({ message: 'Directeur supprimé', code: 'DIRECTOR_DELETED' });
        } catch (error) {
            console.error('Erreur suppression directeur:', error);
            res.status(500).json({ error: 'Erreur suppression directeur', code: 'DIRECTOR_DELETION_ERROR' });
        }
    }
};

module.exports = directeurController;

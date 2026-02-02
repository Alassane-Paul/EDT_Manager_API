// controllers/eleveController.js
const { Eleve, Utilisateur, Classe, LogModification } = require('../database/models');
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

const eleveController = {
    /**
     * Récupérer tous les élèves
     */
    getAllEleves: async (req, res) => {
        try {
            const { page = 1, limit = 100, search, classe_id } = req.query;
            const offset = (page - 1) * limit;
            const whereClause = applyEtablissementScope(req, {});

            if (classe_id) {
                whereClause.classe_id = classe_id;
            }

            if (search) {
                whereClause[Op.or] = [
                    { '$utilisateur.nom$': { [Op.like]: `%${search}%` } },
                    { '$utilisateur.prenom$': { [Op.like]: `%${search}%` } },
                    { matricule: { [Op.like]: `%${search}%` } }
                ];
            }

            const { count, rows: eleves } = await Eleve.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        association: 'utilisateur',
                        attributes: ['id', 'nom', 'prenom', 'email', 'telephone']
                    },
                    {
                        association: 'classe',
                        attributes: ['id', 'nom_classe', 'niveau']
                    }
                ],
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['created_at', 'DESC']]
            });

            res.json({
                eleves,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                },
                code: 'RECUPERATION_STUDENTS_SUCCESS'
            });
        } catch (error) {
            console.error('Erreur récupération élèves:', error);
            res.status(500).json({ error: 'Erreur lors de la récupération des élèves', code: 'RECUPERATION_STUDENTS_ERROR' });
        }
    },

    /**
     * Créer un nouvel élève
     */
    createEleve: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: 'Données invalides', details: errors.array(), code: 'VALIDATION_ERROR' });
            }

            const { utilisateur_id, matricule, classe_id, date_naissance, adresse } = req.body;
            const targetEtablissementId = resolveScopedEtablissementId(req);

            if (!targetEtablissementId) {
                return res.status(400).json({ error: 'Établissement requis', code: 'ESTABLISSEMENT_REQUIRED' });
            }

            // Vérifier le matricule
            const existingEleve = await Eleve.findOne({
                where: { matricule, etablissement_id: targetEtablissementId }
            });

            if (existingEleve) {
                return res.status(409).json({ error: 'Un élève avec ce matricule existe déjà', code: 'STUDENT_MATRICULE_EXISTS' });
            }

            // Vérifier l'utilisateur
            const utilisateur = await Utilisateur.findOne({
                where: { id: utilisateur_id, etablissement_id: targetEtablissementId }
            });

            if (!utilisateur) {
                return res.status(404).json({ error: 'Utilisateur non trouvé', code: 'USER_NOT_FOUND' });
            }

            const eleve = await Eleve.create({
                utilisateur_id,
                matricule,
                classe_id,
                date_naissance,
                adresse,
                etablissement_id: targetEtablissementId
            });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'eleves',
                id_entite_concernee: eleve.id,
                type_operation: TypeOperation.CREATION,
                valeur_apres: { utilisateur_id, matricule, classe_id },
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'Élève créé avec succès', eleve, code: 'STUDENT_CREATED' });
        } catch (error) {
            console.error('Erreur création élève:', error);
            res.status(500).json({ error: 'Erreur lors de la création de l\'élève', code: 'STUDENT_CREATION_ERROR' });
        }
    },

    /**
     * Mettre à jour un élève
     */
    updateEleve: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }

            const eleve = await Eleve.findOne({ where: whereClause });

            if (!eleve) {
                return res.status(404).json({ error: 'Élève non trouvé', code: 'STUDENT_NOT_FOUND' });
            }

            if (updates.matricule && updates.matricule !== eleve.matricule) {
                const existing = await Eleve.findOne({
                    where: { matricule: updates.matricule, etablissement_id: eleve.etablissement_id, id: { [Op.ne]: id } }
                });
                if (existing) {
                    return res.status(409).json({ error: 'Matricule déjà utilisé', code: 'STUDENT_MATRICULE_EXISTS' });
                }
            }

            await eleve.update(updates);

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'eleves',
                id_entite_concernee: id,
                type_operation: TypeOperation.MODIFICATION,
                valeur_apres: updates,
                adresse_ip: req.ip
            });

            res.json({ message: 'Élève mis à jour', eleve, code: 'STUDENT_UPDATED' });
        } catch (error) {
            console.error('Erreur mise à jour élève:', error);
            res.status(500).json({ error: 'Erreur mise à jour élève', code: 'STUDENT_UPDATE_ERROR' });
        }
    },

    /**
     * Supprimer un élève
     */
    deleteEleve: async (req, res) => {
        try {
            const { id } = req.params;
            const whereClause = { id };
            if (!isAdminSystem(req.utilisateur)) {
                whereClause.etablissement_id = req.utilisateur.etablissement_id;
            }

            const eleve = await Eleve.findOne({ where: whereClause });

            if (!eleve) {
                return res.status(404).json({ error: 'Élève non trouvé', code: 'STUDENT_NOT_FOUND' });
            }

            await eleve.destroy();

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'eleves',
                id_entite_concernee: id,
                type_operation: TypeOperation.SUPPRESSION,
                adresse_ip: req.ip
            });

            res.json({ message: 'Élève supprimé', code: 'STUDENT_DELETED' });
        } catch (error) {
            console.error('Erreur suppression élève:', error);
            res.status(500).json({ error: 'Erreur suppression élève', code: 'STUDENT_DELETION_ERROR' });
        }
    }
};

module.exports = eleveController;

const { RessourceCours, Cours, LogModification } = require('../database/models');
const { validationResult } = require('express-validator');
const { TypeOperation } = require('../utils/enums');
const path = require('path');
const fs = require('fs');

const ressourceController = {
    // Liste des ressources d'un cours
    getRessourcesByCours: async (req, res) => {
        try {
            const { cours_id } = req.params;
            const ressources = await RessourceCours.findAll({
                where: { cours_id },
                order: [['date_ajout', 'DESC']]
            });
            res.json({ ressources, code: 'RESSOURCES_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération ressources:', error);
            res.status(500).json({ error: 'Erreur serveur', code: 'RESSOURCES_ERROR' });
        }
    },

    // Ajouter une ressource (avec upload)
    addRessource: async (req, res) => {
        try {
            const { titre, description, type, url, cours_id } = req.body;
            let fileUrl = url;

            // Si un fichier est uploadé, req.file est présent grâce à multer
            if (req.file) {
                // fileUrl hébergé localement ex: /uploads/cours/fichier.pdf
                // On suppose que le middleware upload a mis le fichier dans uploads/
                fileUrl = `/uploads/${req.file.filename}`;
            }

            const enseignant_id = req.utilisateur.enseignant?.id;
            if (!enseignant_id && req.utilisateur.role !== 'admin') {
                return res.status(403).json({ error: 'Non autorisé' });
            }

            const ressource = await RessourceCours.create({
                titre,
                description,
                type: req.file ? 'PDF' : (type || 'AUTRE'), // Simple detection
                url: fileUrl,
                cours_id,
                enseignant_id: enseignant_id || null // Admin might not have teacher ID, care
            });

            await LogModification.create({
                utilisateur_id: req.utilisateur.id,
                table_concernee: 'ressources_cours',
                id_entite_concernee: ressource.id,
                type_operation: TypeOperation.CREATION,
                adresse_ip: req.ip
            });

            res.status(201).json({ message: 'Ressource ajoutée', ressource, code: 'RESSOURCE_CREATED' });
        } catch (error) {
            console.error('Erreur ajout ressource:', error);
            res.status(500).json({ error: 'Erreur ajout ressource', code: 'RESSOURCE_ADD_ERROR' });
        }
    },

    // Supprimer une ressource
    deleteRessource: async (req, res) => {
        try {
            const { id } = req.params;
            const ressource = await RessourceCours.findByPk(id);

            if (!ressource) return res.status(404).json({ error: 'Ressource non trouvée' });

            // Supprimer le fichier physique si local
            if (ressource.url.startsWith('/uploads/')) {
                const filePath = path.join(__dirname, '..', ressource.url);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            await ressource.destroy();
            res.json({ message: 'Ressource supprimée', code: 'RESSOURCE_DELETED' });
        } catch (error) {
            console.error('Erreur suppression ressource:', error);
            res.status(500).json({ error: 'Erreur suppression', code: 'RESSOURCE_DELETE_ERROR' });
        }
    }
};

module.exports = ressourceController;

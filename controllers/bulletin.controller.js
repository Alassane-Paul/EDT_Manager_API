const { Bulletin, Note, Evaluation, Matiere, Eleve, Utilisateur, Classe, Periode, Etablissement, Enseignant, Absence } = require('../database/models');
const { Op } = require('sequelize');

const bulletinController = {
    // Générer un bulletin pour un élève sur une période
    generateBulletin: async (req, res) => {
        try {
            const { eleve_id, periode_id } = req.body;

            // 1. Récupérer toutes les notes de la période
            const notes = await Note.findAll({
                where: { eleve_id },
                include: [{
                    model: Evaluation,
                    as: 'evaluation',
                    where: { periode_id },
                    include: [
                        { model: Matiere, as: 'matiere' },
                        {
                            model: Enseignant,
                            as: 'enseignant',
                            include: [{ model: Utilisateur, as: 'utilisateur', attributes: ['nom', 'prenom'] }]
                        }
                    ]
                }]
            });

            if (notes.length === 0) {
                return res.status(400).json({ error: 'Aucune note trouvée pour cette période' });
            }

            // 2. Grouper par matière et calculer les moyennes
            const matieresStats = {};

            notes.forEach(note => {
                const matId = note.evaluation.matiere.id;
                const matNom = note.evaluation.matiere.nom_matiere;
                const matCoef = note.evaluation.matiere.coefficient || 1; // Coefficient de la matière
                const coef = note.evaluation.coefficient;
                const val = note.valeur; // Note sur 20 ramenée
                const sur = note.evaluation.note_sur;

                // Récupérer le nom du prof (on prend celui de la première note/éval rencontrée pour la matière)
                let profNom = 'N/A';
                if (note.evaluation.enseignant?.utilisateur) {
                    profNom = `${note.evaluation.enseignant.utilisateur.nom.toUpperCase()} ${note.evaluation.enseignant.utilisateur.prenom}`;
                }

                // Normaliser sur 20
                const noteSur20 = (val / sur) * 20;

                if (!matieresStats[matId]) {
                    matieresStats[matId] = {
                        nom: matNom,
                        prof: profNom,
                        coef_matiere: matCoef,
                        totalPoints: 0,
                        totalCoef: 0,
                        notes: []
                    };
                }
                matieresStats[matId].notes.push(noteSur20);
                matieresStats[matId].totalPoints += noteSur20 * coef;
                matieresStats[matId].totalCoef += coef;
            });

            const detailsMatieres = [];
            let someMoyenneGeneralePoints = 0;
            let someMoyenneGeneraleCoefs = 0;

            for (const [matId, stats] of Object.entries(matieresStats)) {
                const moyenneMatiere = stats.totalPoints / stats.totalCoef;
                detailsMatieres.push({
                    matiere_id: matId,
                    nom_matiere: stats.nom,
                    nom_prof: stats.prof,
                    moyenne: parseFloat(moyenneMatiere.toFixed(2)),
                    coef_matiere: stats.coef_matiere,
                    appreciation: ''
                });

                // Utiliser le vrai coefficient de la matière pour la moyenne générale
                someMoyenneGeneralePoints += moyenneMatiere * stats.coef_matiere;
                someMoyenneGeneraleCoefs += stats.coef_matiere;
            }

            console.log('DEBUG BULLETIN GENERATION - Details Matieres:', JSON.stringify(detailsMatieres, null, 2));

            const moyenneGenerale = someMoyenneGeneralePoints / someMoyenneGeneraleCoefs;

            // 3. Sauvegarder/Mettre à jour le bulletin
            // Récupérer l'élève pour connaitre sa classe
            const eleve = await Eleve.findByPk(eleve_id);

            const [bulletin, created] = await Bulletin.findOrCreate({
                where: { eleve_id, periode_id },
                defaults: {
                    classe_id: eleve.classe_id,
                    moyenne_generale: parseFloat(moyenneGenerale.toFixed(2)),
                    details_matieres: detailsMatieres,
                    statut: 'BROUILLON'
                }
            });

            if (!created) {
                await bulletin.update({
                    moyenne_generale: parseFloat(moyenneGenerale.toFixed(2)),
                    details_matieres: detailsMatieres,
                    date_generation: new Date()
                });
            }

            // 4. Calculer le rang de l'élève dans sa classe
            const allBulletins = await Bulletin.findAll({
                where: {
                    classe_id: eleve.classe_id,
                    periode_id
                },
                order: [['moyenne_generale', 'DESC']]
            });

            const rang = allBulletins.findIndex(b => b.id === bulletin.id) + 1;
            const totalEleves = allBulletins.length;

            // 5. Générer une appréciation automatique basée sur la moyenne
            let appreciation = '';
            if (moyenneGenerale >= 16) {
                appreciation = 'Excellent travail. Félicitations pour ces résultats remarquables.';
            } else if (moyenneGenerale >= 14) {
                appreciation = 'Très bon travail. Continuez sur cette lancée.';
            } else if (moyenneGenerale >= 12) {
                appreciation = 'Bon travail. Des efforts soutenus permettront de progresser encore.';
            } else if (moyenneGenerale >= 10) {
                appreciation = 'Travail satisfaisant. Il est nécessaire de fournir plus d\'efforts pour améliorer les résultats.';
            } else {
                appreciation = 'Résultats insuffisants. Un travail régulier et sérieux est indispensable pour progresser.';
            }

            // 6. Compter les absences de l'élève pendant la période
            const periode = await Periode.findByPk(periode_id);

            const absences = await Absence.count({
                where: {
                    eleve_id,
                    date_debut: {
                        [Op.gte]: periode.date_debut
                    },
                    date_fin: {
                        [Op.lte]: periode.date_fin
                    }
                }
            });

            // 7. Générer une appréciation de conduite basée sur les absences
            let appreciationConduite = '';
            if (absences === 0) {
                appreciationConduite = 'Élève assidu et ponctuel. Comportement exemplaire.';
            } else if (absences <= 2) {
                appreciationConduite = 'Bon comportement général. Quelques absences à surveiller.';
            } else if (absences <= 5) {
                appreciationConduite = 'Comportement correct mais trop d\'absences. Plus d\'assiduité est nécessaire.';
            } else {
                appreciationConduite = 'Absences trop nombreuses. L\'assiduité doit impérativement s\'améliorer.';
            }

            // Mettre à jour le bulletin avec le rang, les appréciations et les absences
            await bulletin.update({
                rang,
                appreciation_conseil: appreciation,
                nb_absences: absences,
                appreciation_conduite: appreciationConduite
            });

            res.json({
                message: 'Bulletin généré',
                bulletin: {
                    ...bulletin.toJSON(),
                    rang,
                    appreciation_conseil: appreciation,
                    nb_absences: absences,
                    appreciation_conduite: appreciationConduite
                },
                code: 'BULLETIN_GENERATED'
            });

        } catch (error) {
            console.error('Erreur génération bulletin:', error);
            res.status(500).json({ error: 'Erreur génération', code: 'BULLETIN_GEN_ERROR' });
        }
    },

    getBulletin: async (req, res) => {
        try {
            const { eleve_id, periode_id } = req.query;
            const bulletin = await Bulletin.findOne({
                where: { eleve_id, periode_id },
                include: [
                    { model: Periode, as: 'periode' },
                    {
                        model: Classe,
                        as: 'classe',
                        include: [{ model: Etablissement, as: 'etablissement' }]
                    },
                    { model: Eleve, as: 'eleve', include: ['utilisateur'] }
                ]
            });

            if (!bulletin) {
                return res.json({ bulletin: null, code: 'BULLETIN_NOT_FOUND' });
            }

            // Flatten etablissement for easier access in frontend template
            const bulletinJSON = bulletin.toJSON();
            if (bulletinJSON.classe?.etablissement) {
                bulletinJSON.etablissement = bulletinJSON.classe.etablissement;
            } else {
                // Fallback mock if data missing
                bulletinJSON.etablissement = {
                    nom: "Etablissement Scolaire",
                    annee_scolaire: "2025-2026",
                    telephone: "N/A"
                };
            }

            res.json({ bulletin: bulletinJSON, code: 'BULLETIN_RETRIEVED' });
        } catch (error) {
            console.error('Erreur récupération bulletin:', error);
            res.status(500).json({ error: 'Erreur récupération', code: 'BULLETIN_ERROR' });
        }
    }
};

module.exports = bulletinController;

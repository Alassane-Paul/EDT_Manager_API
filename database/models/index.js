const { sequelize } = require('../../config/database');

// Import de tous les modèles
const Utilisateur = require('./Utilisateur');
const Etablissement = require('./Etablissement');
const Classe = require('./Classe');
const Matiere = require('./Matiere');
const Enseignant = require('./Enseignant');
const Salle = require('./Salle');
const Cours = require('./Cours');
const CreneauCours = require('./CreneauCours');
const EmploiTemps = require('./EmploiTemps');
const Rattrapage = require('./Rattrapage');
const Absence = require('./Absence');
const Disponibilite = require('./Disponibilite');
const Contrainte = require('./Contrainte');
const Notification = require('./Notification');
const Eleve = require('./Eleve');
const Directeur = require('./Directeur');
const ResponsablePedagogique = require('./ResponsablePedagogique');
const { LogConnexion, LogModification } = require('./Log');
const Periode = require('./Periode');
const Evaluation = require('./Evaluation');
const Note = require('./Note');
const Bulletin = require('./Bulletin');
const RessourceCours = require('./RessourceCours');
const SeanceVirtuelle = require('./SeanceVirtuelle');
const ExamenEnLigne = require('./ExamenEnLigne');
const Question = require('./Question');
const ReponseEleve = require('./ReponseEleve');
const TentativeExamen = require('./TentativeExamen');
const SessionExamen = require('./SessionExamen');
const RepartitionSalle = require('./RepartitionSalle');
const Accreditation = require('./Accreditation');

// Messaging models
const Conversation = require('./Conversation');
const ConversationParticipant = require('./ConversationParticipant');
const Message = require('./Message');

// Billing models
const Subscription = require('./Subscription');
const UsageMetric = require('./UsageMetric');
const Invoice = require('./Invoice');
const PricingRule = require('./PricingRule');
const EnseignantMatiere = require('./EnseignantMatiere');
const { Sequelize } = require('sequelize');

// Définition des associations

// ... (existing associations)

// --- Associations Messagerie ---

// Conversation - Utilisateur (Many-to-Many via ConversationParticipant)
Conversation.belongsToMany(Utilisateur, {
  through: ConversationParticipant,
  foreignKey: 'conversation_id',
  otherKey: 'utilisateur_id',
  as: 'participants'
});

Utilisateur.belongsToMany(Conversation, {
  through: ConversationParticipant,
  foreignKey: 'utilisateur_id',
  otherKey: 'conversation_id',
  as: 'conversations'
});

// Direct associations with the join table for easier querying
Conversation.hasMany(ConversationParticipant, {
  foreignKey: 'conversation_id',
  as: 'participants_meta'
});
ConversationParticipant.belongsTo(Conversation, {
  foreignKey: 'conversation_id',
  as: 'conversation'
});
ConversationParticipant.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasMany(ConversationParticipant, {
  foreignKey: 'utilisateur_id',
  as: 'conversation_participations'
});

// Conversation - Message
Conversation.hasMany(Message, {
  foreignKey: 'conversation_id',
  as: 'messages'
});

Message.belongsTo(Conversation, {
  foreignKey: 'conversation_id',
  as: 'conversation'
});

// Message - Utilisateur (Sender)
Message.belongsTo(Utilisateur, {
  foreignKey: 'sender_id',
  as: 'sender'
});

Utilisateur.hasMany(Message, {
  foreignKey: 'sender_id',
  as: 'messages_envoyes'
});


// Définition des associations

// Utilisateur - Etablissement (Existing associations continuing...)

// Utilisateur - Etablissement
Utilisateur.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(Utilisateur, {
  foreignKey: 'etablissement_id',
  as: 'utilisateurs'
});

// Etablissement - Classes
Etablissement.hasMany(Classe, {
  foreignKey: 'etablissement_id',
  as: 'classes'
});
Classe.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Etablissement - Matières
Etablissement.hasMany(Matiere, {
  foreignKey: 'etablissement_id',
  as: 'matieres'
});
Matiere.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Etablissement - Salles
Etablissement.hasMany(Salle, {
  foreignKey: 'etablissement_id',
  as: 'salles'
});
Salle.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Billing Associations
// Etablissement - Subscription
Etablissement.hasMany(Subscription, {
  foreignKey: 'etablissement_id',
  as: 'subscriptions'
});
Subscription.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Etablissement - UsageMetric
Etablissement.hasMany(UsageMetric, {
  foreignKey: 'etablissement_id',
  as: 'usage_metrics'
});
UsageMetric.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Etablissement - Invoice
Etablissement.hasMany(Invoice, {
  foreignKey: 'etablissement_id',
  as: 'invoices'
});
Invoice.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});

// Subscription - Invoice
Subscription.hasMany(Invoice, {
  foreignKey: 'subscription_id',
  as: 'invoices'
});
Invoice.belongsTo(Subscription, {
  foreignKey: 'subscription_id',
  as: 'subscription'
});

// Enseignant - Utilisateur
Enseignant.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasOne(Enseignant, {
  foreignKey: 'utilisateur_id',
  as: 'enseignant'
});

// Enseignant - Etablissement
Enseignant.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(Enseignant, {
  foreignKey: 'etablissement_id',
  as: 'enseignants'
});

// Eleve - Utilisateur
Eleve.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasOne(Eleve, {
  foreignKey: 'utilisateur_id',
  as: 'eleve'
});

// Eleve - Etablissement
Eleve.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(Eleve, {
  foreignKey: 'etablissement_id',
  as: 'eleves'
});

// Directeur - Utilisateur
Directeur.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasOne(Directeur, {
  foreignKey: 'utilisateur_id',
  as: 'directeur'
});

// Directeur - Etablissement
Directeur.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(Directeur, {
  foreignKey: 'etablissement_id',
  as: 'directeurs'
});

// ResponsablePedagogique - Utilisateur
ResponsablePedagogique.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasOne(ResponsablePedagogique, {
  foreignKey: 'utilisateur_id',
  as: 'responsablePedagogique'
});

// ResponsablePedagogique - Etablissement
ResponsablePedagogique.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(ResponsablePedagogique, {
  foreignKey: 'etablissement_id',
  as: 'responsablesPedagogiques'
});

// Eleve - Classe
Eleve.belongsTo(Classe, {
  foreignKey: 'classe_id',
  as: 'classe'
});
Classe.hasMany(Eleve, {
  foreignKey: 'classe_id',
  as: 'eleves'
});

// Enseignant - Matières (Many-to-Many)
// EnseignantMatiere is imported above

Enseignant.belongsToMany(Matiere, {
  through: EnseignantMatiere,
  foreignKey: 'enseignant_id',
  otherKey: 'matiere_id',
  as: 'matieres'
});
Matiere.belongsToMany(Enseignant, {
  through: EnseignantMatiere,
  foreignKey: 'matiere_id',
  otherKey: 'enseignant_id',
  as: 'enseignants'
});

// Cours
Cours.belongsTo(Classe, {
  foreignKey: 'classe_id',
  as: 'classe'
});
Classe.hasMany(Cours, {
  foreignKey: 'classe_id',
  as: 'cours'
});

Cours.belongsTo(Matiere, {
  foreignKey: 'matiere_id',
  as: 'matiere'
});
Matiere.hasMany(Cours, {
  foreignKey: 'matiere_id',
  as: 'cours'
});

Cours.belongsTo(Enseignant, {
  foreignKey: 'enseignant_id',
  as: 'enseignant'
});
Enseignant.hasMany(Cours, {
  foreignKey: 'enseignant_id',
  as: 'cours'
});

Cours.belongsTo(Salle, {
  foreignKey: 'salle_id',
  as: 'salle'
});
Salle.hasMany(Cours, {
  foreignKey: 'salle_id',
  as: 'cours'
});

// EmploiTemps
EmploiTemps.belongsTo(Classe, {
  foreignKey: 'classe_id',
  as: 'classe'
});
Classe.hasMany(EmploiTemps, {
  foreignKey: 'classe_id',
  as: 'emplois_temps'
});

EmploiTemps.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(EmploiTemps, {
  foreignKey: 'etablissement_id',
  as: 'emplois_temps'
});

EmploiTemps.belongsTo(Utilisateur, {
  foreignKey: 'generateur_id',
  as: 'generateur'
});
Utilisateur.hasMany(EmploiTemps, {
  foreignKey: 'generateur_id',
  as: 'emplois_temps_generes'
});

// CreneauCours
CreneauCours.belongsTo(EmploiTemps, {
  foreignKey: 'emploi_temps_id',
  as: 'emploi_temps'
});
EmploiTemps.hasMany(CreneauCours, {
  foreignKey: 'emploi_temps_id',
  as: 'creneaux'
});

CreneauCours.belongsTo(Cours, {
  foreignKey: 'cours_id',
  as: 'cours'
});
Cours.hasMany(CreneauCours, {
  foreignKey: 'cours_id',
  as: 'creneaux'
});

CreneauCours.belongsTo(Salle, {
  foreignKey: 'salle_id',
  as: 'salle'
});
Salle.hasMany(CreneauCours, {
  foreignKey: 'salle_id',
  as: 'creneaux'
});

// Rattrapage
Rattrapage.belongsTo(Cours, {
  foreignKey: 'cours_id',
  as: 'cours'
});
Cours.hasMany(Rattrapage, {
  foreignKey: 'cours_id',
  as: 'rattrapages'
});

Rattrapage.belongsTo(CreneauCours, {
  foreignKey: 'creneau_planifie_id',
  as: 'creneau_planifie'
});
CreneauCours.hasOne(Rattrapage, {
  foreignKey: 'creneau_planifie_id',
  as: 'rattrapage'
});

// Absence
Absence.belongsTo(Enseignant, {
  foreignKey: 'enseignant_id',
  as: 'enseignant'
});
Enseignant.hasMany(Absence, {
  foreignKey: 'enseignant_id',
  as: 'absences'
});

Absence.belongsTo(Cours, {
  foreignKey: 'cours_id',
  as: 'cours'
});
Cours.hasMany(Absence, {
  foreignKey: 'cours_id',
  as: 'absences'
});

Absence.belongsTo(Eleve, {
  foreignKey: 'eleve_id',
  as: 'eleve'
});
Eleve.hasMany(Absence, {
  foreignKey: 'eleve_id',
  as: 'absences'
});

// Disponibilite
Disponibilite.belongsTo(Enseignant, {
  foreignKey: 'enseignant_id',
  as: 'enseignant'
});
Enseignant.hasMany(Disponibilite, {
  foreignKey: 'enseignant_id',
  as: 'disponibilites'
});

// Notification
Notification.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasMany(Notification, {
  foreignKey: 'utilisateur_id',
  as: 'notifications'
});

// Contrainte
Contrainte.belongsTo(Etablissement, {
  foreignKey: 'etablissement_id',
  as: 'etablissement'
});
Etablissement.hasMany(Contrainte, {
  foreignKey: 'etablissement_id',
  as: 'contraintes'
});

// LogConnexion
LogConnexion.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasMany(LogConnexion, {
  foreignKey: 'utilisateur_id',
  as: 'logs_connexion'
});

// LogModification
LogModification.belongsTo(Utilisateur, {
  foreignKey: 'utilisateur_id',
  as: 'utilisateur'
});
Utilisateur.hasMany(LogModification, {
  foreignKey: 'utilisateur_id',
  as: 'logs_modification'
});

// --- Associations Module Notes & Bulletins ---

// Periode - Etablissement
Periode.belongsTo(Etablissement, { foreignKey: 'etablissement_id', as: 'etablissement' });
Etablissement.hasMany(Periode, { foreignKey: 'etablissement_id', as: 'periodes' });

// Evaluation
Evaluation.belongsTo(Matiere, { foreignKey: 'matiere_id', as: 'matiere' });
Evaluation.belongsTo(Classe, { foreignKey: 'classe_id', as: 'classe' });
Evaluation.belongsTo(Enseignant, { foreignKey: 'enseignant_id', as: 'enseignant' });
Evaluation.belongsTo(Periode, { foreignKey: 'periode_id', as: 'periode' });

Matiere.hasMany(Evaluation, { foreignKey: 'matiere_id', as: 'evaluations' });
Classe.hasMany(Evaluation, { foreignKey: 'classe_id', as: 'evaluations' });
Enseignant.hasMany(Evaluation, { foreignKey: 'enseignant_id', as: 'evaluations' });
Periode.hasMany(Evaluation, { foreignKey: 'periode_id', as: 'evaluations' });

// Note
Note.belongsTo(Evaluation, { foreignKey: 'evaluation_id', as: 'evaluation' });
Note.belongsTo(Eleve, { foreignKey: 'eleve_id', as: 'eleve' });

Evaluation.hasMany(Note, { foreignKey: 'evaluation_id', as: 'notes' });
Eleve.hasMany(Note, { foreignKey: 'eleve_id', as: 'notes' });

// Bulletin
Bulletin.belongsTo(Eleve, { foreignKey: 'eleve_id', as: 'eleve' });
Bulletin.belongsTo(Periode, { foreignKey: 'periode_id', as: 'periode' });
Bulletin.belongsTo(Classe, { foreignKey: 'classe_id', as: 'classe' });

Eleve.hasMany(Bulletin, { foreignKey: 'eleve_id', as: 'bulletins' });
Periode.hasMany(Bulletin, { foreignKey: 'periode_id', as: 'bulletins' });
Classe.hasMany(Bulletin, { foreignKey: 'classe_id', as: 'bulletins' });

// --- Associations Module E-Learning ---

// RessourceCours
RessourceCours.belongsTo(Cours, { foreignKey: 'cours_id', as: 'cours' });
RessourceCours.belongsTo(Enseignant, { foreignKey: 'enseignant_id', as: 'enseignant' });

Cours.hasMany(RessourceCours, { foreignKey: 'cours_id', as: 'ressources' });
Enseignant.hasMany(RessourceCours, { foreignKey: 'enseignant_id', as: 'ressources_ajoutees' });

// SeanceVirtuelle
SeanceVirtuelle.belongsTo(Cours, { foreignKey: 'cours_id', as: 'cours' });
Cours.hasMany(SeanceVirtuelle, { foreignKey: 'cours_id', as: 'seances_virtuelles' });

// --- Associations Module Examens en Ligne ---

// ExamenEnLigne
ExamenEnLigne.belongsTo(Cours, { foreignKey: 'cours_id', as: 'cours' });
ExamenEnLigne.belongsTo(Enseignant, { foreignKey: 'enseignant_id', as: 'enseignant' });

Cours.hasMany(ExamenEnLigne, { foreignKey: 'cours_id', as: 'examens' });
Enseignant.hasMany(ExamenEnLigne, { foreignKey: 'enseignant_id', as: 'examens_crees' });

// Question
Question.belongsTo(ExamenEnLigne, { foreignKey: 'examen_id', as: 'examen' });
ExamenEnLigne.hasMany(Question, { foreignKey: 'examen_id', as: 'questions' });

// ReponseEleve
ReponseEleve.belongsTo(ExamenEnLigne, { foreignKey: 'examen_id', as: 'examen' });
ReponseEleve.belongsTo(Eleve, { foreignKey: 'eleve_id', as: 'eleve' });
ReponseEleve.belongsTo(Question, { foreignKey: 'question_id', as: 'question' });

ExamenEnLigne.hasMany(ReponseEleve, { foreignKey: 'examen_id', as: 'reponses' });
Eleve.hasMany(ReponseEleve, { foreignKey: 'eleve_id', as: 'reponses_examens' });
Question.hasMany(ReponseEleve, { foreignKey: 'question_id', as: 'reponses' });

// TentativeExamen
TentativeExamen.belongsTo(ExamenEnLigne, { foreignKey: 'examen_id', as: 'examen' });
TentativeExamen.belongsTo(Eleve, { foreignKey: 'eleve_id', as: 'eleve' });

ExamenEnLigne.hasMany(TentativeExamen, { foreignKey: 'examen_id', as: 'tentatives' });
Eleve.hasMany(TentativeExamen, { foreignKey: 'eleve_id', as: 'tentatives_examens' });

// --- Associations Module Examens Présentiels ---

// SessionExamen
SessionExamen.belongsTo(Matiere, { foreignKey: 'matiere_id', as: 'matiere' });
SessionExamen.belongsTo(Classe, { foreignKey: 'classe_id', as: 'classe' });

Matiere.hasMany(SessionExamen, { foreignKey: 'matiere_id', as: 'sessions_examen' });
Classe.hasMany(SessionExamen, { foreignKey: 'classe_id', as: 'sessions_examen' });

// RepartitionSalle
RepartitionSalle.belongsTo(SessionExamen, { foreignKey: 'session_examen_id', as: 'session' });
RepartitionSalle.belongsTo(Salle, { foreignKey: 'salle_id', as: 'salle' });
RepartitionSalle.belongsTo(Enseignant, { foreignKey: 'surveillant_id', as: 'surveillant' });

SessionExamen.hasMany(RepartitionSalle, { foreignKey: 'session_examen_id', as: 'repartitions' });
Salle.hasMany(RepartitionSalle, { foreignKey: 'salle_id', as: 'repartitions_examen' });
Enseignant.hasMany(RepartitionSalle, { foreignKey: 'surveillant_id', as: 'surveillances' });

// Rattrapage - SessionExamen (pour rattrapages d'examens)
Rattrapage.belongsTo(SessionExamen, { foreignKey: 'session_examen_id', as: 'session_examen' });
SessionExamen.hasMany(Rattrapage, { foreignKey: 'session_examen_id', as: 'rattrapages' });

// --- Accreditations ---
Accreditation.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id', as: 'utilisateur' });
Utilisateur.hasMany(Accreditation, { foreignKey: 'utilisateur_id', as: 'accreditations' });

Accreditation.belongsTo(Etablissement, { foreignKey: 'etablissement_id', as: 'etablissement' });
Etablissement.hasMany(Accreditation, { foreignKey: 'etablissement_id', as: 'accreditations' });

module.exports = {
  Sequelize,
  Utilisateur,
  Etablissement,
  Classe,
  Matiere,
  Enseignant,
  Salle,
  Cours,
  CreneauCours,
  EmploiTemps,
  Rattrapage,
  Absence,
  Disponibilite,
  Contrainte,
  Notification,
  LogConnexion,
  LogModification,
  EnseignantMatiere,
  Eleve,
  Directeur,
  ResponsablePedagogique,
  Periode,
  Evaluation,
  Note,
  Bulletin,
  RessourceCours,
  SeanceVirtuelle,
  ExamenEnLigne,
  Question,
  ReponseEleve,
  TentativeExamen,
  SessionExamen,
  RepartitionSalle,
  Subscription,
  UsageMetric,
  Invoice,
  PricingRule,
  Accreditation,
  Conversation,
  Message,
  ConversationParticipant,
  sequelize
};
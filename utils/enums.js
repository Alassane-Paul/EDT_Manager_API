// Énumérations complètes basées sur les diagrammes
module.exports = {
  // Rôles utilisateurs
  RoleUtilisateur: {
    ADMIN: "admin",
    DIRECTEUR: "directeur",
    RESPONSABLE_PEDAGOGIQUE: "responsable_pedagogique",
    ENSEIGNANT: "enseignant",
    ETUDIANT: "etudiant",
    PERSONNEL: "personnel"
  },

  StatutUtilisateur: {
    ACTIVE: "active",
    INACTIF: "inactif",
    EN_ATTENTE: "en_attente",
    SUSPENDU: "suspendu"
  },

  TypeEtablissement: {
    ECOLE_PRIMAIRE: "ecole_primaire",
    COLLEGE: "college",
    LYCEE: "lycee",
    UNIVERSITE: "universite",
    INSTITUT: "institut"
  },
  StatutEtablissement: {
    ACTIF: "actif",
    INACTIF: "inactif",
    SUSPENDU: "suspendu",
    ARCHIVE: "archive",
  },

  // Billing & Subscriptions
  PlanType: {
    TRIAL: "trial",
    BASIC: "basic",
    PREMIUM: "premium",
    ENTERPRISE: "enterprise"
  },

  StatutSubscription: {
    ACTIVE: "active",
    SUSPENDED: "suspended",
    CANCELLED: "cancelled",
    EXPIRED: "expired"
  },

  StatutInvoice: {
    DRAFT: "draft",
    PENDING: "pending",
    PAID: "paid",
    OVERDUE: "overdue",
    CANCELLED: "cancelled"
  },

  TypeMetrique: {
    USER: "user",
    CLASS: "class",
    COURSE: "course",
    STORAGE: "storage",
    TIMETABLE: "timetable"
  },
  CategorieMatiere: {
    FONDAMENTALE: "fondamentale",
    COMPLEMENTAIRE: "complementaire",
    OPTION: "option",
    ARTISTIQUE: "artistique",
    SPORTIVE: "sportive"
  },
  TypeGroupe: {
    TD: "td",
    TP: "tp",
    OPTION: "option",
    SOUTIEN: "soutien"
  },

  TypeCours: {
    COURS_MAGISTRAL: "cours_magistral",
    TD: "td",
    TP: "tp",
    ATELIER: "atelier"
  },
  // Statuts
  StatutClasse: {
    ACTIVE: "active",
    ARCHIVEE: "archivee"
  },


  StatutEmploiTemps: {
    BROUILLON: "brouillon",
    EN_COURS: "en_cours",
    VALIDE: "valide",
    PUBLIE: "publie",
    ARCHIVE: "archive"
  },

  StatutCreneau: {
    PLANIFIE: "planifie",
    CONFIRME: "confirme",
    ANNULE: "annule"
  },

  StatutRattrapage: {
    DEMANDE: "demande",
    VALIDE: "valide",
    REFUSE: "refuse",
    PLANIFIE: "planifie",
    REALISE: "realise",
    ANNULE: "annule"
  },

  StatutProfessionnel: {
    TITULAIRE: "titulaire",
    CONTRACTUEL: "contractuel",
    VACATAIRE: "vacataire"
  },
  PreferenceHoraire: {
    MATIN: "matin",
    APRES_MIDI: "apres_midi",
    INDIFFERENT: "indifferent"
  },
  StatutAbsence: {
    DECLAREE: "declaree",
    VALIDEE: "validee",
    REFUSEE: "refusee"
  },
  TypeDisponibilite: {
    DISPONIBLE: "disponible",
    INDISPONIBLE: "indisponible",
    PREFERENCE: "preference"
  },
  StatutSalle: {
    DISPONIBLE: "disponible",
    MAINTENANCE: "maintenance",
    HORS_SERVICE: "hors_service"
  },

  // Types




  TypeSalle: {
    STANDARD: "standard",
    LABORATOIRE: "laboratoire",
    GYMNASE: "gymnase",
    AMPHITHEATRE: "amphitheatre",
    ATELIER: "atelier",
    INFORMATIQUE: "informatique",
    MUSIQUE: "musique",
    ARTS: "arts"
  },

  TypeRattrapage: {
    COURS_ANNULE: "cours_annule",
    SOUTIEN: "soutien",
    PREPARATION_EXAMEN: "preparation_examen",
    TUTORAT: "tutorat",
    EXAMEN: "examen"
  },
  TypeContrainte: {
    DURE: "cours_annule",
    SOUPLE: "soutien",
  },
  CategorieContrainte: {
    TEMPORELLE: "temporelle",
    RESSOURCE: "ressource",
    PEDAGOGIQUE: "pedagogique",
    REGLEMENTAIRE: "reglementaire",
  },
  PrioriteContrainte: {
    BASSE: "1",
    MOYENNE: "2",
    HAUTE: "3",
  },
  PrioriteNotification: {
    BASSE: "basse",
    NORMALE: "normale",
    HAUTE: "haute",
    CRITIQUE: "critique",
  },
  TypeNotification: {
    INFO: "info",
    ALERTE: "alerte",
    URGENCE: "urgence",
    RAPPEL: "rappel",
    RATTRAPAGE: "rattrapage",
    EMPLOI_TEMPS: "emploi_temps",
    ABSENCE: "absence"
  },
  CanalNotification: {
    IN_APP: "in_app",
    EMAIL: "email",
    SMS: "sms",
    PUSH: "push",
    TOUS: "tous"
  },
  StatutConnexion: {
    SUCCES: "succes",
    ECHEC: "echec",
    BLOQUE: 'bloque'
  },
  TypeOperation: {
    CREATION: "creation",
    MODIFICATION: "modification",
    SUPPERSSION: "suppression",
  },

  // Jours
  JourSemaine: {
    LUNDI: "lundi",
    MARDI: "mardi",
    MERCREDI: "mercredi",
    JEUDI: "jeudi",
    VENDREDI: "vendredi",
    SAMEDI: "samedi",
    DIMANCHE: "dimanche"
  },

  // Algorithmes
  ModeGeneration: {
    RAPIDE: "rapide",
    EQUILIBRE: "equilibre",
    OPTIMAL: "optimal"
  },

  // Formats
  FormatExport: {
    PDF: "pdf",
    EXCEL: "excel",
    ICAL: "ical",
    CSV: "csv",
    JSON: "json"
  }
};
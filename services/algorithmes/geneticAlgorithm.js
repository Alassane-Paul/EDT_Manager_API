// services/algorithmes/geneticAlgorithm.js
const { JourSemaine, TypeCours, TypeSalle, TypeEtablissement } = require('../../utils/enums');

class GeneticAlgorithm {
  /**
   * Algorithme génétique pour la génération d'emploi du temps
   * Optimisation basée sur l'évolution d'une population de solutions
   */
  constructor() {
    this.populationSize = 100;
    this.generationCount = 1000;
    this.mutationRate = 0.1;
    this.crossoverRate = 0.8;
    this.elitismCount = 10;
    this.population = [];
    this.bestSolution = null;
    this.fitnessHistory = [];
  }

  /**
   * Générer un emploi du temps avec l'algorithme génétique
   */
  async generer(donnees) {
    console.log('Début génération algorithme génétique...');

    this.donnees = donnees;
    const debut = Date.now();

    // Initialiser la population
    this.initialiserPopulation();

    // Évoluer la population
    for (let generation = 0; generation < this.generationCount; generation++) {
      this.evaluerPopulation();
      this.selectionner();
      this.croiser();
      this.muter();

      if (generation % 100 === 0) {
        console.log(`Génération ${generation}, meilleur score: ${this.bestSolution.fitness}`);
      }
    }

    const duree = Date.now() - debut;
    console.log(`Solution génétique trouvée en ${duree}ms`);

    return this.formaterSolution();
  }

  /**
   * Initialiser la population avec des solutions aléatoires
   */
  initialiserPopulation() {
    this.population = [];

    for (let i = 0; i < this.populationSize; i++) {
      const individu = this.creerIndividuAleatoire();
      this.population.push(individu);
    }
  }

  /**
   * Créer un individu aléatoire
   */
  creerIndividuAleatoire() {
    const creneaux = [];
    const jours = Object.values(JourSemaine).slice(0, 5);
    const creneauxHoraires = this.genererCreneauxHoraires();

    this.donnees.cours.forEach(cours => {
      const volHebdo = cours.volume_horaire_hebdo || 0;
      const dureeStd = cours.matiere?.duree_standard || 60;
      const nombreSeances = Math.ceil(volHebdo / dureeStd);

      for (let i = 0; i < nombreSeances; i++) {
        // Choisir aléatoirement un jour, un créneau et une salle
        const jour = jours[Math.floor(Math.random() * jours.length)];
        const creneauHoraire = creneauxHoraires[Math.floor(Math.random() * creneauxHoraires.length)];

        if (!creneauHoraire) continue;

        const sallesCompatibles = this.getCompatibleSalles(cours);
        let salle = null;

        // Logique de priorité des salles demandée par l'utilisateur
        // 1. Priorité à la salle spécifique du cours si elle existe
        if (cours.salle_id) {
          salle = sallesCompatibles.find(s => s.id === cours.salle_id);
        }

        // 2. Sinon, priorité à la salle principale de la classe (si compatible)
        if (!salle && cours.classe?.salle_principale) {
          salle = sallesCompatibles.find(s =>
            s.nom_salle === cours.classe.salle_principale ||
            s.id === cours.classe.salle_principale
          );
        }

        // 3. Fallback sur une salle aléatoire parmi les compatibles
        if (!salle && sallesCompatibles.length > 0) {
          salle = sallesCompatibles[Math.floor(Math.random() * sallesCompatibles.length)];
        }

        creneaux.push({
          cours_id: cours.id,
          matiere_nom: cours.matiere?.nom_matiere || "Matière",
          couleur: cours.matiere?.couleur_affichage,
          salle_id: salle?.id,
          salle_nom: salle?.nom_salle || "Sans salle",
          jour_semaine: jour,
          heure_debut: creneauHoraire.heure_debut,
          heure_fin: creneauHoraire.heure_fin,
          duree: dureeStd,
          enseignant_id: cours.enseignant?.id,
          enseignant_nom: cours.enseignant ? `${cours.enseignant.utilisateur?.prenom || ""} ${cours.enseignant.utilisateur?.nom || ""}`.trim() : "Non assigné",
          classe_id: cours.classe_id,
          type_cours: cours.matiere?.type_cours
        });
      }
    });

    return { creneaux, fitness: 0 };
  }

  /**
   * Générer les créneaux horaires disponibles
   */
  genererCreneauxHoraires() {
    const etablissement = this.donnees.etablissement;
    const hDebutStr = etablissement?.heure_debut_journee || "08:00";
    const hFinStr = etablissement?.heure_fin_journee || "18:00";
    const dureeUnite = etablissement?.duree_cours_standard || 60;

    const hDebut = this.heureEnMinutes(hDebutStr);
    const hFin = this.heureEnMinutes(hFinStr);

    const creneaux = [];

    for (let heure = hDebut; heure <= hFin - dureeUnite; heure += dureeUnite) {
      const heures = Math.floor(heure / 60);
      const minutes = heure % 60;
      const heureDebutStr = `${heures.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      const heureFinCalc = heure + dureeUnite;
      const heuresFin = Math.floor(heureFinCalc / 60);
      const minutesFin = heureFinCalc % 60;
      const heureFinStr = `${heuresFin.toString().padStart(2, '0')}:${minutesFin.toString().padStart(2, '0')}`;

      creneaux.push({
        heure_debut: heureDebutStr,
        heure_fin: heureFinStr,
        duree: dureeUnite
      });
    }

    return creneaux;
  }

  /**
   * Filtrer les salles compatibles avec un cours
   */
  getCompatibleSalles(cours) {
    if (!cours || !cours.matiere) return this.donnees.salles || [];

    const typeCours = cours.matiere.type_cours;
    const effectif = cours.classe?.effectif || 0;
    const etablissementType = this.donnees.etablissement?.type;

    // Filtre par capacité
    let compatibles = this.donnees.salles.filter(s => s.capacite >= effectif);
    if (compatibles.length === 0) compatibles = this.donnees.salles;

    // Mapping par type de cours
    const mapping = {
      [TypeCours.TP]: [TypeSalle.LABORATOIRE, TypeSalle.INFORMATIQUE, TypeSalle.ATELIER],
      [TypeCours.TD]: [TypeSalle.STANDARD, TypeSalle.ATELIER],
      [TypeCours.COURS_MAGISTRAL]: [TypeSalle.AMPHITHEATRE, TypeSalle.STANDARD],
      [TypeCours.ATELIER]: [TypeSalle.ATELIER, TypeSalle.STANDARD]
    };

    // Si École Primaire, on privilégie le standard
    if (etablissementType === TypeEtablissement.ECOLE_PRIMAIRE) {
      const standardSalles = compatibles.filter(s => s.type_salle === TypeSalle.STANDARD);
      return standardSalles.length > 0 ? standardSalles : compatibles;
    }

    const typesAutorises = mapping[typeCours] || [TypeSalle.STANDARD];
    const strictementCompatibles = compatibles.filter(s => typesAutorises.includes(s.type_salle));

    return strictementCompatibles.length > 0 ? strictementCompatibles : compatibles;
  }

  /**
   * Évaluer la fitness de chaque individu
   */
  evaluerPopulation() {
    let bestFitness = -Infinity;

    this.population.forEach(individu => {
      individu.fitness = this.calculerFitness(individu);

      if (individu.fitness > bestFitness) {
        bestFitness = individu.fitness;
        // Deep clone pour éviter les mutations par référence
        this.bestSolution = {
          ...individu,
          creneaux: individu.creneaux.map(c => ({ ...c }))
        };
      }
    });

    this.fitnessHistory.push(bestFitness);
  }

  /**
   * Calculer la fitness d'un individu
   */
  calculerFitness(individu) {
    let score = 1000; // Score de base

    // Pénalités pour les contraintes violées
    const penalites = this.calculerPenalites(individu);
    score -= penalites.total;

    // Bonus pour les bonnes caractéristiques
    const bonus = this.calculerBonus(individu);
    score += bonus.total;

    return Math.max(0, score);
  }

  /**
   * Calculer les pénalités pour les contraintes violées
   */
  calculerPenalites(individu) {
    let totalPenalites = 0;
    const details = {};

    // Pénalité pour les conflits de salles
    const conflitsSalle = this.detecterConflitsSalle(individu);
    details.conflitsSalle = conflitsSalle.length;
    totalPenalites += conflitsSalle.length * 50;

    // Pénalité pour les conflits d'enseignants
    const conflitsEnseignant = this.detecterConflitsEnseignant(individu);
    details.conflitsEnseignant = conflitsEnseignant.length;
    totalPenalites += conflitsEnseignant.length * 50;

    // Pénalité pour les conflits de classes
    const conflitsClasse = this.detecterConflitsClasse(individu);
    details.conflitsClasse = conflitsClasse.length;
    totalPenalites += conflitsClasse.length * 50;

    // Pénalité pour les conflits externes (déjà planifiés)
    const conflitsExternes = this.detecterConflitsExternes(individu);
    details.conflitsExternes = conflitsExternes.length;
    totalPenalites += conflitsExternes.length * 150; // Contrainte dure

    // Pénalité pour les préférences horaires non respectées
    const preferencesNonRespectees = this.verifierPreferencesHoraires(individu);
    details.preferencesNonRespectees = preferencesNonRespectees;
    totalPenalites += preferencesNonRespectees * 10;

    // Pénalité pour les cours consécutifs excessifs
    const coursConsecutifsExcessifs = this.verifierCoursConsecutifs(individu);
    details.coursConsecutifsExcessifs = coursConsecutifsExcessifs;
    totalPenalites += coursConsecutifsExcessifs * 20;

    // Pénalité pour incompatibilité de type de salle ou capacité
    const incompatibilitesSalle = this.verifierIncompatibilitesSalle(individu);
    details.incompatibilitesSalle = incompatibilitesSalle;
    totalPenalites += incompatibilitesSalle * 50;

    // Pénalité pour non-respect des disponibilités enseignants
    const indisponibilitesEnseignants = this.verifierDisponibilitesEnseignants(individu);
    details.indisponibilitesEnseignants = indisponibilitesEnseignants;
    totalPenalites += indisponibilitesEnseignants * 150; // Contrainte dure

    // Pénalité pour non-respect des préférences spécifiques
    const preferencesSpecifiques = this.verifierPreferencesSpecifiques(individu);
    details.preferencesSpecifiques = preferencesSpecifiques;
    totalPenalites += preferencesSpecifiques * 20; // Contrainte souple

    return { total: totalPenalites, details };
  }

  /**
   * Vérifier les disponibilités des enseignants
   */
  verifierDisponibilitesEnseignants(individu) {
    let violations = 0;

    individu.creneaux.forEach(creneau => {
      const enseignant = this.donnees.enseignants.find(e => e.id === creneau.enseignant_id);
      if (!enseignant || !enseignant.disponibilites || enseignant.disponibilites.length === 0) return;

      const dispoJour = enseignant.disponibilites.filter(d => d.jour_semaine === creneau.jour_semaine);
      if (dispoJour.length === 0) {
        // Si aucun créneau de dispo n'est défini pour ce jour, 
        // on considère qu'il est dispo par défaut (sauf si un autre système est préféré)
        return;
      }

      const debutCreneau = this.heureEnMinutes(creneau.heure_debut);
      const finCreneau = this.heureEnMinutes(creneau.heure_fin);

      // Vérifier les indisponibilités (Prioritaires)
      const aIndisponibilite = dispoJour.some(d => {
        if (d.type !== 'indisponible') return false;
        const dDebut = this.heureEnMinutes(d.heure_debut);
        const dFin = this.heureEnMinutes(d.heure_fin);
        return (debutCreneau < dFin && finCreneau > dDebut);
      });

      if (aIndisponibilite) {
        violations++;
        return;
      }

      // Vérifier si le créneau est couvert par une période "disponible"
      // Note: On ne fait ça que si au moins une période "disponible" est définie pour l'enseignant
      const periodesDisponibles = dispoJour.filter(d => d.type === 'disponible');
      if (periodesDisponibles.length > 0) {
        const estCouvert = periodesDisponibles.some(d => {
          const dDebut = this.heureEnMinutes(d.heure_debut);
          const dFin = this.heureEnMinutes(d.heure_fin);
          return (debutCreneau >= dDebut && finCreneau <= dFin);
        });

        if (!estCouvert) {
          violations++;
        }
      }
    });

    return violations;
  }

  /**
   * Vérifier les préférences spécifiques (Bonus/Pénalité souple)
   */
  verifierPreferencesSpecifiques(individu) {
    let violations = 0;
    individu.creneaux.forEach(creneau => {
      const enseignant = this.donnees.enseignants.find(e => e.id === creneau.enseignant_id);
      if (!enseignant || !enseignant.disponibilites) return;

      const dispoJour = enseignant.disponibilites.filter(d => d.jour_semaine === creneau.jour_semaine);
      const periodesPreferences = dispoJour.filter(d => d.type === 'preference');

      if (periodesPreferences.length > 0) {
        const debutCreneau = this.heureEnMinutes(creneau.heure_debut);
        const finCreneau = this.heureEnMinutes(creneau.heure_fin);

        const estDansPreference = periodesPreferences.some(d => {
          const dDebut = this.heureEnMinutes(d.heure_debut);
          const dFin = this.heureEnMinutes(d.heure_fin);
          return (debutCreneau >= dDebut && finCreneau <= dFin);
        });

        if (!estDansPreference) {
          violations++;
        }
      }
    });

    return violations;
  }

  /**
   * Vérifier les incompatibilités de salles (type et capacité)
   */
  verifierIncompatibilitesSalle(individu) {
    let violations = 0;
    individu.creneaux.forEach(creneau => {
      const cours = this.donnees.cours.find(c => c.id === creneau.cours_id);
      if (cours) {
        const sallesCompatibles = this.getCompatibleSalles(cours);
        if (!sallesCompatibles.some(s => s.id === creneau.salle_id)) {
          violations++;
        }
      }
    });
    return violations;
  }

  /**
   * Détecter les conflits de salles
   */
  detecterConflitsSalle(individu) {
    const conflits = [];

    for (let i = 0; i < individu.creneaux.length; i++) {
      for (let j = i + 1; j < individu.creneaux.length; j++) {
        const c1 = individu.creneaux[i];
        const c2 = individu.creneaux[j];

        if (c1.salle_id === c2.salle_id &&
          c1.jour_semaine === c2.jour_semaine &&
          this.creneauxSeChevauchent(c1, c2)) {
          conflits.push({ creneau1: c1, creneau2: c2, type: 'salle' });
        }
      }
    }

    return conflits;
  }

  /**
   * Détecter les conflits d'enseignants
   */
  detecterConflitsEnseignant(individu) {
    const conflits = [];

    for (let i = 0; i < individu.creneaux.length; i++) {
      for (let j = i + 1; j < individu.creneaux.length; j++) {
        const c1 = individu.creneaux[i];
        const c2 = individu.creneaux[j];

        if (c1.enseignant_id === c2.enseignant_id &&
          c1.jour_semaine === c2.jour_semaine &&
          this.creneauxSeChevauchent(c1, c2)) {
          conflits.push({ creneau1: c1, creneau2: c2, type: 'enseignant' });
        }
      }
    }

    return conflits;
  }

  /**
   * Détecter les conflits de classes
   */
  detecterConflitsClasse(individu) {
    const conflits = [];

    for (let i = 0; i < individu.creneaux.length; i++) {
      for (let j = i + 1; j < individu.creneaux.length; j++) {
        const c1 = individu.creneaux[i];
        const c2 = individu.creneaux[j];

        if (c1.classe_id === c2.classe_id &&
          c1.jour_semaine === c2.jour_semaine &&
          this.creneauxSeChevauchent(c1, c2)) {
          conflits.push({ creneau1: c1, creneau2: c2, type: 'classe' });
        }
      }
    }

    return conflits;
  }

  /**
   * Détecter les conflits avec des créneaux déjà existants dans la base
   */
  detecterConflitsExternes(individu) {
    if (!this.donnees.creneauxExistants || this.donnees.creneauxExistants.length === 0) return [];

    const conflits = [];

    individu.creneaux.forEach(c1 => {
      this.donnees.creneauxExistants.forEach(c2 => {
        if (c1.jour_semaine === c2.jour_semaine && this.creneauxSeChevauchentAvecTemps(c1.heure_debut, c1.heure_fin, c2.heure_debut, c2.heure_fin)) {
          // Conflit d'enseignant
          if (c1.enseignant_id === c2.cours?.enseignant_id) {
            conflits.push({ type: 'externe-enseignant', creneau: c1 });
          }
          // Conflit de salle
          if (c1.salle_id === c2.salle_id) {
            conflits.push({ type: 'externe-salle', creneau: c1 });
          }
        }
      });
    });

    return conflits;
  }

  /**
   * Vérifier si deux plages horaires se chevauchent
   */
  creneauxSeChevauchentAvecTemps(deb1, fin1, deb2, fin2) {
    const d1 = this.heureEnMinutes(deb1);
    const f1 = this.heureEnMinutes(fin1);
    const d2 = this.heureEnMinutes(deb2);
    const f2 = this.heureEnMinutes(fin2);
    return (d1 < f2 && f1 > d2);
  }

  /**
   * Vérifier les préférences horaires
   */
  verifierPreferencesHoraires(individu) {
    let violations = 0;

    individu.creneaux.forEach(creneau => {
      const cours = this.donnees.cours.find(c => c.id === creneau.cours_id);
      if (cours && cours.enseignant.preference_horaire !== 'indifferent') {
        const heure = this.heureEnMinutes(creneau.heure_debut);
        const estMatin = heure >= 8 * 60 && heure < 12 * 60;
        const estApresMidi = heure >= 13 * 60 && heure < 18 * 60;

        if (cours.enseignant.preference_horaire === 'matin' && !estMatin) {
          violations++;
        } else if (cours.enseignant.preference_horaire === 'apres_midi' && !estApresMidi) {
          violations++;
        }
      }
    });

    return violations;
  }

  /**
   * Vérifier les cours consécutifs excessifs
   */
  verifierCoursConsecutifs(individu) {
    let violations = 0;
    const enseignants = new Map();

    // Grouper les créneaux par enseignant et par jour
    individu.creneaux.forEach(creneau => {
      const key = `${creneau.enseignant_id}-${creneau.jour_semaine}`;
      if (!enseignants.has(key)) {
        enseignants.set(key, []);
      }
      enseignants.get(key).push(creneau);
    });

    // Vérifier chaque enseignant
    for (const [key, creneaux] of enseignants) {
      // Trier par heure
      creneaux.sort((a, b) => this.heureEnMinutes(a.heure_debut) - this.heureEnMinutes(b.heure_debut));

      let sequenceActuelle = 1;
      for (let i = 1; i < creneaux.length; i++) {
        const heurePrecedente = this.heureEnMinutes(creneaux[i - 1].heure_fin);
        const heureActuelle = this.heureEnMinutes(creneaux[i].heure_debut);

        if (heureActuelle - heurePrecedente <= 15) { // 15 minutes de pause max
          sequenceActuelle++;
        } else {
          sequenceActuelle = 1;
        }

        const enseignant = this.donnees.enseignants.find(e => e.id === creneaux[i].enseignant_id);
        if (enseignant && sequenceActuelle > enseignant.cours_consecutifs_max) {
          violations++;
        }
      }
    }

    return violations;
  }

  /**
   * Calculer les bonus pour les bonnes caractéristiques
   */
  calculerBonus(individu) {
    let totalBonus = 0;
    const details = {};

    // Bonus pour l'équilibre de la charge
    const equilibreCharge = this.calculerEquilibreCharge(individu);
    details.equilibreCharge = equilibreCharge;
    totalBonus += equilibreCharge;

    // Bonus pour la répartition des cours
    const repartitionCours = this.calculerRepartitionCours(individu);
    details.repartitionCours = repartitionCours;
    totalBonus += repartitionCours;

    // Bonus pour l'utilisation optimale des salles
    const utilisationSalles = this.calculerUtilisationSalles(individu);
    details.utilisationSalles = utilisationSalles;
    totalBonus += utilisationSalles;

    // Bonus pour la continuité des enseignants (éviter les trous et changements de salle)
    const continuite = this.calculerContinuiteEnseignants(individu);
    details.continuite = continuite;
    totalBonus += continuite;

    // Bonus pour la stabilité des salles
    const stabiliteSalles = this.calculerStabiliteSalles(individu);
    details.stabiliteSalles = stabiliteSalles;
    totalBonus += stabiliteSalles;

    // Bonus pour le respect des salles préférées (classe/cours)
    const respectSalles = this.calculerRespectSallesPreferrees(individu);
    details.respectSalles = respectSalles;
    totalBonus += respectSalles;

    return { total: totalBonus, details };
  }

  /**
   * Calculer l'équilibre de la charge
   */
  calculerEquilibreCharge(individu) {
    const chargeEnseignants = new Map();

    // Compter les heures par enseignant
    individu.creneaux.forEach(creneau => {
      const duree = creneau.duree / 60; // Convertir en heures
      chargeEnseignants.set(
        creneau.enseignant_id,
        (chargeEnseignants.get(creneau.enseignant_id) || 0) + duree
      );
    });

    // Calculer la variance
    const charges = Array.from(chargeEnseignants.values());
    if (charges.length === 0) return 0;

    const moyenne = charges.reduce((a, b) => a + b, 0) / charges.length;
    const variance = charges.reduce((acc, charge) => acc + Math.pow(charge - moyenne, 2), 0) / charges.length;

    // Bonus inversement proportionnel à la variance
    return Math.max(0, 50 - (variance * 10));
  }

  /**
   * Calculer la répartition des cours
   */
  calculerRepartitionCours(individu) {
    const coursParJour = new Map();

    individu.creneaux.forEach(creneau => {
      coursParJour.set(
        creneau.jour_semaine,
        (coursParJour.get(creneau.jour_semaine) || 0) + 1
      );
    });

    // Calculer l'écart-type
    const valeurs = Array.from(coursParJour.values());
    if (valeurs.length === 0) return 0;

    const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    const ecartType = Math.sqrt(
      valeurs.reduce((acc, val) => acc + Math.pow(val - moyenne, 2), 0) / valeurs.length
    );

    // Bonus inversement proportionnel à l'écart-type
    return Math.max(0, 30 - (ecartType * 5));
  }

  /**
   * Calculer l'utilisation des salles
   */
  calculerUtilisationSalles(individu) {
    const utilisation = new Map();

    individu.creneaux.forEach(creneau => {
      utilisation.set(creneau.salle_id, (utilisation.get(creneau.salle_id) || 0) + 1);
    });

    const sallesUtilisees = utilisation.size;
    const sallesTotales = this.donnees.salles.length;
    const tauxUtilisation = (sallesUtilisees / sallesTotales) * 100;

    // Bonus pour un taux d'utilisation entre 60% et 90%
    if (tauxUtilisation >= 60 && tauxUtilisation <= 90) {
      return 20;
    } else if (tauxUtilisation > 90) {
      return 10; // Légèrement trop utilisé
    } else {
      return 0; // Sous-utilisé
    }
  }

  /**
   * Calculer la continuité pour les enseignants (regrouper les cours)
   */
  calculerContinuiteEnseignants(individu) {
    let bonus = 0;
    const planningParEnseignant = new Map();

    // Organiser par enseignant et par jour
    individu.creneaux.forEach(creneau => {
      const key = `${creneau.enseignant_id}_${creneau.jour_semaine}`;
      if (!planningParEnseignant.has(key)) planningParEnseignant.set(key, []);
      planningParEnseignant.get(key).push(creneau);
    });

    planningParEnseignant.forEach(creneaux => {
      // Trier par heure de début
      creneaux.sort((a, b) => this.heureEnMinutes(a.heure_debut) - this.heureEnMinutes(b.heure_debut));

      for (let i = 0; i < creneaux.length - 1; i++) {
        const c1 = creneaux[i];
        const c2 = creneaux[i + 1];

        // Si consécutifs dans le temps
        if (c1.heure_fin === c2.heure_debut) {
          bonus += 15; // Bonus significatif pour l'attachement

          // Si en plus c'est la même salle
          if (c1.salle_id === c2.salle_id) {
            bonus += 10;
          }
        } else {
          // Si pas consécutifs, vérifier l'écart
          const ecart = this.heureEnMinutes(c2.heure_debut) - this.heureEnMinutes(c1.heure_fin);
          if (ecart <= 60) {
            bonus += 5; // Petit bonus si le trou est court
          }
        }
      }
    });

    return bonus;
  }

  /**
   * Calculer la stabilité des salles (éviter les changements inutiles)
   */
  calculerStabiliteSalles(individu) {
    let bonus = 0;
    const sallesParEnseignantJour = new Map();

    individu.creneaux.forEach(creneau => {
      const key = `${creneau.enseignant_id}_${creneau.jour_semaine}`;
      if (!sallesParEnseignantJour.has(key)) sallesParEnseignantJour.set(key, new Set());
      sallesParEnseignantJour.get(key).add(creneau.salle_id);
    });

    sallesParEnseignantJour.forEach(salles => {
      // Si l'enseignant n'utilise qu'une seule salle dans la journée, bonus max
      if (salles.size === 1) {
        bonus += 10;
      }
    });

    return bonus;
  }

  /**
   * Calculer le respect des salles préférées (Salles spécifiques cours/classe)
   */
  calculerRespectSallesPreferrees(individu) {
    let bonus = 0;

    individu.creneaux.forEach(creneau => {
      // Retrouver le cours original
      const coursOrig = this.donnees.cours.find(c => c.id === creneau.cours_id);
      if (!coursOrig) return;

      // 1. Si salle spécifique au cours
      if (coursOrig.salle_id) {
        if (creneau.salle_id === coursOrig.salle_id) {
          bonus += 15; // Bonus fort car c'est une demande explicite
        }
      }
      // 2. Sinon si salle principale de la classe
      else if (coursOrig.classe?.salle_principale) {
        if (creneau.salle_nom === coursOrig.classe.salle_principale || creneau.salle_id === coursOrig.classe.salle_principale) {
          bonus += 10; // Bonus pour la salle de classe
        }
      }
    });

    return bonus;
  }

  /**
   * Vérifier si deux créneaux se chevauchent
   */
  creneauxSeChevauchent(creneau1, creneau2) {
    if (creneau1.jour_semaine !== creneau2.jour_semaine) return false;

    const debut1 = this.heureEnMinutes(creneau1.heure_debut);
    const fin1 = this.heureEnMinutes(creneau1.heure_fin);
    const debut2 = this.heureEnMinutes(creneau2.heure_debut);
    const fin2 = this.heureEnMinutes(creneau2.heure_fin);

    return (debut1 < fin2 && fin1 > debut2);
  }

  /**
   * Convertir une heure en minutes
   */
  heureEnMinutes(heure) {
    const [heures, minutes] = heure.split(':').map(Number);
    return heures * 60 + minutes;
  }

  /**
   * Sélectionner les individus pour la reproduction (tournoi)
   */
  selectionner() {
    const nouvellePopulation = [];

    // Élitisme : garder les meilleurs individus
    const populationTrie = [...this.population].sort((a, b) => b.fitness - a.fitness);
    for (let i = 0; i < this.elitismCount; i++) {
      nouvellePopulation.push(populationTrie[i]);
    }

    // Compléter avec la sélection par tournoi
    while (nouvellePopulation.length < this.populationSize) {
      const individu1 = this.selectionTournoi();
      const individu2 = this.selectionTournoi();
      nouvellePopulation.push(individu1);

      if (nouvellePopulation.length < this.populationSize) {
        nouvellePopulation.push(individu2);
      }
    }

    this.population = nouvellePopulation;
  }

  /**
   * Sélection par tournoi
   */
  selectionTournoi(tournoiSize = 5) {
    let meilleurIndividu = null;

    for (let i = 0; i < tournoiSize; i++) {
      const individu = this.population[Math.floor(Math.random() * this.population.length)];

      if (!meilleurIndividu || individu.fitness > meilleurIndividu.fitness) {
        meilleurIndividu = individu;
      }
    }

    return { ...meilleurIndividu };
  }

  /**
   * Croisement des individus
   */
  croiser() {
    const nouveauxIndividus = [];

    for (let i = this.elitismCount; i < this.population.length; i += 2) {
      if (i + 1 < this.population.length && Math.random() < this.crossoverRate) {
        const parent1 = this.population[i];
        const parent2 = this.population[i + 1];

        const [enfant1, enfant2] = this.croisementUnPoint(parent1, parent2);
        nouveauxIndividus.push(enfant1, enfant2);
      } else {
        nouveauxIndividus.push(this.population[i]);
        if (i + 1 < this.population.length) {
          nouveauxIndividus.push(this.population[i + 1]);
        }
      }
    }

    // Remplacer la population (sauf élite)
    for (let i = this.elitismCount; i < this.population.length; i++) {
      if (i - this.elitismCount < nouveauxIndividus.length) {
        this.population[i] = nouveauxIndividus[i - this.elitismCount];
      }
    }
  }

  /**
   * Croisement à un point
   */
  croisementUnPoint(parent1, parent2) {
    const pointCroisement = Math.floor(Math.random() * parent1.creneaux.length);

    const enfant1 = {
      creneaux: [
        ...parent1.creneaux.slice(0, pointCroisement),
        ...parent2.creneaux.slice(pointCroisement)
      ],
      fitness: 0
    };

    const enfant2 = {
      creneaux: [
        ...parent2.creneaux.slice(0, pointCroisement),
        ...parent1.creneaux.slice(pointCroisement)
      ],
      fitness: 0
    };

    return [enfant1, enfant2];
  }

  /**
   * Mutation des individus
   */
  muter() {
    for (let i = this.elitismCount; i < this.population.length; i++) {
      if (Math.random() < this.mutationRate) {
        this.population[i] = this.muterIndividu(this.population[i]);
      }
    }
  }

  /**
   * Mutation d'un individu
   */
  muterIndividu(individu) {
    const nouvelIndividu = { ...individu, creneaux: [...individu.creneaux] };

    // Choisir un créneau aléatoire à muter
    const indexMutation = Math.floor(Math.random() * nouvelIndividu.creneaux.length);
    // Deep clone le créneau pour éviter de modifier l'original par référence
    const creneauAMuter = { ...nouvelIndividu.creneaux[indexMutation] };
    nouvelIndividu.creneaux[indexMutation] = creneauAMuter;

    // Mutation : changer le jour, l'horaire ou la salle
    const typesMutation = ['jour', 'horaire', 'salle'];
    const typeMutation = typesMutation[Math.floor(Math.random() * typesMutation.length)];

    switch (typeMutation) {
      case 'jour':
        const jours = Object.values(JourSemaine).slice(0, 5);
        creneauAMuter.jour_semaine = jours[Math.floor(Math.random() * jours.length)];
        break;

      case 'horaire':
        const creneauxHoraires = this.genererCreneauxHoraires();
        const nouveauCreneau = creneauxHoraires[Math.floor(Math.random() * creneauxHoraires.length)];
        creneauAMuter.heure_debut = nouveauCreneau.heure_debut;
        creneauAMuter.heure_fin = nouveauCreneau.heure_fin;
        break;

      case 'salle':
        const coursMut = this.donnees.cours.find(c => c.id === creneauAMuter.cours_id);
        const sallesComp = this.getCompatibleSalles(coursMut);
        if (sallesComp.length > 0) {
          let nouvelleSalle;

          // Avec une probabilité de 70%, on tente de revenir à la salle préférée
          // si elle est compatible
          if (Math.random() < 0.7) {
            const sallePrefId = coursMut.salle_id;
            const salleClasseNom = coursMut.classe?.salle_principale;

            nouvelleSalle = sallesComp.find(s =>
              (sallePrefId && s.id === sallePrefId) ||
              (salleClasseNom && (s.nom_salle === salleClasseNom || s.id === salleClasseNom))
            );
          }

          if (!nouvelleSalle) {
            nouvelleSalle = sallesComp[Math.floor(Math.random() * sallesComp.length)];
          }

          creneauAMuter.salle_id = nouvelleSalle.id;
          creneauAMuter.salle_nom = nouvelleSalle.nom_salle;
        }
        break;
    }

    return nouvelIndividu;
  }

  /**
   * Formater la solution pour l'API
   */
  formaterSolution() {
    const conflits = [
      ...this.detecterConflitsSalle(this.bestSolution).map(c => ({ type: 'salle', detail: `Salle ${c.creneau1.salle_nom} occupée` })),
      ...this.detecterConflitsEnseignant(this.bestSolution).map(c => ({ type: 'enseignant', detail: `Enseignant ${c.creneau1.enseignant_id} occupé` })),
      ...this.detecterConflitsClasse(this.bestSolution).map(c => ({ type: 'classe', detail: `Classe ${c.creneau1.classe_id} occupée` })),
      ...this.detecterConflitsExternes(this.bestSolution).map(c => ({ type: 'externe', detail: `Conflit externe: ${c.type}` }))
    ];

    // Ajouter les violations de disponibilité comme des conflits si elles persistent
    const indispos = this.verifierDisponibilitesEnseignants(this.bestSolution);
    if (indispos > 0) {
      conflits.push({ type: 'disponibilite', detail: `${indispos} séances sur des créneaux indisponibles` });
    }

    return {
      creneaux: this.bestSolution.creneaux,
      score: Math.round(this.bestSolution.fitness / 10), // Normaliser le score
      conflits: conflits.map(c => `Conflit ${c.type}`),
      statistiques: {
        total_creneaux: this.bestSolution.creneaux.length,
        taux_remplissage: this.calculerTauxRemplissage(this.bestSolution.creneaux),
        respect_contraintes: Math.round((this.bestSolution.fitness / 1000) * 100)
      },
      historique_fitness: this.fitnessHistory
    };
  }

  /**
   * Calculer le taux de remplissage
   */
  calculerTauxRemplissage(creneaux) {
    const totalSlots = 5 * 8; // 5 jours × 8 créneaux par jour
    const slotsUtilises = new Set();

    creneaux.forEach(creneau => {
      const slotKey = `${creneau.jour_semaine}-${creneau.heure_debut}`;
      slotsUtilises.add(slotKey);
    });

    return (slotsUtilises.size / totalSlots) * 100;
  }
}

module.exports = GeneticAlgorithm;
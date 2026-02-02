// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Utilisateur, Etablissement, LogConnexion, Enseignant, Eleve, Directeur, ResponsablePedagogique, Classe } = require('../database/models');
const { sequelize } = require('../config/database');
const config = require('../config/config');
const { validationResult } = require('express-validator');
const { RoleUtilisateur, StatutConnexion, StatutProfessionnel, StatutClasse, StatutEtablissement } = require('../utils/enums');
const AuthService = require('../services/auth.service');
const EmailService = require('../services/email.service');

const authController = {
  /**
   * Récupère les informations publiques d'un établissement via son code d'accès
   * Utile pour l'inscription des étudiants pour choisir leur classe
   */
  getEtablissementPublicInfo: async (req, res) => {
    try {
      const { accessCode } = req.params;

      const etablissement = await Etablissement.findOne({
        where: {
          code_acces: accessCode.toUpperCase().trim(),
          statut: StatutEtablissement.ACTIF
        },
        attributes: ['id', 'nom', 'type', 'ville']
      });

      if (!etablissement) {
        return res.status(404).json({
          error: 'Établissement non trouvé ou code invalide',
          code: 'ETABLISSEMENT_NOT_FOUND'
        });
      }

      // Récupérer les classes de cet établissement
      const classes = await Classe.findAll({
        where: {
          etablissement_id: etablissement.id,
          statut: StatutClasse.ACTIVE
        },
        attributes: ['id', 'nom_classe', 'niveau', 'annee_scolaire'],
        order: [['nom_classe', 'ASC']]
      });

      res.json({
        etablissement,
        classes,
        code: 'PUBLIC_INFO_SUCCESS'
      });
    } catch (error) {
      console.error('Erreur récupération infos publiques:', error);
      res.status(500).json({
        error: 'Erreur serveur',
        code: 'SERVER_ERROR'
      });
    }
  },

  /**
   * Inscription d'un nouvel utilisateur
   */
  register: async (req, res) => {
    try {
      // const errors = validationResult(req);
      // if (!errors.isEmpty()) {
      //   return res.status(400).json({
      //     error: 'Données invalides',
      //     details: errors.array(),
      //     code: 'VALIDATION_ERROR'
      //   });
      // }

      const { email, password, nom, prenom, role, telephone, etablissement_id, classe_id } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      // Vérifier si l'utilisateur existe déjà
      const existingUser = await Utilisateur.findOne({ where: { email: normalizedEmail } });
      if (existingUser) {
        return res.status(409).json({
          error: 'Un utilisateur avec cet email existe déjà',
          code: 'USER_ALREADY_EXISTS'
        });
      }

      // Vérifier l'établissement si fourni par code d'accès
      let targetEtablissementId = etablissement_id;
      if (req.body.code_acces_etablissement) {
        const etablissement = await Etablissement.findOne({
          where: { code_acces: req.body.code_acces_etablissement.toUpperCase().trim() }
        });

        if (!etablissement) {
          return res.status(404).json({
            error: 'Code d\'accès établissement invalide',
            code: 'INVALID_ACCESS_CODE'
          });
        }
        targetEtablissementId = etablissement.id;
      }

      // Vérifier l'établissement si fourni par ID directement (fallback)
      if (targetEtablissementId) {
        const etablissement = await Etablissement.findByPk(targetEtablissementId);
        if (!etablissement) {
          return res.status(404).json({
            error: 'Établissement non trouvé',
            code: 'ETABLISSEMENT_NOT_FOUND'
          });
        }
      }

      // Hasher le mot de passe
      const saltRounds = 12;
      const motDePasseHash = await bcrypt.hash(password, saltRounds);

      // DÉFINIR LES RÔLES QUI REQUIÈRENT LA 2FA
      const rolesRequiring2FA = [
        RoleUtilisateur.ADMIN,
        RoleUtilisateur.DIRECTEUR,
        RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
      ];

      // Créer l'utilisateur avec une transaction
      const result = await sequelize.transaction(async (t) => {
        const utilisateur = await Utilisateur.create({
          email: normalizedEmail,
          mot_de_passe_hash: motDePasseHash,
          nom,
          prenom,
          role,
          telephone,
          etablissement_id: targetEtablissementId,
          deux_fa_active: false
        }, { transaction: t });

        // Créer le profil spécifique selon le rôle
        const matricule = `MAT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

        if (targetEtablissementId) {
          try {
            if (role === RoleUtilisateur.ENSEIGNANT) {
              await Enseignant.create({
                utilisateur_id: utilisateur.id,
                etablissement_id: targetEtablissementId,
                matricule,
                statut: StatutProfessionnel.VACATAIRE,
                date_embauche: new Date(),
                heures_contractuelles_hebdo: 1080 // 18h par défaut
              }, { transaction: t });
            } else if (role === RoleUtilisateur.ETUDIANT) {
              await Eleve.create({
                utilisateur_id: utilisateur.id,
                etablissement_id: targetEtablissementId,
                matricule,
                classe_id: classe_id || null
              }, { transaction: t });
            } else if (role === RoleUtilisateur.DIRECTEUR) {
              await Directeur.create({
                utilisateur_id: utilisateur.id,
                etablissement_id: targetEtablissementId,
                matricule,
                date_nomination: new Date()
              }, { transaction: t });
            } else if (role === RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE) {
              await ResponsablePedagogique.create({
                utilisateur_id: utilisateur.id,
                etablissement_id: targetEtablissementId,
                matricule,
                date_prise_fonction: new Date()
              }, { transaction: t });
            }
          } catch (profileError) {
            console.error('Erreur creation profil spécifique:', profileError);
            // Propager l'erreur pour annuler la transaction
            throw profileError;
          }
        }

        return utilisateur;
      });

      const utilisateur = result;

      // Envoyer l'email de bienvenue (sans bloquer la réponse)
      if (utilisateur.email) {
        EmailService.envoyerEmailBienvenue(utilisateur).catch(err => {
          console.error('Erreur envoi email bienvenue:', err);
        });
      }

      // Si le rôle nécessite la 2FA, générer un secret
      if (rolesRequiring2FA.includes(role)) {
        const twoFASecret = AuthService.generate2FASecret({ email });
        await utilisateur.update({ deux_fa_secret: twoFASecret.secret });

        // Générer le QR Code
        const qrCodeUrl = await AuthService.generate2FAQrCode(twoFASecret.url);

        // Journaliser la création de compte
        await LogConnexion.create({
          utilisateur_id: utilisateur.id,
          adresse_ip: req.ip,
          user_agent: req.get('User-Agent'),
          statut: StatutConnexion.SUCCES
        });

        // Générer le token JWT
        const token = jwt.sign(
          { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );

        return res.status(201).json({
          message: 'Utilisateur créé avec succès. La 2FA est requise.',
          token,
          utilisateur: {
            ...utilisateur.toJSON(),
            deux_fa_setup_required: true,
            qr_code_url: qrCodeUrl,
            secret: twoFASecret.secret
          },
          code: 'REGISTRATION_SUCCESS_2FA_REQUIRED'
        });
      } else {
        // Pour les rôles ne nécessitant pas la 2FA
        const token = jwt.sign(
          { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );

        await LogConnexion.create({
          utilisateur_id: utilisateur.id,
          adresse_ip: req.ip,
          user_agent: req.get('User-Agent'),
          statut: StatutConnexion.SUCCES
        });

        return res.status(201).json({
          message: 'Utilisateur créé avec succès',
          token,
          utilisateur: utilisateur.toJSON(),
          code: 'REGISTRATION_SUCCESS'
        });
      }

    } catch (error) {
      console.error('Erreur inscription:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'inscription',
        code: 'REGISTRATION_ERROR',
        details: error?.message || String(error)
      });
    }
  },

  /**
   * Connexion utilisateur avec support 2FA
   */
  login: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const { email, password, twoFAToken } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      // Rechercher l'utilisateur
      const utilisateur = await Utilisateur.findOne({
        where: { email: normalizedEmail },
        include: [
          {
            association: 'etablissement',
            attributes: ['id', 'nom', 'type', 'statut', 'code_acces']
          },
          {
            association: 'enseignant',
            attributes: ['id']
          },
          {
            association: 'eleve',
            attributes: ['id', 'classe_id']
          }
        ]
      });

      // Vérifier le mot de passe
      const isPasswordValid = utilisateur ? await bcrypt.compare(password, utilisateur.mot_de_passe_hash) : false;

      // Journaliser la tentative de connexion (après vérification du mot de passe pour le statut réel)
      await LogConnexion.create({
        utilisateur_id: utilisateur?.id || null,
        adresse_ip: req.ip,
        user_agent: req.get('User-Agent'),
        statut: (utilisateur && isPasswordValid) ? StatutConnexion.SUCCES : StatutConnexion.ECHEC,
        mot_de_passe_tente: password ? (password.substring(0, 3) + '***') : null,
        pays: null,
        ville: null
      });

      if (!utilisateur || !isPasswordValid) {
        return res.status(401).json({
          error: 'Email ou mot de passe incorrect',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Vérifier si le compte est actif
      if (!utilisateur.actif) {
        return res.status(401).json({
          error: 'Compte désactivé',
          code: 'ACCOUNT_DISABLED'
        });
      }

      // Vérifier si l'établissement est actif
      if (utilisateur.etablissement && utilisateur.etablissement.statut !== 'actif') {
        return res.status(403).json({
          error: 'Établissement non actif',
          code: 'ETABLISSEMENT_INACTIVE'
        });
      }

      // DÉFINIR LES RÔLES QUI REQUIÈRENT LA 2FA
      const rolesRequiring2FA = [
        RoleUtilisateur.ADMIN,
        RoleUtilisateur.DIRECTEUR,
        RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
      ];

      // Vérifier si l'utilisateur nécessite la 2FA
      const requires2FA = utilisateur.deux_fa_active ||
        (rolesRequiring2FA.includes(utilisateur.role) && utilisateur.deux_fa_secret);

      if (requires2FA) {
        // Si le token 2FA n'est pas fourni, demander l'authentification 2FA
        if (!twoFAToken) {
          return res.status(200).json({
            message: 'Authentification 2FA requise',
            requires2FA: true,
            utilisateur: {
              id: utilisateur.id,
              email: utilisateur.email,
              role: utilisateur.role,
              deux_fa_active: true
            },
            code: '2FA_REQUIRED'
          });
        }

        // Vérifier le token 2FA
        const is2FATokenValid = AuthService.verify2FACode(utilisateur.deux_fa_secret, twoFAToken);
        if (!is2FATokenValid) {
          return res.status(401).json({
            error: 'Code 2FA invalide',
            code: 'INVALID_2FA_TOKEN'
          });
        }
      }

      // Mettre à jour la date de dernière connexion
      await utilisateur.update({ date_derniere_connexion: new Date() });

      // Générer le token JWT
      const tokenPayload = {
        id: utilisateur.id,
        email: utilisateur.email,
        role: utilisateur.role
      };

      // Ajouter un flag 2FA dans le token si applicable
      if (requires2FA) {
        tokenPayload.twoFAVerified = true;
      }

      const token = jwt.sign(
        tokenPayload,
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        message: 'Connexion réussie',
        token,
        utilisateur: {
          id: utilisateur.id,
          email: utilisateur.email,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          role: utilisateur.role,
          etablissement: utilisateur.etablissement,
          enseignant: utilisateur.enseignant,
          eleve: utilisateur.eleve,
          deux_fa_active: utilisateur.deux_fa_active || requires2FA
        },
        code: 'LOGIN_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur connexion:', error);
      res.status(500).json({
        error: 'Erreur lors de la connexion',
        code: 'LOGIN_ERROR'
      });
    }
  },

  /**
   * Route pour vérifier un code 2FA
   */
  verify2FA: async (req, res) => {
    try {
      const { email, twoFAToken } = req.body;
      console.log('[verify2FA] Received request with email:', email, 'twoFAToken:', twoFAToken?.substring(0, 10));

      if (!email) {
        return res.status(400).json({
          error: 'Email manquant',
          code: 'MISSING_EMAIL'
        });
      }

      // Normalize email for consistency
      const normalizedEmail = email.trim().toLowerCase();
      console.log('[verify2FA] Looking up user with normalized email:', normalizedEmail);

      const utilisateur = await Utilisateur.findOne({ where: { email: normalizedEmail } });
      console.log('[verify2FA] User lookup result:', utilisateur ? `Found user ${utilisateur.id}` : 'User not found');

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!utilisateur.deux_fa_secret) {
        return res.status(400).json({
          error: '2FA non configurée pour cet utilisateur',
          code: '2FA_NOT_CONFIGURED'
        });
      }

      const isTokenValid = AuthService.verify2FACode(utilisateur.deux_fa_secret, twoFAToken);

      if (!isTokenValid) {
        return res.status(401).json({
          error: 'Code 2FA invalide',
          code: 'INVALID_2FA_TOKEN'
        });
      }

      // Générer le token JWT final
      const token = jwt.sign(
        {
          id: utilisateur.id,
          email: utilisateur.email,
          role: utilisateur.role,
          twoFAVerified: true
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        message: 'Authentification 2FA réussie',
        token,
        code: '2FA_VERIFICATION_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur vérification 2FA:', error);
      res.status(500).json({
        error: 'Erreur lors de la vérification 2FA',
        code: '2FA_VERIFICATION_ERROR'
      });
    }
  },

  /**
   * Route pour configurer la 2FA
   */
  setup2FA: async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id);

      if (utilisateur.deux_fa_active) {
        return res.status(400).json({
          error: '2FA déjà activée',
          code: '2FA_ALREADY_ACTIVE'
        });
      }

      // Générer un nouveau secret 2FA
      const twoFASecret = AuthService.generate2FASecret({ email: utilisateur.email });

      // Générer le QR Code
      const qrCodeUrl = await AuthService.generate2FAQrCode(twoFASecret.url);

      // Mettre à jour l'utilisateur avec le secret
      await utilisateur.update({
        deux_fa_secret: twoFASecret.secret
      });

      res.json({
        message: 'Configuration 2FA initialisée',
        qr_code_url: qrCodeUrl,
        secret: twoFASecret.secret, // Pour développement/test seulement
        code: '2FA_SETUP_INITIATED'
      });

    } catch (error) {
      console.error('Erreur configuration 2FA:', error);
      res.status(500).json({
        error: 'Erreur lors de la configuration de la 2FA',
        code: '2FA_SETUP_ERROR'
      });
    }
  },

  /**
   * Route pour activer la 2FA après vérification
   */
  // controllers/authController.js - CORRECTION de la fonction activate2FA
  activate2FA: async (req, res) => {
    try {
      const { twoFAToken } = req.body;

      // ✅ CORRECTION : Utiliser req.utilisateur.id au lieu de userData.id
      // req.utilisateur est injecté par le middleware authenticateToken
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id);

      if (!utilisateur) {
        return res.status(404).json({
          error: 'Utilisateur non trouvé',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!utilisateur.deux_fa_secret) {
        return res.status(400).json({
          error: 'Veuillez d\'abord configurer la 2FA',
          code: '2FA_NOT_CONFIGURED'
        });
      }

      if (utilisateur.deux_fa_active) {
        return res.status(400).json({
          error: '2FA déjà activée',
          code: '2FA_ALREADY_ACTIVE'
        });
      }

      // Vérifier le token 2FA
      const isTokenValid = AuthService.verify2FACode(utilisateur.deux_fa_secret, twoFAToken);

      if (!isTokenValid) {
        return res.status(401).json({
          error: 'Code 2FA invalide',
          code: 'INVALID_2FA_TOKEN'
        });
      }

      // Activer la 2FA
      await utilisateur.update({
        deux_fa_active: true
      });

      // Générer un nouveau token avec twoFAVerified: true pour éviter la déconnexion
      const token = jwt.sign(
        {
          id: utilisateur.id,
          email: utilisateur.email,
          role: utilisateur.role,
          twoFAVerified: true
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        message: '2FA activée avec succès',
        token,
        code: '2FA_ACTIVATED'
      });

    } catch (error) {
      console.error('Erreur activation 2FA:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'activation de la 2FA',
        code: '2FA_ACTIVATION_ERROR',
        details: error.message
      });
    }
  },


  /**
   * Récupération du profil utilisateur
   */
  getProfile: async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id, {
        attributes: { exclude: ['mot_de_passe_hash', 'deux_fa_secret'] },
        include: [
          {
            association: 'etablissement',
            attributes: ['id', 'nom', 'type', 'ville', 'statut', 'code_acces']
          },
          {
            association: 'enseignant',
            attributes: ['id']
          },
          {
            association: 'eleve',
            attributes: ['id', 'classe_id']
          }
        ]
      });

      res.json({
        utilisateur,
        code: 'RECUPERATION_PROFILE_SUCCESS'
      });

    } catch (error) {
      console.error('Erreur récupération profil:', error);
      res.status(500).json({
        error: 'Erreur lors de la récupération du profil',
        code: 'RECUPERATION_PROFILE_ERROR'
      });
    }
  },

  /**
   * Modification du profil utilisateur
   */
  updateProfile: async (req, res) => {
    try {
      const { nom, prenom, telephone } = req.body;
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id);

      await utilisateur.update({
        nom: nom || utilisateur.nom,
        prenom: prenom || utilisateur.prenom,
        telephone: telephone || utilisateur.telephone
      });

      res.json({
        message: 'Profil mis à jour avec succès',
        utilisateur: {
          id: utilisateur.id,
          email: utilisateur.email,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          telephone: utilisateur.telephone
        },
        code: 'PROFILE_UPDATED'
      });

    } catch (error) {
      console.error('Erreur mise à jour profil:', error);
      res.status(500).json({
        error: 'Erreur lors de la mise à jour du profil',
        code: 'PROFILE_UPDATE_ERROR'
      });
    }
  },

  /**
   * Changement de mot de passe
   */
  changePassword: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Données invalides',
          details: errors.array(),
          code: 'VALIDATION_ERROR'
        });
      }

      const { currentPassword, newPassword } = req.body;
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id);

      // Vérifier l'ancien mot de passe
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, utilisateur.mot_de_passe_hash);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          error: 'Le mot de passe actuel est incorrect. Veuillez réessayer.'
        });
      }

      // Hasher le nouveau mot de passe
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Mettre à jour le mot de passe
      await utilisateur.update({ mot_de_passe_hash: newPasswordHash });

      res.json({
        message: 'Mot de passe modifié avec succès'
      });

    } catch (error) {
      console.error('Erreur changement mot de passe:', error);
      res.status(500).json({
        error: 'Erreur lors du changement de mot de passe'
      });
    }
  },

  /**
   * Rafraîchissement du token
   */
  refreshToken: async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findByPk(req.utilisateur.id, {
        attributes: ['id', 'email', 'role']
      });

      const newToken = jwt.sign(
        {
          id: utilisateur.id,
          email: utilisateur.email,
          role: utilisateur.role
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        token: newToken,
        code: 'TOKEN_REFRESHED'
      });

    } catch (error) {
      console.error('Erreur rafraîchissement token:', error);
      res.status(500).json({
        error: 'Erreur lors du rafraîchissement du token',
        code: 'TOKEN_REFRESH_ERROR'
      });
    }
  },

  /**
   * Upload de la photo de profil
   */
  uploadAvatar: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Veuillez sélectionner une image pour votre photo de profil.'
        });
      }

      // Construction de l'URL relative
      // Note: req.file.filename est généré par multer
      const relativePath = `/uploads/avatars/${req.file.filename}`;

      // Mise à jour de l'utilisateur
      await Utilisateur.update(
        { photo_url: relativePath },
        { where: { id: req.utilisateur.id } }
      );

      res.json({
        message: 'Photo de profil mise à jour avec succès',
        photo_url: relativePath
      });

    } catch (error) {
      console.error('Erreur upload avatar:', error);
      res.status(500).json({
        error: 'Erreur lors du téléchargement de la photo',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

module.exports = authController;
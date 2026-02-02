const jwt = require('jsonwebtoken');
const { Utilisateur, Etablissement, Enseignant, Accreditation } = require('../database/models');
const { Op } = require('sequelize');
const config = require('../config/config');
const AuthService = require('../services/auth.service');
const { RoleUtilisateur } = require('../utils/enums');

/**
 * Middleware d'authentification JWT
 */
const authenticateToken = async (req, res, next) => {
  res.setHeader('X-Auth-Version', '2.0-Diagnostic');
  try {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Token d\'authentification requis',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Vérifier le token JWT
    const decoded = jwt.verify(token, config.jwt.secret);

    // Récupérer l'utilisateur depuis la base de données
    const utilisateur = await Utilisateur.findByPk(decoded.id, {
      attributes: {
        exclude: ['mot_de_passe_hash']
      },
      include: [
        {
          association: 'etablissement',
          attributes: ['id', 'nom', 'type', 'statut']
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


    if (!utilisateur) {
      return res.status(401).json({
        error: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

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
        code: 'ESTABLISHMENT_INACTIVE'
      });
    }

    // Définir les rôles qui requièrent la 2FA
    const rolesRequiring2FA = [
      RoleUtilisateur.ADMIN,
      RoleUtilisateur.DIRECTEUR,
      RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
    ];

    // Vérifier si l'utilisateur nécessite la vérification 2FA
    const requires2FA = rolesRequiring2FA.includes(utilisateur.role) &&
      utilisateur.deux_fa_active;

    // Si la 2FA est requise, vérifier que le token contient le flag twoFAVerified
    if (requires2FA) {
      // Pour les routes qui n'exigent pas la 2FA immédiate (comme setup-2fa)
      const exemptedRoutes = [
        '/auth/setup-2fa',
        '/auth/activate-2fa',
        '/auth/verify-2fa'
      ];

      const requestPath = req.originalUrl || req.path;
      const isExemptedRoute = exemptedRoutes.some(route => requestPath.includes(route));

      if (!isExemptedRoute && !decoded.twoFAVerified) {
        return res.status(403).json({
          error: 'Authentification 2FA requise. Veuillez vérifier votre code 2FA.',
          requires2FA: true,
          code: '2FA_REQUIRED'
        });
      }
    }

    // Ajouter l'utilisateur à la requête
    req.utilisateur = utilisateur;
    next();
  } catch (error) {
    console.error('Erreur authentification:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'Token invalide',
        code: 'TOKEN_INVALID'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({
      error: 'Erreur d\'authentification',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : 'Voir logs serveur',
      details: error.stack, // On le met temporairement pour debugger en production
      code: 'AUTH_ERROR'
    });
  }
};



/**
 * Middleware de vérification des rôles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.utilisateur) {
      return res.status(401).json({
        error: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.utilisateur.role)) {
      return res.status(403).json({
        error: 'Permissions insuffisantes',
        required_roles: roles,
        user_role: req.utilisateur.role,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

/**
 * Middleware de vérification d'accès à un module (Rôle ou Accréditation)
 */
const requireModuleAccess = (moduleName, defaultRoles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.utilisateur) {
        return res.status(401).json({
          error: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      // 1. Vérifier si le rôle de base autorise l'accès
      if (defaultRoles.includes(req.utilisateur.role) || req.utilisateur.role === RoleUtilisateur.ADMIN) {
        return next();
      }

      // 2. Vérifier si l'utilisateur a une accréditation valide pour ce module
      const now = new Date();
      const accreditation = await Accreditation.findOne({
        where: {
          utilisateur_id: req.utilisateur.id,
          module: moduleName,
          statut: 'actif',
          date_debut: { [Op.lte]: now },
          date_fin: { [Op.gte]: now }
        }
      });

      if (accreditation) {
        return next();
      }

      return res.status(403).json({
        error: `Vous n'avez pas l'accréditation nécessaire pour accéder au module ${moduleName}`,
        code: 'INSUFFICIENT_MODULE_PERMISSIONS'
      });
    } catch (error) {
      console.error('Erreur vérification accès module:', error);
      res.status(500).json({
        error: 'Erreur de vérification des permissions',
        code: 'MODULE_PERMISSIONS_CHECK_ERROR'
      });
    }
  };
};

/**
 * Résout et met en cache l'id enseignant associé à l'utilisateur connecté
 */
const resolveEnseignantId = async (utilisateur) => {
  if (!utilisateur || utilisateur.role !== RoleUtilisateur.ENSEIGNANT) {
    return null;
  }

  if (utilisateur.enseignant_id) {
    return utilisateur.enseignant_id;
  }

  const enseignant = await Enseignant.findOne({
    where: { utilisateur_id: utilisateur.id },
    attributes: ['id']
  });

  if (enseignant) {
    utilisateur.enseignant_id = enseignant.id;
    return enseignant.id;
  }

  return null;
};

/**
 * Autorise soit un rôle donné, soit un enseignant sur sa propre ressource
 */
const requireRoleOrSelfEnseignant = (roles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.utilisateur) {
        return res.status(401).json({
          error: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      // Rôle autorisé directement
      if (roles.includes(req.utilisateur.role)) {
        return next();
      }

      // Enseignant uniquement sur sa ressource
      if (req.utilisateur.role === RoleUtilisateur.ENSEIGNANT) {
        const enseignantId = await resolveEnseignantId(req.utilisateur);
        if (enseignantId && enseignantId === req.params.id) {
          return next();
        }
      }

      return res.status(403).json({
        error: 'Permissions insuffisantes',
        required_roles: roles,
        user_role: req.utilisateur.role,
        self_allowed: true,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    } catch (error) {
      console.error('Erreur vérification rôle/ressource enseignant:', error);
      return res.status(500).json({
        error: 'Erreur de vérification des permissions',
        code: 'ROLE_CHECK_ERROR'
      });
    }
  };
};

/**
 * Vérifie le code d'accès établissement pour les opérations d'écriture
 * - Admin système bypass
 * - Utilise l'établissement scoped (body/query/user)
 * - Code attendu dans l'en-tête `x-etablissement-code`
 */
const requireEtablissementAccessCode = async (req, res, next) => {
  try {
    if (!req.utilisateur) {
      return res.status(401).json({
        error: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.utilisateur.role === RoleUtilisateur.ADMIN) {
      return next(); // Bypass admin système
    }

    const headerCode = req.headers['x-etablissement-code'] || req.headers['x-etablissement-access-code'];
    if (!headerCode) {
      return res.status(400).json({
        error: 'Code d\'accès établissement requis',
        code: 'ESTABLISHMENT_CODE_REQUIRED'
      });
    }

    const targetEtablissementId = req.body?.etablissement_id || req.query?.etablissement_id || req.utilisateur.etablissement_id;
    if (!targetEtablissementId) {
      return res.status(400).json({
        error: 'Établissement cible manquant',
        code: 'ESTABLISHMENT_TARGET_REQUIRED'
      });
    }

    const etablissement = await Etablissement.findOne({
      where: { id: targetEtablissementId },
      attributes: ['id', 'code_acces']
    });

    if (!etablissement) {
      return res.status(404).json({
        error: 'Établissement introuvable',
        code: 'ESTABLISHMENT_NOT_FOUND'
      });
    }

    if (etablissement.code_acces !== headerCode) {
      return res.status(403).json({
        error: 'Code d\'accès établissement invalide',
        code: 'ESTABLISHMENT_CODE_INVALID'
      });
    }

    // ok
    return next();
  } catch (error) {
    console.error('Erreur vérification code établissement:', error);
    return res.status(500).json({
      error: 'Erreur lors de la vérification du code établissement',
      code: 'ESTABLISHMENT_CODE_ERROR'
    });
  }
};

/**
 * Middleware de vérification 2FA pour les rôles spécifiques
 */
const require2FAForRoles = (roles = []) => {
  return async (req, res, next) => {
    try {
      // Si aucun rôle spécifié, utiliser les rôles par défaut
      const targetRoles = roles.length > 0 ? roles : [
        RoleUtilisateur.ADMIN,
        RoleUtilisateur.DIRECTEUR,
        RoleUtilisateur.RESPONSABLE_PEDAGOGIQUE
      ];

      // Vérifier si l'utilisateur a un rôle qui nécessite la 2FA
      if (targetRoles.includes(req.utilisateur.role)) {
        // Vérifier si la 2FA est activée pour cet utilisateur
        if (req.utilisateur.deux_fa_active) {
          // Vérifier si le token JWT contient le flag twoFAVerified
          const token = req.headers['authorization']?.split(' ')[1];
          if (token) {
            try {
              const decoded = jwt.verify(token, config.jwt.secret);
              if (!decoded.twoFAVerified) {
                return res.status(403).json({
                  error: 'Authentification 2FA requise pour accéder à cette ressource',
                  requires2FA: true,
                  code: '2FA_REQUIRED_FOR_ROLE'
                });
              }
            } catch (error) {
              // Token invalide, demander une nouvelle authentification
              return res.status(403).json({
                error: 'Session invalide. Veuillez vous reconnecter.',
                code: 'INVALID_SESSION'
              });
            }
          } else {
            return res.status(401).json({
              error: 'Token manquant',
              code: 'TOKEN_MISSING'
            });
          }
        } else {
          // Si la 2FA n'est pas activée mais est requise pour ce rôle
          return res.status(403).json({
            error: 'La 2FA doit être activée pour ce rôle. Veuillez configurer la 2FA.',
            requires2FASetup: true,
            code: '2FA_SETUP_REQUIRED'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Erreur vérification 2FA:', error);
      res.status(500).json({
        error: 'Erreur de vérification 2FA',
        code: '2FA_VERIFICATION_ERROR'
      });
    }
  };
};

/**
 * Middleware pour générer un token temporaire pour configuration 2FA
 */
const generateTempToken = (req, res, next) => {
  try {
    // Ce middleware génère un token temporaire pour les utilisateurs
    // qui viennent de s'inscrire et doivent configurer la 2FA
    const { email, password } = req.body;

    if (!email || !password) {
      return next();
    }

    // Générer un token temporaire sans 2FA pour permettre la configuration
    const tempToken = jwt.sign(
      {
        email,
        temp: true,
        twoFAVerified: false
      },
      config.jwt.secret,
      { expiresIn: '15m' } // Court délai pour la configuration
    );

    req.tempToken = tempToken;
    next();
  } catch (error) {
    console.error('Erreur génération token temporaire:', error);
    next();
  }
};

/**
 * Middleware de vérification de la propriété de la ressource
 */
const requireOwnership = (modelName, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const { sequelize } = require('../database/models');
      const model = sequelize.models[modelName];

      if (!model) {
        return res.status(500).json({
          error: 'Modèle non trouvé',
          code: 'MODEL_NOT_FOUND'
        });
      }

      const resourceId = req.params[paramName];
      const resource = await model.findByPk(resourceId);

      if (!resource) {
        return res.status(404).json({
          error: 'Ressource non trouvée',
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // Vérifier selon le type de ressource
      let hasAccess = false;

      if (modelName === 'Utilisateur') {
        // Un utilisateur peut accéder à son propre profil
        hasAccess = resource.id === req.utilisateur.id;
      } else if (resource.etablissement_id) {
        // Vérifier l'appartenance à l'établissement
        hasAccess = resource.etablissement_id === req.utilisateur.etablissement_id;
      } else if (resource.utilisateur_id) {
        // Vérifier l'appartenance à l'utilisateur
        hasAccess = resource.utilisateur_id === req.utilisateur.id;
      }

      if (!hasAccess && req.utilisateur.role !== 'admin') {
        return res.status(403).json({
          error: 'Accès non autorisé à cette ressource',
          code: 'RESOURCE_ACCESS_DENIED'
        });
      }

      // Ajouter la ressource à la requête pour éviter de la recharger
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Erreur vérification propriété:', error);
      res.status(500).json({
        error: 'Erreur de vérification des permissions',
        code: 'OWNERSHIP_VERIFICATION_ERROR'
      });
    }
  };
};

/**
 * Middleware de vérification de la 2FA via code
 */
const verify2FACode = async (req, res, next) => {
  try {
    const { code_2fa } = req.body;

    if (!code_2fa) {
      return res.status(400).json({
        error: 'Code 2FA requis',
        code: '2FA_REQUIRED'
      });
    }

    // Vérification du format
    if (code_2fa.length !== 6 || !/^\d{6}$/.test(code_2fa)) {
      return res.status(400).json({
        error: 'Le code 2FA doit contenir 6 chiffres',
        code: 'INVALID_2FA_FORMAT'
      });
    }

    // Vérifier le code 2FA
    const isValid = AuthService.verify2FACode(
      req.utilisateur.deux_fa_secret,
      code_2fa
    );

    if (!isValid) {
      return res.status(401).json({
        error: 'Code 2FA invalide',
        code: 'INVALID_2FA_CODE'
      });
    }

    // Stocker le résultat de la vérification
    req.twoFAVerified = true;
    next();
  } catch (error) {
    console.error('Erreur vérification 2FA:', error);
    res.status(500).json({
      error: 'Erreur de vérification 2FA',
      code: '2FA_VERIFICATION_ERROR'
    });
  }
};

/**
 * Middleware de journalisation des accès
 */
const logAccess = (action) => {
  return async (req, res, next) => {
    const start = Date.now();

    // Journaliser après la réponse (utiliser LogConnexion pour accès)
    res.on('finish', async () => {
      try {
        const { LogConnexion } = require('../database/models');
        const { StatutConnexion } = require('../utils/enums');
        const duration = Date.now() - start;

        const statut = res.statusCode && res.statusCode < 400 ? StatutConnexion.SUCCES : StatutConnexion.ECHEC;

        await LogConnexion.create({
          utilisateur_id: req.utilisateur?.id || null,
          adresse_ip: req.ip || req.connection.remoteAddress,
          user_agent: req.get('User-Agent'),
          statut,
          mot_de_passe_tente: null,
          pays: null,
          ville: null
        });
      } catch (error) {
        console.error('Erreur journalisation accès:', error);
      }
    });

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole,
  require2FAForRoles,
  requireOwnership,
  verify2FACode,
  generateTempToken,
  logAccess,
  requireRoleOrSelfEnseignant,
  requireEtablissementAccessCode,
  resolveEnseignantId,
  requireModuleAccess
};
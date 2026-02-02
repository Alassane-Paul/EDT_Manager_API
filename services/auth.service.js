// services/authService.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { Utilisateur } = require('../database/models');
const config = require('../config/config');

class AuthService {
  /**
   * Hasher un mot de passe
   */
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Vérifier un mot de passe
   */
  static async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Générer un token JWT
   */
  static generateToken(payload, expiresIn = config.jwt.expiresIn) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn });
  }

  /**
   * Vérifier un token JWT
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new Error('Token invalide');
    }
  }

  /**
   * Générer un secret 2FA
   */
  static generate2FASecret(user) {
    const secret = speakeasy.generateSecret({
      name: `EmploiDuTemps (${user.email})`,
      issuer: 'EmploiDuTemps App'
    });

    return {
      secret: secret.base32,
      url: secret.otpauth_url
    };
  }

  /**
   * Générer un QR Code pour la 2FA
   */
  static async generate2FAQrCode(url) {
    try {
      return await QRCode.toDataURL(url);
    } catch (error) {
      throw new Error('Erreur lors de la génération du QR Code');
    }
  }

  /**
   * Vérifier un code 2FA
   */
  static verify2FACode(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Tolérance de 2 périodes (2 minutes)
    });
  }

  /**
   * Générer un code de réinitialisation de mot de passe
   */
  static generatePasswordResetToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Valider la force d'un mot de passe
   */
  static validatePasswordStrength(password) {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[@$!%*?&]/.test(password);

    if (password.length < minLength) {
      return { valid: false, message: `Le mot de passe doit contenir au moins ${minLength} caractères` };
    }

    if (!hasUpperCase) {
      return { valid: false, message: 'Le mot de passe doit contenir au moins une majuscule' };
    }

    if (!hasLowerCase) {
      return { valid: false, message: 'Le mot de passe doit contenir au moins une minuscule' };
    }

    if (!hasNumbers) {
      return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre' };
    }

    if (!hasSpecialChar) {
      return { valid: false, message: 'Le mot de passe doit contenir au moins un caractère spécial' };
    }

    return { valid: true, message: 'Mot de passe valide' };
  }

  /**
   * Vérifier les tentatives de connexion
   */
  static async checkLoginAttempts(email, maxAttempts = 5) {
    // Implémentation simplifiée - dans la réalité, vous utiliseriez Redis ou une table dédiée
    const user = await Utilisateur.findOne({ where: { email } });
    
    if (user && user.login_attempts >= maxAttempts) {
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes
      const timeSinceLastAttempt = Date.now() - new Date(user.last_login_attempt).getTime();
      
      if (timeSinceLastAttempt < lockoutDuration) {
        throw new Error('Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.');
      } else {
        // Réinitialiser les tentatives après la période de verrouillage
        await user.update({ 
          login_attempts: 0,
          last_login_attempt: null 
        });
      }
    }
  }

  /**
   * Enregistrer une tentative de connexion échouée
   */
  static async recordFailedLogin(email) {
    const user = await Utilisateur.findOne({ where: { email } });
    if (user) {
      const attempts = (user.login_attempts || 0) + 1;
      await user.update({ 
        login_attempts: attempts,
        last_login_attempt: new Date()
      });
    }
  }

  /**
   * Réinitialiser les tentatives de connexion après une connexion réussie
   */
  static async resetLoginAttempts(email) {
    const user = await Utilisateur.findOne({ where: { email } });
    if (user) {
      await user.update({ 
        login_attempts: 0,
        last_login_attempt: null 
      });
    }
  }
}

module.exports = AuthService;
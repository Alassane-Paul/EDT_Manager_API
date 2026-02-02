// services/emailService.js
const nodemailer = require('nodemailer');
const config = require('../config/config');

class EmailService {
  static transporter = null;

  /**
   * Initialiser le transporteur email
   */
  static initTransporter() {
    if (this.transporter) return this.transporter;

    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass
      }
    });

    return this.transporter;
  }

  /**
   * Envoyer un email
   */
  static async envoyerEmail({ to, subject, html, text = null }) {
    try {
      const transporter = this.initTransporter();

      const mailOptions = {
        from: `"EmploiDuTemps" <${config.email.from}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html)
      };

      const result = await transporter.sendMail(mailOptions);
      console.log('Email envoyé:', result.messageId);
      return result;

    } catch (error) {
      console.error('Erreur envoi email:', error);
      throw new Error(`Échec envoi email: ${error.message}`);
    }
  }

  /**
   * Convertir HTML en texte simple
   */
  static htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Template d'email Premium
   */
  static getPremiumTemplate({ title, content, buttonText = null, buttonUrl = null, footer = null }) {
    const primaryColor = '#3B82F6';
    const secondaryColor = '#1E293B';
    const backgroundColor = '#F8FAFC';

    const actionButton = (buttonText && buttonUrl) ? `
      <div style="margin: 30px 0; text-align: center;">
        <a href="${buttonUrl}" style="background-color: ${primaryColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.5);">
          ${buttonText}
        </a>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', Arial, sans-serif; background-color: ${backgroundColor}; color: ${secondaryColor}; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
          .wrapper { width: 100%; table-layout: fixed; background-color: ${backgroundColor}; padding-bottom: 40px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 40px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, ${primaryColor} 0%, #2563EB 100%); padding: 40px 20px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; }
          .content { padding: 40px 30px; line-height: 1.6; }
          .content h2 { color: ${secondaryColor}; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 20px; }
          .content p { margin-bottom: 16px; color: #475569; }
          .footer { padding: 20px; text-align: center; font-size: 13px; color: #94A3B8; background-color: #F1F5F9; }
          .footer p { margin: 5px 0; }
          hr { border: 0; border-top: 1px solid #E2E8F0; margin: 30px 0; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>${title}</h1>
            </div>
            <div class="content">
              ${content}
              ${actionButton}
            </div>
            <div class="footer">
              <p>${footer || "L'équipe TimeTable Evolution"}</p>
              <p>© ${new Date().getFullYear()} - Plateforme de Gestion Scolaire</p>
              <p style="font-size: 11px;">Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Envoyer un email de bienvenue
   */
  static async envoyerEmailBienvenue(utilisateur, motDePasseTemporaire = null) {
    const sujet = 'Bienvenue sur TimeTable Evolution';

    const content = `
      <h2>Bonjour ${utilisateur.prenom},</h2>
      <p>Nous sommes ravis de vous accueillir sur <strong>TimeTable Evolution</strong>, votre nouvel outil de gestion d'emploi du temps.</p>
      <p>Votre compte a été configuré avec le rôle : <strong>${utilisateur.role}</strong>.</p>
      ${motDePasseTemporaire ? `
        <div style="background-color: #F1F5F9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-weight: 600;">Vos identifiants de connexion :</p>
          <p style="margin: 5px 0 0 0;">Mot de passe temporaire : <code style="background: white; padding: 2px 6px; border-radius: 4px;">${motDePasseTemporaire}</code></p>
        </div>
        <p><em>Nous vous recommandons vivement de modifier ce mot de passe dès votre première connexion pour des raisons de sécurité.</em></p>
      ` : ''}
      <p>Vous pouvez dès maintenant accéder à votre espace personnel en cliquant sur le bouton ci-dessous.</p>
    `;

    const html = this.getPremiumTemplate({
      title: 'Bienvenue au Bord !',
      content,
      buttonText: 'Accéder à mon Espace',
      buttonUrl: `${config.app.url}/login`
    });

    return await this.envoyerEmail({
      to: utilisateur.email,
      subject: sujet,
      html
    });
  }

  /**
   * Envoyer un email de réinitialisation de mot de passe
   */
  static async envoyerEmailReinitialisation(utilisateur, token) {
    const sujet = 'Réinitialisation de votre mot de passe';
    const lien = `${config.app.url}/reset-password?token=${token}`;

    const content = `
      <h2>Bonjour ${utilisateur.prenom},</h2>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>Pas d'inquiétude, cela arrive même aux meilleurs ! Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe sécurisé.</p>
      <p style="color: #64748B; font-size: 14px;"><em>Ce lien expirera dans une heure pour votre sécurité.</em></p>
      <hr />
      <p style="font-size: 13px; color: #94A3B8;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité. Votre mot de passe restera inchangé.</p>
    `;

    const html = this.getPremiumTemplate({
      title: 'Réinitialisation de Mot de Passe',
      content,
      buttonText: 'Mettre à jour mon mot de passe',
      buttonUrl: lien
    });

    return await this.envoyerEmail({
      to: utilisateur.email,
      subject: sujet,
      html
    });
  }


  /**
   * Vérifier la configuration email
   */
  static async verifierConfiguration() {
    try {
      const transporter = this.initTransporter();
      await transporter.verify();
      return { ok: true, message: 'Configuration email valide' };
    } catch (error) {
      return { ok: false, message: `Erreur configuration email: ${error.message}` };
    }
  }
}

module.exports = EmailService;
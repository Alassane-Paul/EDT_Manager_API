// services/index.js
const AuthService = require('./auth.service');
const GenerationService = require('./generation.service');
const NotificationService = require('./notification.service');
const EmailService = require('./email.service');
const CSPAlgorithm = require('./algorithmes/cspAlgorithm');
const GeneticAlgorithm = require('./algorithmes/geneticAlgorithm');
const ConstraintEngine = require('./algorithmes/constraintEngine');

module.exports = {
  AuthService,
  GenerationService,
  NotificationService,
  EmailService,
  CSPAlgorithm,
  GeneticAlgorithm,
  ConstraintEngine
};
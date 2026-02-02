// routes/users.js
const express = require('express');
const UserRouter = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateToken, requireRole, requireEtablissementAccessCode, logAccess } = require('../middleware/auth');
const { queryValidation, handleValidationErrors } = require('../middleware/validation');
const { RoleUtilisateur } = require('../utils/enums');

// Toutes les routes nécessitent une authentification
UserRouter.use(authenticateToken);
UserRouter.use(logAccess('users'));

// Routes accessibles aux administrateurs et directeurs
UserRouter.get('/',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
  queryValidation.pagination,
  handleValidationErrors,
  userController.getAllUsers
);

UserRouter.get('/stats',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
  userController.getUserStats
);

UserRouter.post('/',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
  requireEtablissementAccessCode,
  userController.createUser
);

// Route recherche pour le chat (publique interne)
UserRouter.get('/search',
  userController.searchUsers
);

UserRouter.get('/directory',
  userController.getDirectory
);

// Routes accessibles à tous les utilisateurs authentifiés
UserRouter.get('/:id',
  userController.getUserById
);

UserRouter.put('/:id',
  requireRole([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTEUR]),
  requireEtablissementAccessCode,
  userController.updateUser
);

UserRouter.delete('/:id',
  requireRole([RoleUtilisateur.ADMIN]),
  requireEtablissementAccessCode,
  userController.deleteUser
);

module.exports = UserRouter;
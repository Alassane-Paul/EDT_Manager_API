const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { authenticateToken } = require('../middleware/auth');

// Toutes les routes sont protégées
router.use(authenticateToken);

router.get('/conversations', chatController.getConversations);
router.get('/messages/search', chatController.searchMessages);
router.post('/conversations', chatController.startConversation);
router.get('/conversations/:id/messages', chatController.getMessages);
router.post('/conversations/:id/messages', chatController.sendMessage);
router.post('/conversations/:id/read', chatController.markAsRead);
router.delete('/messages/:messageId', chatController.deleteMessage);
router.post('/messages/:messageId/delivered', chatController.acknowledgeDelivery);

module.exports = router;

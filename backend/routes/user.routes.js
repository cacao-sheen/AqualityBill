const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.route('/')
  .get(authorize('admin'), userController.getAllUsers)
  .post(authorize('admin'), userController.createUser);

router.route('/:id')
  .get(userController.getUser)
  .put(userController.updateUser)
  .delete(authorize('admin'), userController.deleteUser);

module.exports = router;

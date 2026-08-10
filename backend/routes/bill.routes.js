const express = require('express');
const router = express.Router();
const billController = require('../controllers/bill.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.use(protect);

router.route('/')
  .get(billController.getAllBills)
  .post(authorize('admin'), billController.createBill);

router.route('/:id')
  .get(billController.getBill)
  .put(authorize('admin'), billController.updateBill)
  .delete(authorize('admin'), billController.deleteBill);

router.patch('/:id/status', authorize('admin'), billController.updatePaymentStatus);
router.patch('/:id/pay', billController.markAsPaid);

module.exports = router;

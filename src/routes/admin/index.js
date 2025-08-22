/**
 * Admin Routes Index
 * Speichern als: backend/src/routes/admin/index.js
 */

const router = require('express').Router();
const { verifyToken, requireAdmin } = require('../../middleware/auth.middleware');

// Import admin controllers
const adminController = require('../../controllers/admin/admin.controller');
const restaurantAdminController = require('../../controllers/admin/restaurant.admin.controller');
const subscriptionAdminController = require('../../controllers/admin/subscription.admin.controller');
const paymentAdminController = require('../../controllers/admin/payment.admin.controller');
const userAdminController = require('../../controllers/admin/user.admin.controller');
const planAdminController = require('../../controllers/admin/plan.admin.controller');

// Import validation middleware
const {
    validateCreateRestaurant,
    validateUpdateRestaurant,
    validateCreateSubscription,
    validateCreatePayment,
    validatePagination,
    validateDateRange,
    validateUUID
} = require('../../middleware/validation.middleware');

// Apply authentication and admin check to all routes
router.use(verifyToken, requireAdmin);

// Dashboard & System
router.get('/dashboard', adminController.getDashboardStats);
router.get('/system/health', adminController.getSystemHealth);
router.get('/activity-logs', validatePagination, adminController.getActivityLogs);
router.get('/errors', adminController.getRecentErrors);
router.post('/cache/clear', adminController.clearCache);
router.post('/maintenance', adminController.runMaintenance);
router.get('/export', validateDateRange, adminController.exportData);

// Restaurant Management
router.get('/restaurants', validatePagination, restaurantAdminController.getAllRestaurants);
router.get('/restaurants/:id', validateUUID('id'), restaurantAdminController.getRestaurantDetails);
router.post('/restaurants', validateCreateRestaurant, restaurantAdminController.createRestaurant);
router.put('/restaurants/:id', validateUUID('id'), validateUpdateRestaurant, restaurantAdminController.updateRestaurant);
router.delete('/restaurants/:id', validateUUID('id'), restaurantAdminController.deleteRestaurant);
router.patch('/restaurants/:id/status', validateUUID('id'), restaurantAdminController.toggleRestaurantStatus);
router.post('/restaurants/:id/reset-password', validateUUID('id'), restaurantAdminController.resetOwnerPassword);
router.get('/restaurants/:id/analytics', validateUUID('id'), restaurantAdminController.getRestaurantAnalytics);

// Subscription Management
router.get('/subscriptions', validatePagination, subscriptionAdminController.getAllSubscriptions);
router.get('/subscriptions/expiring', subscriptionAdminController.getExpiringSubscriptions);
router.get('/subscriptions/:id', validateUUID('id'), subscriptionAdminController.getSubscriptionDetails);
router.post('/subscriptions', validateCreateSubscription, subscriptionAdminController.createSubscription);
router.put('/subscriptions/:id', validateUUID('id'), subscriptionAdminController.updateSubscription);
router.post('/subscriptions/:id/cancel', validateUUID('id'), subscriptionAdminController.cancelSubscription);
router.post('/subscriptions/:id/extend', validateUUID('id'), subscriptionAdminController.extendSubscription);
router.post('/subscriptions/:id/change-plan', validateUUID('id'), subscriptionAdminController.changePlan);
router.post('/subscriptions/bulk-update', subscriptionAdminController.bulkUpdateSubscriptions);

// Payment Management
router.get('/payments', validatePagination, paymentAdminController.getAllPayments);
router.get('/payments/pending', paymentAdminController.getPendingPayments);
router.get('/payments/revenue-stats', validateDateRange, paymentAdminController.getRevenueStats);
router.get('/payments/:id', validateUUID('id'), paymentAdminController.getPaymentDetails);
router.post('/payments', validateCreatePayment, paymentAdminController.createPayment);
router.put('/payments/:id', validateUUID('id'), paymentAdminController.updatePayment);
router.post('/payments/:id/mark-paid', validateUUID('id'), paymentAdminController.markAsPaid);
router.post('/payments/:id/refund', validateUUID('id'), paymentAdminController.refundPayment);
router.delete('/payments/:id', validateUUID('id'), paymentAdminController.deletePayment);
router.get('/payments/:id/invoice', validateUUID('id'), paymentAdminController.generateInvoice);
router.post('/payments/bulk-update', paymentAdminController.bulkUpdatePayments);

// User Management
router.get('/users', validatePagination, userAdminController.getAllUsers);
router.get('/users/statistics', userAdminController.getUserStatistics);
router.get('/users/:id', validateUUID('id'), userAdminController.getUserDetails);
router.post('/users', userAdminController.createUser);
router.put('/users/:id', validateUUID('id'), userAdminController.updateUser);
router.delete('/users/:id', validateUUID('id'), userAdminController.deleteUser);
router.post('/users/:id/reset-password', validateUUID('id'), userAdminController.resetUserPassword);
router.patch('/users/:id/status', validateUUID('id'), userAdminController.toggleUserStatus);
router.post('/users/:id/unlock', validateUUID('id'), userAdminController.unlockUser);
router.post('/users/:id/impersonate', validateUUID('id'), userAdminController.impersonateUser);
router.post('/users/bulk-update', userAdminController.bulkUpdateUsers);

// Plan Management
router.get('/plans', planAdminController.getAllPlans);
router.get('/plans/:id', validateUUID('id'), planAdminController.getPlanDetails);
router.post('/plans', planAdminController.createPlan);
router.put('/plans/:id', validateUUID('id'), planAdminController.updatePlan);
router.delete('/plans/:id', validateUUID('id'), planAdminController.deletePlan);
router.patch('/plans/:id/status', validateUUID('id'), planAdminController.togglePlanStatus);

module.exports = router;
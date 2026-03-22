package main

import (
	"log"
	"omji/config"
	"omji/pkg/db"
	"omji/pkg/handlers"
	"omji/pkg/middleware"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.LoadConfig()

	// Validate JWT_SECRET is set (will log.Fatal if missing)
	config.GetJWTSecret()
	
	// Initialize database
	database := db.InitDB(cfg)
	db.MigrateDB(database)

	// Create Gin router
	router := gin.Default()

	// Add CORS middleware
	router.Use(middleware.CORSMiddleware())

	// Add rate limiting: 120 requests per minute per IP
	router.Use(middleware.RateLimitMiddleware(120))

	// Ensure uploads directory exists (Render has ephemeral filesystem)
	os.MkdirAll("./uploads", 0755)

	// Serve uploaded files with fallback for missing files
	router.Static("/uploads", "./uploads")

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "OMJI Backend is running!"})
	})

	// Public routes (no auth required)
	public := router.Group("/api/v1/public")
	{
		// Auth routes
		public.POST("/auth/register", handlers.Register(database))
		public.POST("/auth/login", handlers.Login(database))
		public.POST("/auth/verify-otp", handlers.VerifyOTP(database))
		public.POST("/auth/resend-otp", handlers.ResendOTP(database))
	}

	// Protected routes (auth required)
	protected := router.Group("/api/v1")
	protected.Use(middleware.AuthMiddleware())
	{
		// User routes
		protected.GET("/user/profile", handlers.GetUserProfile(database))
		protected.PUT("/user/profile", handlers.UpdateUserProfile(database))
		protected.GET("/user/addresses", handlers.GetSavedAddresses(database))
		protected.POST("/user/addresses", handlers.AddSavedAddress(database))
		protected.DELETE("/user/addresses/:id", handlers.DeleteSavedAddress(database))

		// Ride booking routes (Pasundo)
		protected.GET("/rides/nearby-drivers", handlers.GetNearbyDrivers(database))
		protected.POST("/rides/create", handlers.CreateRide(database))
		protected.GET("/rides/active", handlers.GetActiveRides(database))
		protected.GET("/rides/:id", handlers.GetRideDetails(database))
		protected.PUT("/rides/:id/cancel", handlers.CancelRide(database))
		protected.POST("/rides/:id/rate", handlers.RateRide(database))

		// Ride sharing routes (Pasabay)
		protected.POST("/rideshare/create", handlers.CreateRideShare(database))
		protected.GET("/rideshare/available", handlers.GetAvailableRideShares(database))
		protected.POST("/rideshare/:id/join", handlers.JoinRideShare(database))

		// Delivery routes (Pasugo)
		protected.POST("/deliveries/create", handlers.CreateDelivery(database))
		protected.GET("/deliveries/active", handlers.GetActiveDeliveries(database))
		protected.GET("/deliveries/:id", handlers.GetDeliveryDetails(database))
		protected.PUT("/deliveries/:id/cancel", handlers.CancelDelivery(database))
		protected.POST("/deliveries/:id/rate", handlers.RateDelivery(database))

		// Food & Store orders
		protected.GET("/stores", handlers.GetStores(database))
		protected.GET("/stores/:id/menu", handlers.GetStoreMenu(database))
		protected.POST("/orders/create", handlers.CreateOrder(database))
		protected.GET("/orders/active", handlers.GetActiveOrders(database))
		protected.GET("/orders/:id", handlers.GetOrderDetails(database))
		protected.PUT("/orders/:id/cancel", handlers.CancelOrder(database))
		protected.POST("/orders/:id/rate", handlers.RateOrder(database))

		// Payment routes
		protected.GET("/payments/methods", handlers.GetPaymentMethods(database))
		protected.POST("/payments/methods", handlers.AddPaymentMethod(database))
		protected.DELETE("/payments/methods/:id", handlers.DeletePaymentMethod(database))

		// Promo codes
		protected.GET("/promos/available", handlers.GetAvailablePromos(database))
		protected.POST("/promos/apply", handlers.ApplyPromo(database))

		// Driver routes
		protected.POST("/driver/register", handlers.RegisterDriver(database))
		protected.GET("/driver/profile", handlers.GetDriverProfile(database))
		protected.PUT("/driver/profile", handlers.UpdateDriverProfile(database))
		protected.GET("/driver/requests", handlers.GetDriverRequests(database))
		protected.POST("/driver/requests/:id/accept", handlers.AcceptRequest(database))
		protected.POST("/driver/requests/:id/reject", handlers.RejectRequest(database))
		protected.POST("/driver/requests/:id/decline-ride", handlers.DeclineRideRequest(database))
		protected.GET("/driver/earnings", handlers.GetDriverEarnings(database))
		protected.POST("/driver/availability", handlers.SetAvailability(database))
		protected.PUT("/driver/rides/:id/status", handlers.UpdateRideStatus(database))
		// Intentional: UpdateRideStatus handles both ride and delivery status updates
		protected.PUT("/driver/deliveries/:id/status", handlers.UpdateRideStatus(database))

		// Wallet routes
		protected.GET("/wallet/balance", handlers.GetWalletBalance(database))
		protected.POST("/wallet/top-up", handlers.TopUpWallet(database))
		protected.POST("/wallet/withdraw", handlers.WithdrawWallet(database))

		// Favorites routes
		protected.GET("/favorites", handlers.GetFavorites(database))
		protected.POST("/favorites", handlers.AddFavorite(database))
		protected.DELETE("/favorites/:id", handlers.DeleteFavorite(database))
		protected.GET("/favorites/check", handlers.CheckFavorite(database))

		// Ride history
		protected.GET("/rides/history", handlers.GetRideHistory(database))
		protected.GET("/deliveries/history", handlers.GetDeliveryHistory(database))
		protected.GET("/orders/history", handlers.GetOrderHistory(database))

		// Chat routes
		protected.GET("/chats/:id/messages", handlers.GetChatMessages(database))
		protected.POST("/chats/:id/message", handlers.SendChatMessage(database))

		// Notification routes
		protected.GET("/notifications", handlers.GetUserNotifications(database))
		protected.PUT("/notifications/:id/read", handlers.MarkNotificationRead(database))

		// Public rate configs (for mobile fare estimation)
		protected.GET("/rates", handlers.GetPublicRates(database))

		// Payment configs (active configs for mobile)
		protected.GET("/payment-configs", handlers.GetPaymentConfigs(database))
	}

	// Admin routes
	admin := router.Group("/api/v1/admin")
	admin.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware())
	{
		// User management
		admin.GET("/users", handlers.GetAllUsers(database))
		admin.GET("/users/:id", handlers.GetUserByID(database))
		admin.PUT("/users/:id", handlers.AdminUpdateUser(database))
		admin.DELETE("/users/:id", handlers.DeleteUser(database))

		// Driver management
		admin.GET("/drivers", handlers.GetAllDrivers(database))
		admin.PUT("/drivers/:id", handlers.AdminUpdateDriver(database))
		admin.POST("/drivers/:id/verify", handlers.VerifyDriver(database))
		admin.DELETE("/drivers/:id", handlers.DeleteDriver(database))

		// Store management
		admin.GET("/stores", handlers.AdminGetAllStores(database))
		admin.POST("/stores", handlers.CreateStore(database))
		admin.PUT("/stores/:id", handlers.UpdateStore(database))
		admin.DELETE("/stores/:id", handlers.DeleteStore(database))

		// Store menu management
		admin.GET("/stores/:id/menu", handlers.AdminGetMenuItems(database))
		admin.POST("/stores/:id/menu", handlers.AdminCreateMenuItem(database))
		admin.PUT("/stores/:id/menu/:itemId", handlers.AdminUpdateMenuItem(database))
		admin.DELETE("/stores/:id/menu/:itemId", handlers.AdminDeleteMenuItem(database))

		// Analytics
		admin.GET("/analytics/rides", handlers.GetRidesAnalytics(database))
		admin.GET("/analytics/deliveries", handlers.GetDeliveriesAnalytics(database))
		admin.GET("/analytics/orders", handlers.GetOrdersAnalytics(database))
		admin.GET("/analytics/earnings", handlers.GetEarningsAnalytics(database))
		admin.GET("/analytics/monthly-revenue", handlers.GetMonthlyRevenue(database))
		admin.GET("/analytics/growth", handlers.GetGrowthAnalytics(database))

		// Promo management
		admin.GET("/promos", handlers.GetAllPromos(database))
		admin.POST("/promos", handlers.CreatePromo(database))
		admin.PUT("/promos/:id", handlers.UpdatePromo(database))
		admin.DELETE("/promos/:id", handlers.DeletePromo(database))

		// Rides, Deliveries, Orders listing
		admin.GET("/rides", handlers.AdminGetAllRides(database))
		admin.PUT("/rides/:id/status", handlers.AdminUpdateRideStatus(database))
		admin.GET("/deliveries", handlers.AdminGetAllDeliveries(database))
		admin.PUT("/deliveries/:id/status", handlers.AdminUpdateDeliveryStatus(database))
		admin.GET("/orders", handlers.AdminGetAllOrders(database))
		admin.PUT("/orders/:id/status", handlers.AdminUpdateOrderStatus(database))

		// Activity logs
		admin.GET("/activity-logs", handlers.AdminGetActivityLogs(database))

		// Notifications
		admin.GET("/notifications", handlers.AdminGetNotifications(database))
		admin.POST("/notifications", handlers.AdminSendNotification(database))

		// Rate config management
		admin.GET("/rates", handlers.AdminGetRates(database))
		admin.POST("/rates", handlers.AdminCreateRate(database))
		admin.PUT("/rates/:id", handlers.AdminUpdateRate(database))
		admin.DELETE("/rates/:id", handlers.AdminDeleteRate(database))

		// Payment config management
		admin.GET("/payment-configs", handlers.AdminGetPaymentConfigs(database))
		admin.POST("/payment-configs", handlers.AdminCreatePaymentConfig(database))
		admin.PUT("/payment-configs/:id", handlers.AdminUpdatePaymentConfig(database))
		admin.DELETE("/payment-configs/:id", handlers.AdminDeletePaymentConfig(database))
	}

	// WebSocket routes
	router.GET("/ws/tracking/:rideId", handlers.WebSocketTrackingHandler(database))
	router.GET("/ws/driver/:driverId", handlers.WebSocketDriverHandler(database))

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 OMJI Backend starting on port %s\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

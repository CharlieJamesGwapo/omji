package main

import (
	"context"
	"database/sql"
	"log"
	"log/slog"
	"net/http"
	"oneride/config"
	"oneride/pkg/db"
	"oneride/pkg/handlers"
	"oneride/pkg/middleware"
	"oneride/pkg/validate"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	startTime time.Time
	sqlDB     *sql.DB
)

func main() {
	startTime = time.Now()

	// Configure slog for JSON output in production
	if os.Getenv("GIN_MODE") == "release" {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	}

	// Load configuration
	cfg := config.LoadConfig()

	if err := config.ValidateStartup(); err != nil {
		log.Fatalf("FATAL: startup validation: %v", err)
	}

	// Initialize database
	database := db.InitDB(cfg)
	db.MigrateDB(database)

	// Store sql.DB reference for health checks and shutdown
	var err error
	sqlDB, err = database.DB()
	if err != nil {
		log.Fatalf("Failed to get sql.DB: %v", err)
	}

	// Create Gin router (gin.New instead of gin.Default to avoid duplicate logging)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.RequestIDMiddleware())

	// Middleware stack
	router.Use(middleware.SecurityHeadersMiddleware())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.RateLimitMiddleware(120))
	router.Use(middleware.RequestLoggerMiddleware())
	// NOTE: BodySizeLimit is applied per-group (1 MB for API groups, 10 MB for
	// upload sub-groups) rather than globally so multipart uploads are not cut
	// off by the 1 MB default.

	// Upload directory (persistent disk on Render, local ./uploads in dev)
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	os.MkdirAll(uploadDir, 0755)
	router.Static("/uploads", uploadDir)

	// Health check handler — always returns 200 so Render considers the
	// service healthy even while the DB is warming up (Supabase cold starts).
	// DB status is included in the response body for debugging.
	healthHandler := func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		dbStatus := "connected"
		var dbLatency time.Duration
		dbStart := time.Now()
		if err := sqlDB.PingContext(ctx); err != nil {
			dbStatus = "disconnected"
		}
		dbLatency = time.Since(dbStart)

		dbStats := sqlDB.Stats()

		c.JSON(http.StatusOK, gin.H{
			"status":       "healthy",
			"version":      "1.0.0",
			"db":           dbStatus,
			"db_latency_ms": dbLatency.Milliseconds(),
			"db_pool": gin.H{
				"open":     dbStats.OpenConnections,
				"in_use":   dbStats.InUse,
				"idle":     dbStats.Idle,
				"max_open": dbStats.MaxOpenConnections,
			},
			"uptime":         time.Since(startTime).Round(time.Second).String(),
			"uptime_seconds": int(time.Since(startTime).Seconds()),
			"go_routines":    runtime.NumGoroutine(),
			"memory_mb": func() float64 {
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				return float64(m.Alloc) / 1024 / 1024
			}(),
		})
	}

	router.GET("/health", healthHandler)
	router.GET("/api/v1/health", healthHandler)

	// Public routes (no auth required)
	public := router.Group("/api/v1/public")
	public.Use(middleware.AuthRateLimitMiddleware(20))
	public.Use(validate.BodySizeLimit(1 << 20)) // 1 MB
	{
		// Auth routes
		public.POST("/auth/register", handlers.Register(database))
		public.POST("/auth/login", handlers.Login(database))
		public.POST("/auth/verify-otp", handlers.VerifyOTP(database))
		public.POST("/auth/resend-otp", handlers.ResendOTP(database))

		// Auth refresh
		public.POST("/auth/refresh", handlers.RefreshToken(database))

		// App version check
		public.GET("/app-version", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"success": true,
				"data": gin.H{
					"version":      "1.0.0",
					"build_number": 1,
					"force_update": false,
					"update_url":   "https://play.google.com/store/apps/details?id=com.oneridebalingasag.app",
					"changelog":    "Bug fixes and improvements",
				},
			})
		})
	}

	// Protected routes (auth required)
	protected := router.Group("/api/v1")
	protected.Use(middleware.AuthMiddleware())
	protected.Use(validate.BodySizeLimit(1 << 20)) // 1 MB for standard JSON routes
	{
		// Auth session management
		protected.POST("/auth/logout", handlers.Logout(database))
		protected.POST("/auth/logout-all", handlers.LogoutAll(database))

		// User routes
		protected.GET("/user/profile", handlers.GetUserProfile(database))
		protected.PUT("/user/profile", handlers.UpdateUserProfile(database))
		protected.POST("/user/password", middleware.UserRateLimitMiddleware(10, time.Hour), handlers.ChangePassword(database))
		protected.GET("/user/export", middleware.UserRateLimitMiddleware(5, time.Hour), handlers.ExportMyData(database))
		protected.DELETE("/user/account", handlers.DeleteMyAccount(database))
		protected.GET("/user/addresses", handlers.GetSavedAddresses(database))
		protected.POST("/user/addresses", handlers.AddSavedAddress(database))
		protected.DELETE("/user/addresses/:id", handlers.DeleteSavedAddress(database))

		// Ride booking routes (Pasundo)
		protected.GET("/rides/nearby-drivers", handlers.GetNearbyDrivers(database))
		protected.POST("/rides/create", middleware.UserRateLimitMiddleware(20, time.Hour), handlers.CreateRide(database))
		protected.GET("/rides/active", handlers.GetActiveRides(database))
		protected.GET("/rides/:id", handlers.GetRideDetails(database))
		protected.PUT("/rides/:id/cancel", handlers.CancelRide(database))
		protected.POST("/rides/:id/rate", handlers.RateRide(database))
		protected.POST("/rides/:id/rate-passenger", handlers.RatePassenger(database))

		// Ride sharing routes (Pasabay)
		protected.POST("/rideshare/create", handlers.CreateRideShare(database))
		protected.GET("/rideshare/available", handlers.GetAvailableRideShares(database))
		protected.POST("/rideshare/:id/join", handlers.JoinRideShare(database))

		// Delivery routes (Pasugo)
		protected.POST("/deliveries/create", middleware.UserRateLimitMiddleware(20, time.Hour), handlers.CreateDelivery(database))
		protected.GET("/deliveries/active", handlers.GetActiveDeliveries(database))
		protected.GET("/deliveries/:id", handlers.GetDeliveryDetails(database))
		protected.PUT("/deliveries/:id/cancel", handlers.CancelDelivery(database))
		protected.POST("/deliveries/:id/rate", handlers.RateDelivery(database))
		protected.POST("/deliveries/:id/rate-passenger", handlers.RatePassenger(database))

		// Food & Store orders
		protected.GET("/stores", handlers.GetStores(database))
		protected.GET("/stores/:id/menu", handlers.GetStoreMenu(database))
		protected.POST("/orders/create", middleware.UserRateLimitMiddleware(20, time.Hour), handlers.CreateOrder(database))
		protected.GET("/orders/active", handlers.GetActiveOrders(database))
		protected.GET("/orders/:id", handlers.GetOrderDetails(database))
		protected.PUT("/orders/:id/cancel", handlers.CancelOrder(database))
		protected.POST("/orders/:id/rate", handlers.RateOrder(database))

		// Payment routes
		protected.GET("/payments/methods", handlers.GetPaymentMethods(database))
		protected.POST("/payments/methods", handlers.AddPaymentMethod(database))
		protected.DELETE("/payments/methods/:id", handlers.DeletePaymentMethod(database))

		// Payment proof routes
		// NOTE: /payment-proof/upload is registered on the 10 MB upload sub-group below
		protected.POST("/payment-proof/submit", handlers.SubmitPaymentProof(database))
		protected.GET("/payment-proof/:serviceType/:serviceId", handlers.GetPaymentProofStatus(database))

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
		protected.POST("/driver/withdraw", middleware.UserRateLimitMiddleware(5, 24*time.Hour), handlers.RequestWithdrawal(database))
		protected.GET("/driver/withdrawals", handlers.GetWithdrawals(database))
		protected.POST("/driver/availability", handlers.SetAvailability(database))
		protected.PUT("/driver/rides/:id/status", handlers.UpdateRideStatus(database))
		// Intentional: UpdateRideStatus handles both ride and delivery status updates
		protected.PUT("/driver/deliveries/:id/status", handlers.UpdateRideStatus(database))

		// Rider payment proof verification
		protected.GET("/driver/payment-proof/:serviceType/:serviceId", handlers.RiderGetPaymentProof(database))
		protected.PUT("/driver/payment-proof/:id/verify", handlers.RiderVerifyPaymentProof(database))
		protected.PUT("/driver/payment-proof/:id/reject", handlers.RiderRejectPaymentProof(database))

		// Wallet routes
		protected.GET("/wallet/balance", handlers.GetWalletBalance(database))
		protected.POST("/wallet/top-up", handlers.TopUpWallet(database))
		protected.POST("/wallet/withdraw", middleware.UserRateLimitMiddleware(5, 24*time.Hour), handlers.WithdrawWallet(database))

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
		// NOTE: /chats/:id/image is registered on the 10 MB upload sub-group below

		// Push token routes
		protected.POST("/push-token", handlers.RegisterPushToken(database))
		protected.DELETE("/push-token", handlers.RemovePushToken(database))

		// Notification routes
		protected.GET("/notifications", handlers.GetUserNotifications(database))
		protected.PUT("/notifications/:id/read", handlers.MarkNotificationRead(database))

		// Referral routes
		protected.GET("/referral/code", handlers.GetReferralCode(database))
		protected.POST("/referral/apply", handlers.ApplyReferralCode(database))
		protected.GET("/referral/stats", handlers.GetReferralStats(database))

		// Announcements (for mobile)
		protected.GET("/announcements", handlers.GetAnnouncements(database))

		// Public rate configs (for mobile fare estimation)
		protected.GET("/rates", handlers.GetPublicRates(database))

		// Payment configs (active configs for mobile)
		protected.GET("/payment-configs", handlers.GetPaymentConfigs(database))

		// WebSocket ticket issuance — client calls this to get a short-lived,
		// one-time ticket before opening a WebSocket connection.
		protected.POST("/ws/ticket", handlers.IssueWSTicket)
	}

	// Admin routes
	admin := router.Group("/api/v1/admin")
	admin.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware(), middleware.AdminFreshMiddleware(database))
	admin.Use(validate.BodySizeLimit(1 << 20)) // 1 MB for standard JSON admin routes
	{
		// Server metrics (admin-only)
		admin.GET("/metrics", func(c *gin.Context) {
			dbStats := sqlDB.Stats()
			var m runtime.MemStats
			runtime.ReadMemStats(&m)

			c.JSON(http.StatusOK, gin.H{
				"server": gin.H{
					"uptime":      time.Since(startTime).Round(time.Second).String(),
					"go_routines": runtime.NumGoroutine(),
					"go_version":  runtime.Version(),
					"num_cpu":     runtime.NumCPU(),
				},
				"memory": gin.H{
					"alloc_mb":       float64(m.Alloc) / 1024 / 1024,
					"total_alloc_mb": float64(m.TotalAlloc) / 1024 / 1024,
					"sys_mb":         float64(m.Sys) / 1024 / 1024,
					"gc_cycles":      m.NumGC,
				},
				"database": gin.H{
					"open_connections":     dbStats.OpenConnections,
					"in_use":              dbStats.InUse,
					"idle":                dbStats.Idle,
					"max_open":            dbStats.MaxOpenConnections,
					"wait_count":          dbStats.WaitCount,
					"wait_duration_ms":    dbStats.WaitDuration.Milliseconds(),
					"max_idle_closed":     dbStats.MaxIdleClosed,
					"max_lifetime_closed": dbStats.MaxLifetimeClosed,
				},
			})
		})

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
		admin.GET("/analytics/extended", handlers.AdminGetExtendedAnalytics(database))

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
		// Audit logs (security-focused append-only trail)
		admin.GET("/audit-logs", handlers.AdminGetAuditLogs(database))

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
		// NOTE: /payment-configs/upload-qr is registered on the 10 MB admin upload sub-group below
		admin.PUT("/payment-configs/:id", handlers.AdminUpdatePaymentConfig(database))
		admin.DELETE("/payment-configs/:id", handlers.AdminDeletePaymentConfig(database))

		// Payment proof management
		admin.GET("/payment-proofs", handlers.AdminGetPaymentProofs(database))
		admin.PUT("/payment-proof/:id/verify", handlers.AdminVerifyPaymentProof(database))
		admin.PUT("/payment-proof/:id/reject", handlers.AdminRejectPaymentProof(database))

		// Commission management
		admin.GET("/commission/config", handlers.AdminGetCommissionConfig(database))
		admin.PUT("/commission/config", handlers.AdminUpdateCommissionConfig(database))
		admin.GET("/commission/records", handlers.AdminGetCommissionRecords(database))
		admin.GET("/commission/summary", handlers.AdminGetCommissionSummary(database))

		// Announcement management
		admin.GET("/announcements", handlers.AdminGetAnnouncements(database))
		admin.POST("/announcements", handlers.AdminCreateAnnouncement(database))
		admin.PUT("/announcements/:id", handlers.AdminUpdateAnnouncement(database))
		admin.DELETE("/announcements/:id", handlers.AdminDeleteAnnouncement(database))

		// Scheduled rides processing
		admin.GET("/process-scheduled", handlers.ProcessScheduledRides(database))

		// Withdrawal management
		admin.GET("/withdrawals", handlers.AdminGetWithdrawals(database))
		admin.PUT("/withdrawals/:id", handlers.AdminUpdateWithdrawal(database))

		// Referral management
		admin.GET("/referrals", handlers.AdminGetReferrals(database))
	}

	// Upload sub-groups — 10 MB body limit for multipart image uploads.
	// These inherit the full auth middleware chain but override the body limit.

	// Authenticated-user upload routes (auth required, 10 MB)
	userUpload := router.Group("/api/v1")
	userUpload.Use(middleware.AuthMiddleware())
	userUpload.Use(validate.BodySizeLimit(10 << 20)) // 10 MB for uploads
	{
		userUpload.POST("/payment-proof/upload", middleware.UserRateLimitMiddleware(10, time.Hour), handlers.UploadPaymentProof(database))
		userUpload.POST("/chats/:id/image", handlers.ChatImageUpload(database))
	}

	// Admin upload routes (auth + admin required, 10 MB)
	adminUpload := router.Group("/api/v1/admin")
	adminUpload.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware(), middleware.AdminFreshMiddleware(database))
	adminUpload.Use(validate.BodySizeLimit(10 << 20)) // 10 MB for uploads
	{
		adminUpload.POST("/payment-configs/upload-qr", handlers.AdminUploadQRCode(database))
	}

	// WebSocket routes — authenticated via one-time ticket (?ticket=…).
	// Clients must first POST /api/v1/ws/ticket (protected route) to obtain a
	// 30-second ticket, then pass it as the "ticket" query parameter when
	// opening the WebSocket connection.
	ws := router.Group("/ws")
	ws.Use(middleware.WebSocketTicketMiddleware())
	{
		ws.GET("/tracking/:rideId", handlers.WebSocketTrackingHandler(database))
		ws.GET("/driver/:driverId", handlers.WebSocketDriverHandler(database))
		ws.GET("/chat/:rideId", handlers.WebSocketChatHandler(database))
	}

	// Start server with graceful shutdown
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		slog.Info("ONE RIDE Backend starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("Shutting down server...")

	// Close all WebSocket connections first
	handlers.CloseAllWebSockets()
	slog.Info("WebSocket connections closed")

	// Give in-flight requests up to 10 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced shutdown", "error", err)
	}

	// Close database connection
	if err := sqlDB.Close(); err != nil {
		slog.Error("Database close error", "error", err)
	}

	slog.Info("Server exited cleanly")
}

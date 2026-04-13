package models

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// User model
type User struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Name               string    `json:"name"`
	Email              string    `gorm:"uniqueIndex" json:"email"`
	Phone              string    `gorm:"uniqueIndex" json:"phone"`
	Password           string    `json:"-"`
	ProfileImage       string    `json:"profile_image"`
	OTPCode            string    `json:"-"`
	OTPExpiry          time.Time `json:"-"`
	IsVerified         bool      `gorm:"default:false" json:"is_verified"`
	Role               string    `gorm:"default:'user'" json:"role"` // user, driver, admin
	Rating             float64   `gorm:"default:0" json:"rating"`
	TotalRatings       int       `gorm:"default:0" json:"total_ratings"`
	SavedAddresses     []SavedAddress
	PaymentMethods     []PaymentMethod
	RideHistory        []Ride
	DeliveryHistory    []Delivery
	OrderHistory       []Order
	ReferralCode       string    `gorm:"uniqueIndex" json:"referral_code,omitempty"`
	TokenVersion       int        `gorm:"default:1;not null" json:"-"`
	FailedLoginCount   int        `gorm:"default:0" json:"-"`
	LockedUntil        *time.Time `json:"-"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// Referral model
type Referral struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	ReferrerID    uint      `gorm:"index" json:"referrer_id"`
	ReferredID    uint      `gorm:"uniqueIndex" json:"referred_id"`
	ReferrerBonus float64   `gorm:"default:0" json:"referrer_bonus"`
	ReferredBonus float64   `gorm:"default:0" json:"referred_bonus"`
	Status        string    `gorm:"default:pending" json:"status"` // pending, completed
	CreatedAt     time.Time `json:"created_at"`
}

// SavedAddress model
type SavedAddress struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `json:"user_id"`
	Label     string    `json:"label"` // Home, Work, etc.
	Address   string    `json:"address"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	CreatedAt time.Time `json:"created_at"`
}

// PaymentMethod model
type PaymentMethod struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `json:"user_id"`
	Type      string    `json:"type"` // card, gcash, payamya, cash
	Token     string    `json:"-"`
	IsDefault bool      `gorm:"default:false" json:"is_default"`
	CreatedAt time.Time `json:"created_at"`
}

// Driver model
type Driver struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"uniqueIndex" json:"user_id"`
	User            User
	VehicleType     string    `json:"vehicle_type"` // motorcycle, car
	VehicleModel    string    `json:"vehicle_model"`
	VehiclePlate    string    `gorm:"uniqueIndex" json:"vehicle_plate"`
	LicenseNumber   string    `gorm:"uniqueIndex" json:"license_number"`
	IsVerified      bool      `gorm:"default:false;index:idx_driver_verified_available,priority:1" json:"is_verified"`
	IsAvailable     bool      `gorm:"default:false;index:idx_driver_verified_available,priority:2" json:"is_available"`
	CurrentLatitude float64   `json:"current_latitude"`
	CurrentLongitude float64  `json:"current_longitude"`
	TotalEarnings   float64   `gorm:"default:0" json:"total_earnings"`
	CompletedRides  int       `gorm:"default:0" json:"completed_rides"`
	Rating          float64   `gorm:"default:0" json:"rating"`
	TotalRatings    int       `gorm:"default:0" json:"total_ratings"`
	Documents       datatypes.JSON `json:"documents"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Ride model (Pasundo)
type Ride struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	UserID              *uint     `gorm:"index:idx_ride_user_status" json:"user_id"`
	User                *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	DriverID            *uint     `gorm:"index:idx_ride_driver_status" json:"driver_id,omitempty"`
	Driver              *Driver
	PickupLocation      string    `json:"pickup_location"`
	PickupLatitude      float64   `json:"pickup_latitude"`
	PickupLongitude     float64   `json:"pickup_longitude"`
	DropoffLocation     string    `json:"dropoff_location"`
	DropoffLatitude     float64   `json:"dropoff_latitude"`
	DropoffLongitude    float64   `json:"dropoff_longitude"`
	Distance            float64   `json:"distance"` // in km
	EstimatedFare       float64   `json:"estimated_fare"`
	FinalFare           float64   `json:"final_fare"`
	Status              string    `gorm:"default:'pending';index:idx_ride_user_status;index:idx_ride_driver_status;index:idx_ride_status_driver" json:"status"` // pending, accepted, in_progress, completed, cancelled
	VehicleType         string    `json:"vehicle_type"` // motorcycle, car
	PromoID             *uint     `json:"promo_id,omitempty"`
	Promo               *Promo
	UserRating          *float64  `json:"user_rating,omitempty"`
	UserReview          string    `json:"user_review"`
	DriverRating        *float64  `json:"driver_rating,omitempty"`
	DriverReview        string    `json:"driver_review"`
	PaymentMethod       string    `gorm:"default:'cash';index:idx_ride_payment" json:"payment_method"`
	PaymentStatus       string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
	ScheduledAt         *time.Time `json:"scheduled_at,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	CancellationReason  string     `json:"cancellation_reason,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	CreatedAt           time.Time `gorm:"index" json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// RideShare model (Pasabay)
type RideShare struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	DriverID            *uint     `json:"driver_id"`
	Driver              *Driver   `gorm:"foreignKey:DriverID" json:"driver,omitempty"`
	PickupLocation      string    `json:"pickup_location"`
	PickupLatitude      float64   `json:"pickup_latitude"`
	PickupLongitude     float64   `json:"pickup_longitude"`
	DropoffLocation     string    `json:"dropoff_location"`
	DropoffLatitude     float64   `json:"dropoff_latitude"`
	DropoffLongitude    float64   `json:"dropoff_longitude"`
	TotalSeats          int       `json:"total_seats"`
	AvailableSeats      int       `json:"available_seats"`
	BaseFare            float64   `json:"base_fare"`
	Passengers          []User    `gorm:"many2many:rideshare_passengers;" json:"passengers"`
	Status              string    `gorm:"default:'active'" json:"status"` // active, completed, cancelled
	DepartureTime       time.Time `json:"departure_time"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// Delivery model (Pasugo)
type Delivery struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	UserID              *uint     `gorm:"index:idx_delivery_user_status" json:"user_id"`
	User                *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	DriverID            *uint     `gorm:"index:idx_delivery_driver_status" json:"driver_id,omitempty"`
	Driver              *Driver
	PickupLocation      string    `json:"pickup_location"`
	PickupLatitude      float64   `json:"pickup_latitude"`
	PickupLongitude     float64   `json:"pickup_longitude"`
	DropoffLocation     string    `json:"dropoff_location"`
	DropoffLatitude     float64   `json:"dropoff_latitude"`
	DropoffLongitude    float64   `json:"dropoff_longitude"`
	ItemDescription     string    `json:"item_description"`
	ItemPhoto           string    `json:"item_photo"`
	Notes               string    `json:"notes"`
	Weight              float64   `json:"weight"` // in kg
	Distance            float64   `json:"distance"` // in km
	DeliveryFee         float64   `json:"delivery_fee"`
	Tip                 float64   `gorm:"default:0" json:"tip"`
	Status              string    `gorm:"default:'pending';index:idx_delivery_user_status;index:idx_delivery_driver_status;index:idx_delivery_status_driver" json:"status"` // pending, accepted, in_progress, completed, cancelled
	PaymentMethod       string    `gorm:"default:'cash';index:idx_delivery_payment" json:"payment_method"`
	PaymentStatus       string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
	BarcodeNumber       string    `json:"barcode_number"`
	PromoID             *uint     `json:"promo_id,omitempty"`
	Promo               *Promo
	ScheduledAt         *time.Time `json:"scheduled_at,omitempty"`
	UserRating          *float64  `json:"user_rating,omitempty"`
	DriverRating        *float64  `json:"driver_rating,omitempty"`
	CancellationReason  string     `json:"cancellation_reason,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	CreatedAt           time.Time `gorm:"index" json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// Store model
type Store struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Name          string    `json:"name"`
	Category      string    `json:"category"` // restaurant, grocery, pharmacy, etc.
	Latitude      float64   `json:"latitude"`
	Longitude     float64   `json:"longitude"`
	Address       string    `json:"address"`
	Phone         string    `json:"phone"`
	Description   string    `json:"description"`
	Logo          string    `json:"logo"`
	OpeningHours  string    `gorm:"default:'06:00-23:00'" json:"opening_hours"`
	IsOpen        bool      `gorm:"default:true" json:"is_open"`
	IsVerified    bool      `gorm:"default:false" json:"is_verified"`
	Rating        float64   `gorm:"default:5" json:"rating"`
	TotalRatings  int       `gorm:"default:0" json:"total_ratings"`
	Menu          []MenuItem
	Orders        []Order
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// MenuItem model
type MenuItem struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StoreID   uint      `json:"store_id"`
	Store     Store
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"`
	Image     string    `json:"image"`
	Category  string    `json:"category"` // food, drink, etc.
	Available bool      `gorm:"default:true" json:"available"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Order model (Food/Store orders)
type Order struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	UserID           *uint     `gorm:"index:idx_order_user_status" json:"user_id"`
	User             *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	StoreID          *uint     `gorm:"index;index:idx_order_store_status,priority:1" json:"store_id"`
	Store            *Store    `gorm:"foreignKey:StoreID" json:"store,omitempty"`
	Items            datatypes.JSON `json:"items"` // Array of {item_id, quantity, price}
	Subtotal         float64   `json:"subtotal"`
	DeliveryFee      float64   `json:"delivery_fee"`
	Tax              float64   `json:"tax"`
	TotalAmount      float64   `json:"total_amount"`
	PromoID          *uint     `json:"promo_id,omitempty"`
	Promo            *Promo
	Status           string    `gorm:"default:'pending';index:idx_order_user_status;index:idx_order_store_status,priority:2" json:"status"` // pending, confirmed, preparing, ready, out_for_delivery, delivered, cancelled
	DeliveryLocation string    `json:"delivery_location"`
	DeliveryLatitude float64   `json:"delivery_latitude"`
	DeliveryLongitude float64  `json:"delivery_longitude"`
	PaymentMethod    string    `gorm:"index:idx_order_payment" json:"payment_method"` // cash, card, gcash, payamya
	PaymentStatus    string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
	UserRating       *float64  `json:"user_rating,omitempty"`
	StoreRating      *float64  `json:"store_rating,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Promo model
type Promo struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	Code            string    `gorm:"uniqueIndex" json:"code"`
	Description     string    `json:"description"`
	DiscountType    string    `json:"discount_type"` // percentage, fixed
	DiscountValue   float64   `json:"discount_value"`
	MinimumAmount   float64   `json:"minimum_amount"`
	MaxDiscount     float64   `json:"max_discount"`
	UsageLimit      int       `json:"usage_limit"`
	UsageCount      int       `gorm:"default:0" json:"usage_count"`
	ApplicableTo    string    `json:"applicable_to"` // rides, deliveries, orders, all
	StartDate       time.Time `json:"start_date"`
	EndDate         time.Time `json:"end_date"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ChatMessage model
type ChatMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SenderID  *uint     `gorm:"index;index:idx_chat_sender_created,priority:1" json:"sender_id"`
	ReceiverID *uint    `gorm:"index;index:idx_chat_receiver_created,priority:1" json:"receiver_id"`
	RideID    *uint     `gorm:"index" json:"ride_id,omitempty"`
	Message   string    `json:"message"`
	ImageURL  string    `json:"image_url,omitempty"`
	CreatedAt time.Time `gorm:"index:idx_chat_sender_created,priority:2;index:idx_chat_receiver_created,priority:2" json:"created_at"`
}

// PushToken model
type PushToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex" json:"user_id"`
	Token     string    `json:"token"`
	Platform  string    `json:"platform"` // "android" or "ios"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Notification model
type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;index:idx_notification_user_read,priority:1" json:"user_id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Type      string    `json:"type"` // ride_request, delivery_request, order_update, promo
	Read      bool      `gorm:"default:false;index:idx_notification_user_read,priority:2" json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

// Favorite model
type Favorite struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;index:idx_favorite_user_type_item,priority:1" json:"user_id"`
	Type      string    `gorm:"index:idx_favorite_user_type_item,priority:2" json:"type"` // store, driver
	ItemID    uint      `gorm:"index:idx_favorite_user_type_item,priority:3" json:"item_id"` // store_id or driver_id
	CreatedAt time.Time `json:"created_at"`
}

// Wallet model
type Wallet struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex" json:"user_id"`
	Balance   float64   `gorm:"default:0" json:"balance"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WalletTransaction model
type WalletTransaction struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	WalletID    *uint     `gorm:"index" json:"wallet_id"`
	UserID      *uint     `gorm:"index" json:"user_id"`
	Type        string    `json:"type"` // top_up, withdrawal, payment, refund, earning
	Amount      float64   `json:"amount"`
	Description string    `json:"description"`
	Reference   string    `json:"reference"`
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
}

// RateConfig model for admin-managed pricing
type RateConfig struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	ServiceType   string    `gorm:"uniqueIndex:idx_rate_service_vehicle" json:"service_type"` // ride, delivery, order
	VehicleType   string    `gorm:"uniqueIndex:idx_rate_service_vehicle;default:''" json:"vehicle_type"` // motorcycle, car, or empty for delivery/order
	BaseFare      float64   `json:"base_fare"`
	RatePerKm     float64   `json:"rate_per_km"`
	MinimumFare   float64   `gorm:"default:0" json:"minimum_fare"`
	Description   string    `json:"description"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// PaymentConfig model for admin-managed payment accounts (GCash, Maya)
type PaymentConfig struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Type          string    `gorm:"uniqueIndex" json:"type"` // gcash, maya
	AccountName   string    `json:"account_name"`
	AccountNumber string    `json:"account_number"`
	QRCodeURL     string    `json:"qr_code_url"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// PaymentProof stores proof-of-payment for GCash/Maya transactions
type PaymentProof struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ServiceType     string    `gorm:"index:idx_proof_service;not null" json:"service_type"` // ride, delivery, order
	ServiceID       uint      `gorm:"index:idx_proof_service;not null" json:"service_id"`
	UserID          uint      `gorm:"index:idx_proof_user_status;not null" json:"user_id"`
	User            *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	PaymentMethod   string    `gorm:"not null" json:"payment_method"` // gcash, maya
	ReferenceNumber string    `gorm:"not null" json:"reference_number"`
	Amount          float64   `gorm:"not null" json:"amount"`
	ProofImageURL   string    `gorm:"type:text;not null" json:"proof_image_url"` // base64 data URL
	Status          string    `gorm:"default:'submitted';index:idx_proof_user_status;index:idx_proof_status" json:"status"` // submitted, verified, rejected
	VerifiedByID    *uint     `json:"verified_by_id,omitempty"`
	VerifiedByRole  string    `json:"verified_by_role,omitempty"` // rider, admin
	RejectionReason string    `json:"rejection_reason,omitempty"`
	AttemptNumber   int       `gorm:"default:1" json:"attempt_number"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// CommissionConfig model for admin-managed platform commission
type CommissionConfig struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Percentage float64   `gorm:"default:10" json:"percentage"` // e.g. 15.0 = 15%
	IsActive   bool      `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// CommissionRecord tracks commission per completed service
type CommissionRecord struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	ServiceType          string    `gorm:"index:idx_commission_service_type" json:"service_type"` // ride, delivery, order
	ServiceID            uint      `json:"service_id"`
	DriverID             uint      `gorm:"index:idx_commission_driver_id" json:"driver_id"`
	Driver               Driver    `gorm:"foreignKey:DriverID" json:"driver,omitempty"`
	TotalFare            float64   `json:"total_fare"`
	CommissionPercentage float64   `json:"commission_percentage"`
	CommissionAmount     float64   `json:"commission_amount"`
	PaymentMethod        string    `json:"payment_method"`
	Status               string    `gorm:"index:idx_commission_status;default:'pending_collection'" json:"status"` // deducted, pending_collection
	CreatedAt            time.Time `json:"created_at"`
}

// WithdrawalRequest model for driver cash-out requests
type WithdrawalRequest struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	DriverID      uint      `gorm:"index" json:"driver_id"`
	Driver        Driver    `gorm:"foreignKey:DriverID" json:"Driver,omitempty"`
	Amount        float64   `json:"amount"`
	Method        string    `json:"method"` // "gcash" or "maya"
	AccountNumber string    `json:"account_number"`
	AccountName   string    `json:"account_name"`
	Status        string    `gorm:"default:pending" json:"status"` // pending, approved, rejected, completed
	Note          string    `json:"note,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Announcement model for in-app news/announcements
type Announcement struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Title     string     `json:"title"`
	Message   string     `json:"message"`
	Type      string     `gorm:"default:info" json:"type"` // info, warning, promo, update
	IsActive  bool       `gorm:"default:true" json:"is_active"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// AuditLog is an append-only record of sensitive actions for security review.
// Never update or delete rows in this table.
type AuditLog struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	ActorUserID *uint          `gorm:"index" json:"actor_user_id"`
	ActorRole   string         `gorm:"index" json:"actor_role"`
	Action      string         `gorm:"index;not null" json:"action"`
	TargetType  string         `gorm:"index" json:"target_type"`
	TargetID    string         `gorm:"index" json:"target_id"`
	Metadata    datatypes.JSON `json:"metadata"`
	IP          string         `json:"ip"`
	UserAgent   string         `json:"user_agent"`
	RequestID   string         `gorm:"index" json:"request_id"`
	CreatedAt   time.Time      `gorm:"index" json:"created_at"`
}

// RefreshToken tracks issued refresh tokens. The raw token is never stored;
// only a salted SHA-256 hash. FamilyID groups rotated tokens so reuse of any
// historical token can revoke the entire family (theft detection).
type RefreshToken struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"user_id"`
	FamilyID  string     `gorm:"index;not null" json:"family_id"`
	TokenHash string     `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time  `gorm:"index;not null" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	UserAgent string     `json:"user_agent"`
	IP        string     `json:"ip"`
	CreatedAt time.Time  `json:"created_at"`
}

// AutoMigrate is used for database migrations
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&SavedAddress{},
		&PaymentMethod{},
		&Driver{},
		&Ride{},
		&RideShare{},
		&Delivery{},
		&Store{},
		&MenuItem{},
		&Order{},
		&Promo{},
		&ChatMessage{},
		&Notification{},
		&Wallet{},
		&WalletTransaction{},
		&Favorite{},
		&RateConfig{},
		&PaymentConfig{},
		&CommissionConfig{},
		&CommissionRecord{},
		&PushToken{},
		&WithdrawalRequest{},
		&PaymentProof{},
		&Referral{},
		&Announcement{},
		&AuditLog{},
		&RefreshToken{},
	)
}


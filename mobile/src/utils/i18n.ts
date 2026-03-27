import AsyncStorage from '@react-native-async-storage/async-storage';

type Lang = 'en' | 'ceb';

const translations: Record<string, Record<Lang, string>> = {
  // Home
  'home.greeting': { en: 'Good morning', ceb: 'Maayong buntag' },
  'home.greeting_afternoon': { en: 'Good afternoon', ceb: 'Maayong hapon' },
  'home.greeting_evening': { en: 'Good evening', ceb: 'Maayong gabii' },
  'home.where_to': { en: 'Where do you want to go?', ceb: 'Asa ka gusto moadto?' },
  'home.quick_book': { en: 'Quick Book', ceb: 'Dali nga Book' },
  'home.recent_trips': { en: 'Recent Trips', ceb: 'Bag-o nga Biyahe' },
  'home.view_all': { en: 'View All', ceb: 'Tan-awa Tanan' },

  // Services
  'service.ride': { en: 'Ride', ceb: 'Sakay' },
  'service.delivery': { en: 'Delivery', ceb: 'Padala' },
  'service.rideshare': { en: 'Ride Share', ceb: 'Pasabay' },
  'service.food': { en: 'Food & Orders', ceb: 'Pagkaon' },

  // Booking
  'booking.pickup': { en: 'Pickup Location', ceb: 'Lugar sa Pagkuha' },
  'booking.dropoff': { en: 'Dropoff Location', ceb: 'Lugar sa Pagdala' },
  'booking.book_ride': { en: 'Book Ride', ceb: 'Mag-book og Sakay' },
  'booking.book_delivery': { en: 'Book Delivery', ceb: 'Mag-book og Padala' },
  'booking.schedule': { en: 'Schedule', ceb: 'Ipatakda' },
  'booking.now': { en: 'Now', ceb: 'Karon' },
  'booking.confirm': { en: 'Confirm Booking', ceb: 'Kumpirma sa Booking' },
  'booking.estimated_fare': { en: 'Estimated Fare', ceb: 'Gibanabana nga Bayad' },
  'booking.distance': { en: 'Distance', ceb: 'Distansya' },

  // Tracking
  'tracking.finding_rider': { en: 'Finding Your Rider', ceb: 'Nangita og Rider' },
  'tracking.rider_on_way': { en: 'Rider On the Way', ceb: 'Padulong na ang Rider' },
  'tracking.rider_arrived': { en: 'Rider Has Arrived', ceb: 'Niabot na ang Rider' },
  'tracking.on_the_way': { en: 'On the Way', ceb: 'Padulong na' },
  'tracking.trip_complete': { en: 'Trip Complete', ceb: 'Nahuman na ang Biyahe' },
  'tracking.cancelled': { en: 'Trip Cancelled', ceb: 'Na-cancel ang Biyahe' },

  // Chat
  'chat.type_message': { en: 'Type a message...', ceb: 'Mag-type og mensahe...' },
  'chat.waiting_outside': { en: "I'm waiting outside", ceb: 'Naghulat ko sa gawas' },
  'chat.on_my_way': { en: 'On my way!', ceb: 'Padulong na ko!' },
  'chat.where_are_you': { en: 'Where are you?', ceb: 'Asa ka?' },
  'chat.thanks': { en: 'Thanks!', ceb: 'Salamat!' },
  'chat.im_here': { en: "I'm here", ceb: 'Nia na ko' },

  // Payment
  'payment.total': { en: 'Total Amount', ceb: 'Kinatibuk-ang Kantidad' },
  'payment.pay_via': { en: 'Pay via', ceb: 'Bayad pinaagi sa' },
  'payment.cash': { en: 'Cash', ceb: 'Cash' },
  'payment.wallet': { en: 'Wallet', ceb: 'Wallet' },

  // Profile
  'profile.refer_earn': { en: 'Refer & Earn', ceb: 'Mag-refer ug Kita' },
  'profile.settings': { en: 'Settings', ceb: 'Settings' },
  'profile.language': { en: 'Language', ceb: 'Pinulongan' },
  'profile.logout': { en: 'Logout', ceb: 'Logout' },

  // Rating
  'rating.rate_rider': { en: 'Rate Your Rider', ceb: 'I-rate ang Rider' },
  'rating.rate_passenger': { en: 'Rate Your Passenger', ceb: 'I-rate ang Pasahero' },
  'rating.submit': { en: 'Submit Rating', ceb: 'I-submit ang Rating' },

  // Common
  'common.cancel': { en: 'Cancel', ceb: 'Kanselahon' },
  'common.confirm': { en: 'Confirm', ceb: 'Kumpirma' },
  'common.done': { en: 'Done', ceb: 'Nahuman' },
  'common.loading': { en: 'Loading...', ceb: 'Nagkarga...' },
  'common.error': { en: 'Error', ceb: 'Sayop' },
  'common.success': { en: 'Success', ceb: 'Malampuson' },
  'common.retry': { en: 'Retry', ceb: 'Sulayi pag-usab' },

  // Rider Dashboard
  'rider.go_online': { en: 'Go Online', ceb: 'Mag-online' },
  'rider.go_offline': { en: 'Go Offline', ceb: 'Mag-offline' },
  'rider.scanning': { en: 'Scanning for requests...', ceb: 'Nangita og requests...' },
  'rider.accept': { en: 'Accept', ceb: 'Dawata' },
  'rider.decline': { en: 'Decline', ceb: 'Balibari' },
  'rider.earnings': { en: 'Earnings', ceb: 'Kita' },
  'rider.withdraw': { en: 'Withdraw', ceb: 'Kuhaon' },

  // SOS
  'sos.title': { en: 'Emergency', ceb: 'Emerhensya' },
  'sos.call_911': { en: 'Call Emergency (911)', ceb: 'Tawag sa 911' },
  'sos.call_support': { en: 'Call OMJI Support', ceb: 'Tawag sa OMJI Support' },
  'sos.share_location': { en: 'Share Live Location', ceb: 'I-share ang Location' },
};

let currentLang: Lang = 'en';

export function t(key: string): string {
  return translations[key]?.[currentLang] || translations[key]?.en || key;
}

export function setLanguage(lang: Lang) {
  currentLang = lang;
  AsyncStorage.setItem('app_language', lang).catch(() => {});
}

export function getLanguage(): Lang {
  return currentLang;
}

export async function loadLanguage(): Promise<Lang> {
  try {
    const saved = await AsyncStorage.getItem('app_language');
    if (saved === 'en' || saved === 'ceb') {
      currentLang = saved;
    }
  } catch {}
  return currentLang;
}

export type { Lang };

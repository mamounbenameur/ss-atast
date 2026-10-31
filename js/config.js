// =====================================================================
//  ATAST Student Section - CONFIGURATION
//  This is the only file you need to edit to set up the site.
// =====================================================================

// 1) FIREBASE CONFIG  (Firebase console > Project settings > Your apps > SDK config)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOta9y9YsORL-UJ4soil9tqpJYgbOd5WQ",
  authDomain: "atast-ss.firebaseapp.com",
  databaseURL: "https://atast-ss-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "atast-ss",
  storageBucket: "atast-ss.firebasestorage.app",
  messagingSenderId: "9645354592",
  appId: "1:9645354592:web:db01514eaefbb5d5279d05"
};

// 2) CLUBS + EVENT MANAGER EMAILS
//    managerEmail = the Firebase Authentication email of that club's event manager (lowercase).
//    Create the same user in Firebase: Authentication > Users > Add user.
//    Put the SAME email in the database "managers" node too (see firebase-managers.json),
//    because the database rules use it to decide who may write for which club.
//    Leave managerEmail empty ('') for a club that has no manager yet.
export const CLUBS = [
  { id: 'c1', name: 'ATAST Club UPSAT Sousse', color: '#3D6BF0', managerName: 'Hassen Ammara',     managerEmail: 'kalifameriam12@gmail.com' },
  { id: 'c2', name: 'ATAST Club ISSATSO',      color: '#C6438E', managerName: 'Abderrahman Limem', managerEmail: 'limemabderrahman@gmail.com' },
  { id: 'c3', name: 'ATAST Club ISIMM',        color: '#2E9B5C', managerName: 'Bouajila Yosr',     managerEmail: 'bouajilayosr@gmail.com' },
  { id: 'c10', name: 'ATAST Club ISIMA',       color: '#8D5A3B', managerName: 'Lina Boubaker',                  managerEmail: 'linaboubaker2006@gmail.com' },
  { id: 'c4', name: 'ATAST Club ISACM',        color: '#8CC63F', managerName: '',                  managerEmail: 'atastisacm@gmail.com' },
  { id: 'c5', name: 'ATAST Club Horizon',      color: '#E8792B', managerName: 'Adem Hmila',        managerEmail: 'adem.hmila@horizon-university.tn' },
  { id: 'c6', name: 'ATAST Club FMS',          color: '#2AACA4', managerName: 'Chaima Hmida',      managerEmail: 'chaimahmida16@gmail.com' },
  { id: 'c7', name: 'ATAST Club ISITCOM',      color: '#7B5FE0', managerName: 'Houssem Ahmed',     managerEmail: 'ahmedhoussem640@gmail.com' },
  { id: 'c8', name: 'ATAST Club ISMAIK',       color: '#E0B23D', managerName: 'Sara Aouinet',      managerEmail: 'saraaouinet14@gmail.com' },
  { id: 'c9', name: 'ATAST Club ISGIK',        color: '#E0473D', managerName: 'Fedi Mejrissi',     managerEmail: 'fedimejrissi26@gmail.com' },
];

// 2b) ADMIN EMAIL - this account can REMOVE any event, board member or member of any club.
//     (It cannot add things for a club.) Create it in Firebase Authentication like a manager,
//     and put the SAME email in the database node  "admin"  (a single text value, see firebase-managers.json).
export const ADMIN_EMAIL = 'tasnimjarray69@gmail.com';

// 3) Categories offered when an event manager adds an event
export const EVENT_CATEGORIES = [
  'Event', 'Ice Breaking', 'Hackathon / Conference', 'Workshop 1', 'Workshop 2', 'Workshop 3',
  'BTech Day', 'Fun time / Outing', 'Project of the Year', 'Robotics Competition'
];
// Each club can use a category only ONCE. Categories listed here are the exception and can be repeated.
export const REPEATABLE_CATEGORIES = ['Event'];

// 4) Student Section board shown on the home page (display only)
export const STUDENT_BOARD = [
  { role: 'President',            name: 'Islem CHEBAANE',        phone: '+216 50 960 904' },
  { role: 'General Secretary',    name: 'Lina BEN HMIDA',        phone: '+216 58 528 667' },
  { role: 'Event Manager',        name: 'Tasnim JARRAY',         phone: '+216 20 583 311' },
  { role: 'Coordinator',          name: 'Nour El Houda JENZERI', phone: '+216 99 677 111' },
  { role: 'Community Manager',    name: 'Noussaiama JARRAY',     phone: '+216 58 074 354' },
  { role: 'Social Media Manager', name: 'Fadi AMICHE',           phone: '+216 24 924 233' },
];
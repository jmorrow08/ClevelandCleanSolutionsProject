// Script to set up owner role for specific users
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK with service account
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function setupOwnerUsers() {
  const ownerEmails = [
    'walterringfield@clevelandcleansolutions.com',
    'sharmekaringfield@clevelandcleansolutions.com'
  ];

  console.log('Setting up owner role for users:', ownerEmails);

  for (const email of ownerEmails) {
    try {
      // Get user by email
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;
      
      console.log(`Setting up owner role for ${email} (UID: ${uid})`);
      
      // Set custom claims for owner role
      const newClaims = {
        admin: true,
        owner: true,
        super_admin: true // Owner has all privileges
      };
      
      await admin.auth().setCustomUserClaims(uid, newClaims);
      
      // Update Firestore user document
      const userDocRef = db.collection('users').doc(uid);
      await userDocRef.set({
        role: 'owner',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`✅ Successfully set up owner role for ${email}`);
      
    } catch (error) {
      console.error(`❌ Error setting up owner role for ${email}:`, error.message);
    }
  }
  
  console.log('Owner role setup completed!');
  process.exit(0);
}

// Run the setup
setupOwnerUsers().catch(console.error); 
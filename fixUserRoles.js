// fixUserRoles.js
const admin = require("firebase-admin");

// --- CONFIGURATION ---
const serviceAccount = require("/Users/ali/Desktop/ClevelandCleanSolutionsProject/cleveland-clean-portal-firebase-adminsdk-fbsvc-5fdf0c2694.json"); 

// User UIDs - these need to be verified
const superAdminUid = "p3RrJpUd1bbCdYfWG9aeQYGWBLH2"; // info@clevelandcleansolutions.com
const walterUid = "o9X6L8FxALRlS6weNJcF6EHLMIm2"; // walterringfield@clevelandcleansolutions.com

try {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized.");
  }

  async function fixUserRoles() {
    console.log("=== FIXING USER ROLES ===");
    
    // 1. Set up super-admin (info@clevelandcleansolutions.com)
    console.log("\n1. Setting up super-admin...");
    await setUserClaims(superAdminUid, {
      admin: true,
      super_admin: true
    }, "SUPER ADMIN");
    
    // 2. Fix Walter's role (remove all admin access)
    console.log("\n2. Fixing Walter's role...");
    await setUserClaims(walterUid, {
      admin: false,
      super_admin: false
    }, "WALTER (EMPLOYEE ONLY)");
    
    console.log("\n=== ROLE FIX COMPLETE ===");
    console.log("✅ Super-admin setup complete for info@clevelandcleansolutions.com");
    console.log("✅ Walter's admin access removed");
    console.log("\n⚠️  IMPORTANT: Users must LOG OUT and LOG BACK IN for changes to take effect!");
  }

  async function setUserClaims(uid, claims, description) {
    try {
      const userRecord = await admin.auth().getUser(uid);
      console.log(`\n--- ${description} ---`);
      console.log(`UID: ${uid}`);
      console.log("Current claims:", userRecord.customClaims);
      
      const newClaims = { 
        ...(userRecord.customClaims || {}),
        ...claims
      };
      
      await admin.auth().setCustomUserClaims(uid, newClaims);
      console.log("New claims set:", newClaims);
      
      // Verify
      const updatedUser = await admin.auth().getUser(uid);
      console.log("Verified claims:", updatedUser.customClaims);
      
      return true;
    } catch (error) {
      console.error(`Error setting claims for ${uid}:`, error);
      return false;
    }
  }

  fixUserRoles().then(() => {
    console.log("Script completed successfully.");
    process.exit(0);
  }).catch(error => {
    console.error("Script failed:", error);
    process.exit(1);
  });

} catch (error) {
  console.error("Script initialization failed:", error);
  process.exit(1);
} 
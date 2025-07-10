    // setAdminClaim.js
    const admin = require("firebase-admin");

    // --- CONFIGURATION ---
    // !!! IMPORTANT: Ensure this path is correct for YOUR service account key !!!
    const serviceAccount = require("/Users/ali/Desktop/ClevelandCleanSolutionsProject/cleveland-clean-portal-firebase-adminsdk-fbsvc-5fdf0c2694.json"); 

    // !!! IMPORTANT: Ensure this is the UID of the user you want to make admin !!!
    const uidToModify = "p3RrJpUd1bbCdYfWG9aeQYGWBLH2"; 
    // ---------------------

    try {
      if (admin.apps.length === 0) { // Ensure initializeApp is called only once
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialized by setAdminClaim.js.");
      }


      // 1. Read existing claims
      admin.auth().getUser(uidToModify)
        .then((userRecord) => {
          console.log(`Successfully fetched user data for UID: ${uidToModify}`);
          console.log("Existing custom claims:", userRecord.customClaims);

          // 2. Set/Update the custom claim { admin: true }
          // This will merge with existing claims if you spread them, or overwrite if you don't.
          // To ensure admin:true is present without losing other potential claims:
          const newClaims = { 
            ...(userRecord.customClaims || {}), // Spread existing claims, or empty object if none
            admin: true 
          };
          
          console.log("Attempting to set new claims:", newClaims);
          return admin.auth().setCustomUserClaims(uidToModify, newClaims);
        })
        .then(() => {
          console.log(`Successfully set/updated custom claims for user: ${uidToModify} to include { admin: true }`);
          console.log("Please LOG OUT and LOG BACK IN to the application for the claim to take effect in your ID token.");
          // Fetch again to verify
          return admin.auth().getUser(uidToModify);
        })
        .then((userRecord) => {
            console.log("VERIFICATION - Current custom claims on user record:", userRecord.customClaims);
            if (userRecord.customClaims && userRecord.customClaims.admin === true) {
                console.log("SUCCESS: Admin claim is confirmed on the user record.");
            } else {
                console.error("ERROR: Admin claim NOT confirmed on the user record after setting.");
            }
            process.exit(0); // Exit successfully
        })
        .catch((error) => {
          console.error(`Error during custom claims process for ${uidToModify}:`, error);
          process.exit(1); // Exit with error
        });

    } catch (initError) {
      console.error("Error initializing Firebase Admin SDK in setAdminClaim.js:", initError);
      process.exit(1);
    }
    
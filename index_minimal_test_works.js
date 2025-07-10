const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
  console.log("Firebase Admin SDK initialized successfully (minimal).");
}

// --- Test Function (1st Gen with runWith options) ---
exports.testAuthContext = functions
  .runWith({ memory: "128MB", timeoutSeconds: 60 })
  .https.onCall((data, context) => {
    if (context.auth) {
      functions.logger.info("testAuthContext (minimal): Auth context IS PRESENT. UID:", context.auth.uid, "Claims:", context.auth.token);
      return {
        status: "Authenticated!",
        uid: context.auth.uid,
        claims: context.auth.token,
      };
    } else {
      functions.logger.error("testAuthContext (minimal): Auth context IS NULL or UNDEFINED.");
      return {
        status: "Not authenticated. Auth context was null.",
      };
    }
  });

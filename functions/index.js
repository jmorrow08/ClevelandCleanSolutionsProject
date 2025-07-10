// functions/index.js - Activating testAuthContext, setAdminRole, createNewUser_v1

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const cors = require("cors")({ origin: true }); // UNCOMMENTED - Needed for createNewUser_v1

// Unused for current active functions, but kept for when others are added back:
// const { addDays, addWeeks, addMonths, getDay, startOfDay, formatISO } = require("date-fns");
// const { utcToZonedTime, zonedTimeToUtc } = require("date-fns-tz");
// const { onSchedule } = require("firebase-functions/v2/scheduler");

if (admin.apps.length === 0) {
  admin.initializeApp();
  console.log("Firebase Admin SDK initialized successfully.");
}
const db = admin.firestore();
// const timezone = "America/New_York"; // Not used by current active functions
const serverTimestamp = FieldValue.serverTimestamp; // Replaced with admin.firestore.Timestamp.now() in createNewUser_v1

// --- Helper Function: Verify ID Token and Admin Claim (for onRequest) ---
const verifyTokenAndAdmin = async (req) => {
  console.log("Verifying token and admin claim...");
  const createAuthError = (code, message) => {
    const error = new Error(message);
    error.statusCode = code;
    return error;
  };

  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    console.error("No Bearer token found in Authorization header.");
    throw createAuthError(401, "unauthenticated");
  }

  const idToken = authorizationHeader.split("Bearer ")[1];
  if (!idToken) {
    console.error("Bearer token is empty.");
    throw createAuthError(401, "unauthenticated");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log(`Token verified for UID: ${decodedToken.uid}`);
    if (decodedToken.admin !== true) {
      console.warn(`User ${decodedToken.uid} is not an admin.`);
      throw createAuthError(403, "permission-denied");
    }
    console.log(`Admin role confirmed for UID: ${decodedToken.uid}`);
    return decodedToken.uid;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    console.error("Error verifying ID token:", error);
    const code = error.code === "auth/id-token-expired" ? 401 : 401;
    const message = error.code === "auth/id-token-expired" ? "token-expired" : "unauthenticated";
    throw createAuthError(code, message);
  }
};

// --- Test Function (1st Gen with runWith options) ---
exports.testAuthContext = functions
  .runWith({ memory: "128MB", timeoutSeconds: 60 })
  .https.onCall((data, context) => {
    if (context.auth) {
      functions.logger.info("testAuthContext: Auth context IS PRESENT. UID:", context.auth.uid, "Claims:", context.auth.token);
      return {
        status: "Authenticated!",
        uid: context.auth.uid,
        claims: context.auth.token,
      };
    } else {
      functions.logger.error("testAuthContext: Auth context IS NULL or UNDEFINED.");
      return {
        status: "Not authenticated. Auth context was null.",
      };
    }
  });

// --- setAdminRole Function ---
exports.setAdminRole = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    functions.logger.info("setAdminRole (v1.1) invoked by UID:", context.auth ? context.auth.uid : "No auth context");
    if (data && typeof data === "object") {
      functions.logger.info("Raw data wrapper received. Top-level keys:", Object.keys(data));
      if (Object.prototype.hasOwnProperty.call(data, "data") && typeof data.data === "object" && data.data !== null) {
        functions.logger.info("Payload (data.data) received. Keys in data.data:", Object.keys(data.data));
        functions.logger.info("Payload targetUid from data.data:", data.data.targetUid);
        functions.logger.info("Payload roleToSet from data.data:", data.data.roleToSet);
      } else {
        functions.logger.warn("Payload (data.data) is missing, not an object, or is null.");
      }
    } else {
      functions.logger.warn("Data received is not an object or is null/undefined.");
    }

    const callerUid = context.auth ? context.auth.uid : null;
    if (!(context.auth && context.auth.token && context.auth.token.super_admin === true)) {
      functions.logger.error("setAdminRole: PERMISSION DENIED. Caller is not a super_admin.", {
        callerUid: callerUid,
        claimsInfo: context.auth && context.auth.token ? "Token object exists" : "No token object",
      });
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to set admin roles. Must be a super_admin.");
    }
    functions.logger.info(`setAdminRole: Caller ${callerUid} validated as super_admin by custom claim.`);

    if (!data || !data.data || typeof data.data !== "object") {
      functions.logger.error("setAdminRole: Invalid data structure received. Expected 'data.data' object.", { receivedData: data });
      throw new functions.https.HttpsError("invalid-argument", "Invalid data structure. Expected 'data.data' object.");
    }
    const { targetUid, roleToSet } = data.data;

    if (!targetUid || typeof targetUid !== "string" || targetUid.trim() === "") {
      throw new functions.https.HttpsError("invalid-argument", "targetUid (in data.data) must be a non-empty string.");
    }
    const validRoles = ["super_admin", "standard_admin", "employee", "client", "none_admin"];
    if (!roleToSet || !validRoles.includes(roleToSet)) {
      throw new functions.https.HttpsError("invalid-argument", `roleToSet (in data.data) must be one of: ${validRoles.join(", ")}.`);
    }

    if (callerUid === targetUid && roleToSet !== "super_admin" && context.auth.token.super_admin === true) {
      if (roleToSet !== "super_admin") {
        functions.logger.warn(`setAdminRole: Super_admin ${callerUid} attempted to change their own role to ${roleToSet}. This is restricted. They will remain super_admin.`);
      }
    }

    try {
      functions.logger.info(`Attempting to set role for target UID: ${targetUid} to: ${roleToSet}`);
      const userDocRef = db.collection("users").doc(targetUid);
      const userDocSnapshot = await userDocRef.get();
      let currentFirestoreUserRole = null;
      if (userDocSnapshot.exists) {
        currentFirestoreUserRole = userDocSnapshot.data().role;
      } else {
        functions.logger.warn(`User document users/${targetUid} not found. It will be created if a definitive role (not 'none_admin') is being set.`);
      }

      const targetUserAuthRecord = await admin.auth().getUser(targetUid);
      const currentAuthClaims = targetUserAuthRecord.customClaims || {};
      const newClaims = { ...currentAuthClaims, admin: false, super_admin: false, standard_admin: false };
      const firestoreUpdateData = { updatedAt: admin.firestore.Timestamp.fromDate(new Date()) };
      let newFirestoreRole = null;

      if (roleToSet === "super_admin") {
        newClaims.admin = true; newClaims.super_admin = true;
        newFirestoreRole = "super_admin";
      } else if (roleToSet === "standard_admin") {
        newClaims.admin = true; newClaims.standard_admin = true; newClaims.super_admin = false;
        if (currentFirestoreUserRole === "employee") {
          newFirestoreRole = "employee";
          functions.logger.info(`User ${targetUid} is an employee. Granting 'standard_admin' claims but keeping Firestore users.role as 'employee'.`);
        } else {
          newFirestoreRole = "standard_admin";
        }
      } else if (roleToSet === "employee" || roleToSet === "client") {
        newClaims.admin = false; newClaims.super_admin = false; newClaims.standard_admin = false;
        newFirestoreRole = roleToSet;
      } else if (roleToSet === "none_admin") {
        newClaims.admin = false; newClaims.super_admin = false; newClaims.standard_admin = false;
        newFirestoreRole = currentFirestoreUserRole;
        functions.logger.info(`Removing admin-level claims for ${targetUid}. Firestore users.role ('${newFirestoreRole}') will be preserved if it exists.`);
      }

      if (callerUid === targetUid && context.auth.token.super_admin === true) {
        newClaims.admin = true; newClaims.super_admin = true;
        newFirestoreRole = "super_admin";
        if (roleToSet !== "super_admin") {
          functions.logger.warn(`Super_admin ${callerUid} was editing self; claims and Firestore role forced to 'super_admin'.`);
        }
      }

      if (newFirestoreRole) {
        firestoreUpdateData.role = newFirestoreRole;
      }

      await admin.auth().setCustomUserClaims(targetUid, newClaims);
      functions.logger.info(`Successfully set custom claims for UID ${targetUid}:`, newClaims);

      if (userDocSnapshot.exists) {
        await userDocRef.update(firestoreUpdateData);
        functions.logger.info(`Updated existing Firestore users/${targetUid} with:`, firestoreUpdateData);
      } else if (newFirestoreRole && newFirestoreRole !== "none_admin") {
        firestoreUpdateData.createdAt = admin.firestore.Timestamp.fromDate(new Date());
        if (targetUserAuthRecord.email) {
          firestoreUpdateData.email = targetUserAuthRecord.email;
        }
        await userDocRef.set(firestoreUpdateData); // Use .set() not .set(firestoreUpdateData, { merge: true }) if you want to ensure it creates or fully overwrites. Using .set() is fine here.
        functions.logger.info(`Created new Firestore users/${targetUid} with:`, firestoreUpdateData);
      } else {
        functions.logger.info(`No Firestore update needed for users/${targetUid}.`);
      }
      return { success: true, message: `Successfully set claims and user role for UID ${targetUid} based on '${roleToSet}'.` };
    } catch (error) {
      functions.logger.error(`setAdminRole: Error during claim/role update for UID ${targetUid}:`, error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      if (error.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", `User with UID ${targetUid} does not exist in Firebase Auth.`);
      }
      throw new functions.https.HttpsError("internal", "An internal error occurred while setting user roles.", error.message);
    }
  });

// --- createNewUser_v1 Function ---
exports.createNewUser_v1 = functions.runWith({ memory: "256MB", timeoutSeconds: 60 }).https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log("createNewUser_v1 (onRequest) invoked.");
    let adminUid;
    try {
      if (req.method !== "POST") {
        return res.status(405).send({ success: false, error: { message: "Method Not Allowed" } });
      }
      adminUid = await verifyTokenAndAdmin(req); // Uses global verifyTokenAndAdmin
      const { email, password, role, clientIdString, companyName, contactName, phone, employeeIdString, firstName, lastName, jobTitle } = req.body;

      console.log(`Received create request: role=${role}`);

      if (!email || !password || !role) {
        return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Missing required fields: email, password, and role required." } });
      }
      if (role !== "client" && role !== "employee") {
        return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Invalid role specified." } });
      }
      if (password.length < 6) {
        return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Password must be at least 6 characters long." } });
      }

      let profileCollectionPath;
      let customIdField;
      let customIdValue;
      let profileData = {};
      let authDisplayName = "";

      if (role === "client") {
        if (!clientIdString || !companyName || !contactName) {
          return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Missing required fields for client: clientIdString, companyName, contactName." } });
        }
        profileCollectionPath = "clientMasterList";
        customIdField = "clientIdString";
        customIdValue = clientIdString;
        authDisplayName = contactName;
        profileData = {
          clientIdString, companyName, contactName, phone: phone || "", email, status: true,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        };
      } else { // role === "employee"
        if (!employeeIdString || !firstName || !lastName) {
          return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Missing required fields for employee: employeeIdString, firstName, lastName." } });
        }
        profileCollectionPath = "employeeMasterList";
        customIdField = "employeeIdString";
        customIdValue = employeeIdString;
        authDisplayName = `${firstName} ${lastName}`.trim();
        profileData = {
          employeeIdString, firstName, lastName, phone: phone || "", email, jobTitle: jobTitle || "", status: true,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        };
      }

      const idCheckQuery = db.collection(profileCollectionPath).where(customIdField, "==", customIdValue).limit(1);
      const idCheckSnapshot = await idCheckQuery.get();
      if (!idCheckSnapshot.empty) {
        return res.status(409).send({ success: false, error: { code: "already-exists", message: `The provided ID (${customIdValue}) is already in use.` } });
      }

      const userRecord = await admin.auth().createUser({ email, password, displayName: authDisplayName, emailVerified: false, disabled: false });
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: false, role: role });

      const batch = db.batch();
      const userDocRef = db.collection("users").doc(userRecord.uid);
      const profileDocRef = db.collection(profileCollectionPath).doc();

      batch.set(userDocRef, {
        email: userRecord.email, role, profileId: profileDocRef.id,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      batch.set(profileDocRef, profileData);

      await batch.commit();

      const counterRef = db.collection("counters").doc("ids");
      const counterField = role === "client" ? "lastClientIdNumber" : "lastEmployeeIdNumber";
      try {
        await counterRef.update({ [counterField]: FieldValue.increment(1) }); // FieldValue.increment is fine
      } catch (counterError) {
        console.error(`Error updating counter ${counterField}:`, counterError);
      }

      return res.status(200).send({ success: true, uid: userRecord.uid, profileId: profileDocRef.id, message: `Successfully created new ${role} user.` });
    } catch (error) {
      console.error(`Error in createNewUser_v1 for admin ${adminUid || "unknown"}:`, error);
      if (error.code === "already-exists") {
        return res.status(409).send({ success: false, error: { code: "already-exists", message: error.message } });
      }
      if (error.statusCode) {
        return res.status(error.statusCode).send({ success: false, error: { code: error.message, message: `Auth error: ${error.message}` } });
      }
      if (error.code === "auth/email-already-exists") {
        return res.status(409).send({ success: false, error: { code: "already-exists", message: "Email already in use." } });
      }
      if (error.code === "auth/invalid-password") {
        return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "The password provided is invalid (e.g., too short)." } });
      }
      return res.status(500).send({ success: false, error: { code: "internal", message: `Internal server error. ${error.message}` } });
    }
  });
});

exports.deleteAuthUser_v1 = functions.runWith({ memory: "256MB", timeoutSeconds: 60 }).https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log("deleteAuthUser_v1 (onRequest) invoked.");
    let adminUid;
    const uidToDelete = req.body.uidToDelete;
    try {
      if (req.method !== "POST") {
        return res.status(405).send({ success: false, error: { message: "Method Not Allowed" } });
      }
      adminUid = await verifyTokenAndAdmin(req);
      if (!uidToDelete) {
        return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "User UID to delete must be provided." } });
      }
      if (uidToDelete === adminUid) {
        return res.status(403).send({ success: false, error: { code: "permission-denied", message: "Admins cannot delete their own account." } });
      }

      // Get user info before deleting Auth
      let userRole = null;
      let profileDocIdToDelete = null;
      const userDocRef = db.collection("users").doc(uidToDelete);
      try {
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          userRole = userData.role;
          profileDocIdToDelete = userData.profileId;
        } else {
          console.warn(`User doc not found for Auth UID ${uidToDelete}`);
        }
      } catch (fetchErr) {
        console.error(`Error fetching user doc ${uidToDelete} before delete:`, fetchErr);
      }

      // Delete Auth user
      console.log(`Attempting to delete Auth user UID: ${uidToDelete}`);
      try {
        await admin.auth().deleteUser(uidToDelete);
        console.log(`Successfully deleted Auth user UID: ${uidToDelete}.`);
      } catch (authDeleteError) {
        if (authDeleteError.code === "auth/user-not-found") {
          console.warn(`Auth user UID ${uidToDelete} not found during deletion attempt.`);
        } else {
          throw authDeleteError;
        } // Rethrow other auth errors
      }

      // Delete Firestore docs
      const batch = db.batch();
      batch.delete(userDocRef); // Delete users doc
      if (profileDocIdToDelete) {
        const profileCollectionPath = userRole === "client" ? "clientMasterList" : userRole === "employee" ? "employeeMasterList" : null;
        if (profileCollectionPath) {
          batch.delete(db.collection(profileCollectionPath).doc(profileDocIdToDelete));
          console.log(`Added delete for ${profileCollectionPath}/${profileDocIdToDelete}`);
        }
      } else {
        console.warn(`Skipping profile delete for Auth UID ${uidToDelete} (profile ID not found).`);
      }
      await batch.commit();
      console.log(`Committed Firestore deletes for Auth UID: ${uidToDelete}.`);

      return res.status(200).send({ success: true, message: `Successfully deleted user (Auth UID: ${uidToDelete}).` });
    } catch (error) {
      console.error(`Error in deleteAuthUser_v1 for admin ${adminUid || "unknown"}, target ${uidToDelete || "unknown"}:`, error);
      if (error.statusCode) { // Auth errors
        return res.status(error.statusCode).send({ success: false, error: { code: error.message, message: `Auth error: ${error.message}` } });
      }
      if (error.code === "auth/user-not-found") {
        console.warn(`Auth user UID ${uidToDelete || "?"} not found. Assuming already deleted.`);
        return res.status(200).send({ success: true, message: `Auth user (UID: ${uidToDelete || "?"}) not found, likely already deleted. Firestore cleanup attempted.` });
      }
      return res.status(500).send({ success: false, error: { code: "internal", message: `Internal server error during deletion. ${error.message}` } });
    }
  });
});

exports.updateUserPassword_v1 = functions.runWith({ memory: "256MB", timeoutSeconds: 60 }).https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log("updateUserPassword_v1 (onRequest) invoked.");
    let adminUid;
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method Not Allowed" });
      }
      adminUid = await verifyTokenAndAdmin(req);
      const { targetUid, newPassword } = req.body;

      if (!targetUid || typeof targetUid !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request: Missing or invalid target user ID." });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: "Bad Request: New password must be a string of at least 6 characters." });
      }
      if (targetUid === adminUid) {
        return res.status(403).json({ success: false, error: "Forbidden: Use 'Change My Password' feature." });
      }

      console.log(`Admin ${adminUid} updating password for target UID: ${targetUid}`);
      await admin.auth().updateUser(targetUid, { password: newPassword });
      console.log(`Successfully updated password for target UID: ${targetUid}`);
      return res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
      console.error(`updateUserPassword_v1 error (Admin: ${adminUid || "unknown"}):`, error);
      if (error.statusCode) { // Auth errors
        return res.status(error.statusCode).json({ success: false, error: `Auth error: ${error.message}` });
      }
      if (error.code === "auth/user-not-found") {
        return res.status(404).json({ success: false, error: "User not found." });
      }
      if (error.code === "auth/invalid-password" || error.code === "auth/weak-password") {
        return res.status(400).json({ success: false, error: "Bad Request: Password invalid or too weak." });
      }
      return res.status(500).json({ success: false, error: `Internal Server Error: ${error.message}` });
    }
  });
});

// PASTE THIS ENTIRE BLOCK INTO YOUR functions/index.js FILE

// --- Helper Function: Calculate Bi-Weekly Pay Period ---
/**
 * Calculates the start and end dates of a bi-weekly pay period (Sun-Sat)
 * containing the given service date. Uses UTC for calculations.
 * @param {Date} serviceJsDate - The JavaScript Date object of the service.
 * @returns {object} An object with startDate (JS Date), endDate (JS Date), and periodId (string).
 */
function getBiWeeklyPayPeriod(serviceJsDate) {
  // Anchor: Sunday, April 13, 2025, 00:00:00 UTC (Adjust if your pay periods have a different anchor)
  const anchorStartDateUTC = new Date(Date.UTC(2025, 3, 13)); // Month is 0-indexed (April)

  const serviceDateUTC = new Date(Date.UTC(
    serviceJsDate.getFullYear(),
    serviceJsDate.getMonth(),
    serviceJsDate.getDate(),
  ));

  const msInDay = 1000 * 60 * 60 * 24;
  const timeDifference = serviceDateUTC.getTime() - anchorStartDateUTC.getTime();
  const daysDifference = Math.floor(timeDifference / msInDay);
  const periodIndex = Math.floor(daysDifference / 14); // 14 days in a bi-weekly period

  const periodStartDate = new Date(anchorStartDateUTC.getTime());
  periodStartDate.setUTCDate(periodStartDate.getUTCDate() + periodIndex * 14);

  const periodEndDate = new Date(periodStartDate.getTime());
  periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 13); // Pay period is 14 days long (0-13)

  const startYear = periodStartDate.getUTCFullYear();
  const startMonth = (periodStartDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const startDay = periodStartDate.getUTCDate().toString().padStart(2, "0");
  const periodId = `${startYear}-${startMonth}-${startDay}`; // e.g., "2025-04-13"

  functions.logger.info(
    `ServiceDateUTC: ${serviceDateUTC.toISOString()}, PeriodStart: ${periodStartDate.toISOString()}, PeriodEnd: ${periodEndDate.toISOString()}, PeriodID: ${periodId}`,
  );

  return {
    startDate: periodStartDate, // JS Date
    endDate: periodEndDate, // JS Date
    periodId: periodId,
  };
}

// --- Process Completed Jobs Payroll Function ---
/**
 * @name processCompletedJobsPayroll
 * @description HTTP Cloud Function to manually trigger payroll calculation
 * for completed serviceHistory records that haven't been processed yet.
 * Requires authenticated admin user.
 * v1.4 - Timestamps corrected to admin.firestore.Timestamp.now()
 */
exports.processCompletedJobsPayroll = functions
  .runWith({ memory: "512MB", timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    // Removed initial diagnostic logs about global serverTimestamp as they are no longer the focus.
    functions.logger.info("DEBUG: processCompletedJobsPayroll - Function Invoked.");

    cors(req, res, async () => {
      if (req.method !== "POST") {
        functions.logger.warn(
          "processCompletedJobsPayroll: Method Not Allowed - ",
          req.method,
        );
        return res.status(405).send("Method Not Allowed");
      }

      let adminUid;
      try {
        adminUid = await verifyTokenAndAdmin(req); // Assumes verifyTokenAndAdmin is defined
        functions.logger.info(
          `processCompletedJobsPayroll request received from admin: ${adminUid}`,
        );
      } catch (error) {
        functions.logger.error(
          "processCompletedJobsPayroll: Authentication/Authorization failed:",
          error,
        );
        const statusCode = error.statusCode || 500;
        const message =
          error.message || "Internal Server Error during authentication.";
        return res.status(statusCode).send({ error: `Auth Error: ${message}` }); // Send JSON error
      }

      try {
        const BATCH_LIMIT = 100; // Max operations in Firestore batch is 500. One job might create multiple writes.

        functions.logger.info(
          "Querying serviceHistory where status == \"Completed\" and payrollProcessed is not true, ordering by serviceDate...",
        );
        // Modified query to explicitly check for payrollProcessed != true,
        // though the code later also checks historyData.payrollProcessed.
        // Firestore does not support inequality checks on multiple fields or combining not-equals with orderBy on a different field.
        // So, we fetch where status is "Completed" and filter payrollProcessed in code.
        const historyQuery = db
          .collection("serviceHistory")
          .where("status", "==", "Completed")
          // .where("payrollProcessed", "!=", true) // Cannot do this with orderBy on different field
          .orderBy("serviceDate")
          .limit(BATCH_LIMIT * 2); // Fetch more to filter in code, adjust as needed

        const historySnapshot = await historyQuery.get();
        functions.logger.info(
          `Query completed. Snapshot size: ${historySnapshot.size}. Snapshot empty: ${historySnapshot.empty}`,
        );

        if (historySnapshot.empty) {
          functions.logger.info(
            "processCompletedJobsPayroll: No \"Completed\" status jobs found to process initially.",
          );
          return res
            .status(200)
            .json({ message: "No new completed jobs found to process." });
        }

        const batch = db.batch();
        let actualJobsToProcessInBatch = 0;
        let processedJobsCount = 0;
        let skippedAlreadyProcessedCount = 0;
        let skippedDueToErrorOrMissingDataCount = 0; // Consolidated counter

        for (const historyDoc of historySnapshot.docs) {
          if (actualJobsToProcessInBatch >= BATCH_LIMIT) {
            functions.logger.info(`Reached batch limit of ${BATCH_LIMIT} jobs for processing this run. More jobs may exist.`);
            break;
          }

          const historyId = historyDoc.id;
          const historyData = historyDoc.data();
          const historyDocRef = historyDoc.ref;

          if (historyData.payrollProcessed === true) {
            functions.logger.info(
              `Skipping job ${historyId} as payrollProcessed is already true.`,
            );
            skippedAlreadyProcessedCount++;
            continue; // Skip to next document
          }

          actualJobsToProcessInBatch++; // Increment for jobs we will attempt to process

          const {
            locationId,
            serviceDate: serviceTimestampFromHistory, // This is a Firestore Timestamp
            employeeAssignments,
            locationName = "N/A",
          } = historyData;

          if (
            !locationId ||
            !serviceTimestampFromHistory?.toDate || // Check if it's a valid timestamp
            !Array.isArray(employeeAssignments) ||
            employeeAssignments.length === 0
          ) {
            functions.logger.warn(
              `Skipping job ${historyId} due to missing critical data.`,
              { data: historyData },
            );
            skippedDueToErrorOrMissingDataCount++;
            const historyUpdateSkippedMissingData = {
              payrollProcessed: true,
              payrollProcessedAt: admin.firestore.Timestamp.now(), // CORRECTED
              payrollProcessingStatus: "Skipped - Missing Critical Data",
            };
            batch.update(historyDocRef, historyUpdateSkippedMissingData);
            continue;
          }

          const serviceJsDate = serviceTimestampFromHistory.toDate(); // Convert Firestore Timestamp to JS Date
          let payPeriod;
          let payPeriodStartTimestamp; // Firestore Timestamp
          let payPeriodEndTimestamp; // Firestore Timestamp

          try {
            payPeriod = getBiWeeklyPayPeriod(serviceJsDate); // Uses helper
            // Validation from your code for payPeriod structure
            if (!payPeriod?.startDate || !(payPeriod.startDate instanceof Date) || !payPeriod?.endDate || !(payPeriod.endDate instanceof Date) || typeof payPeriod.periodId !== "string" || !payPeriod.periodId) {
              throw new Error("Invalid pay period structure returned by getBiWeeklyPayPeriod helper.");
            }
            payPeriodStartTimestamp = admin.firestore.Timestamp.fromDate(payPeriod.startDate);
            payPeriodEndTimestamp = admin.firestore.Timestamp.fromDate(payPeriod.endDate);
            functions.logger.info(
              `Job ${historyId}: Service Date ${serviceJsDate.toISOString()} -> Pay Period ID ${payPeriod.periodId}`,
            );
          } catch (periodError) {
            functions.logger.error(
              `Error calculating pay period for job ${historyId}. Skipping job. Error: ${periodError.message}`,
            );
            skippedDueToErrorOrMissingDataCount++;
            const historyUpdateSkippedPeriodError = {
              payrollProcessed: true,
              payrollProcessedAt: admin.firestore.Timestamp.now(), // CORRECTED
              payrollProcessingStatus: "Skipped - Pay Period Calculation Error",
            };
            batch.update(historyDocRef, historyUpdateSkippedPeriodError);
            continue;
          }

          let jobHasAtLeastOneRate = false;
          for (const assignment of employeeAssignments) {
            const { employeeId, employeeName = "N/A" } = assignment || {};
            if (!employeeId) {
              functions.logger.warn(
                `Skipping assignment in job ${historyId}: missing employeeId.`,
              );
              continue; // Skip this assignment
            }

            let rateApplied = null;
            let calculatedEarnings = 0;
            try {
              const rateQuerySnapshot = await db
                .collection("employeeRates")
                .where("employeeProfileId", "==", employeeId)
                .where("locationId", "==", locationId)
                .limit(1)
                .get();

              if (!rateQuerySnapshot.empty) {
                const rateData = rateQuerySnapshot.docs[0].data();
                rateApplied = rateData.rate;
                if ( typeof rateApplied !== "number" || !Number.isFinite(rateApplied) ) {
                  throw new Error(
                    `Invalid rate type or value found: ${rateApplied}`,
                  );
                }
                calculatedEarnings = rateApplied; // Assuming rate is the total for this assignment/job part
                jobHasAtLeastOneRate = true;
                functions.logger.info(
                  `Job ${historyId}, Employee ${employeeId}: Found rate ${rateApplied}. Calculated earnings: ${calculatedEarnings}`,
                );
              } else {
                functions.logger.warn(
                  `RATE NOT FOUND for Employee ${employeeId} at Location ${locationId} (Job: ${historyId}). Skipping payroll entry for this assignment.`,
                );
                // Continue to next assignment, don't skip the whole job yet
                continue;
              }
            } catch (rateError) {
              functions.logger.error(
                `Error fetching or validating rate for Employee ${employeeId} / Location ${locationId} (Job: ${historyId}). Error: ${rateError.message}. Skipping payroll entry for this assignment.`,
              );
              // Continue to next assignment
              continue;
            }

            const payrollDocId = `${employeeId}_${payPeriod.periodId}`;
            const payrollDocRef = db.collection("employeePayroll").doc(payrollDocId);

            const jobDetailObject = {
              serviceHistoryId: historyId,
              locationId: locationId,
              locationName: locationName,
              serviceDate: serviceTimestampFromHistory, // Keep original Firestore Timestamp
              rateApplied: rateApplied,
              earnings: calculatedEarnings,
              processedAt: admin.firestore.Timestamp.now(), // CORRECTED
            };
            // Your [JOB_DETAIL_OBJECT CHECK] logging can remain here if you find it useful

            const payrollDocDataForBatch = {
              employeeId: employeeId,
              payPeriodId: payPeriod.periodId,
              employeeName: employeeName,
              payPeriodStartDate: payPeriodStartTimestamp,
              payPeriodEndDate: payPeriodEndTimestamp,
              totalEarnings: FieldValue.increment(calculatedEarnings),
              jobs: FieldValue.arrayUnion(jobDetailObject),
              status: "Pending", // Initial status
              updatedAt: admin.firestore.Timestamp.now(), // CORRECTED
              // createdAt will be set by Firestore if the document is new via merge:true
              // If you need it explicitly on create, this is okay for merge:true on new doc.
              createdAt: admin.firestore.Timestamp.now(), // CORRECTED
            };
            batch.set(payrollDocRef, payrollDocDataForBatch, { merge: true });
          } // End of employeeAssignments loop

          if (jobHasAtLeastOneRate) {
            const historyUpdateProcessed = {
              payrollProcessed: true,
              payrollProcessedAt: admin.firestore.Timestamp.now(), // CORRECTED
              payrollProcessingStatus: "Processed",
            };
            batch.update(historyDocRef, historyUpdateProcessed);
            processedJobsCount++;
          } else {
            // This job had assignments, but none resulted in a rate being applied (either no rate found or error fetching rate)
            functions.logger.warn(
              `Job ${historyId} had assignments but no valid rates were ultimately applied. Marking as skipped.`,
            );
            skippedDueToErrorOrMissingDataCount++;
            const historyUpdateNoRatesApplied = {
              payrollProcessed: true, // Mark as processed to avoid retrying indefinitely
              payrollProcessedAt: admin.firestore.Timestamp.now(), // CORRECTED
              payrollProcessingStatus: "Skipped - No Rates Applied",
            };
            batch.update(historyDocRef, historyUpdateNoRatesApplied);
          }
        } // End of historySnapshot.docs loop

        if (processedJobsCount > 0 || skippedDueToErrorOrMissingDataCount > 0) { // Only commit if there were actual attempts to process or skip (update status)
          functions.logger.info(
            "----------------------------------------------------",
          );
          functions.logger.info(
            `[BATCH COMMIT PREP] Processed: ${processedJobsCount}, Skipped (Error/MissingData/NoRates): ${skippedDueToErrorOrMissingDataCount}, Encountered Already Processed: ${skippedAlreadyProcessedCount}`,
          );
          functions.logger.info(
            "----------------------------------------------------",
          );
          await batch.commit();
          functions.logger.info(
            "Successfully committed batch operations.",
          );
          return res.status(200).json({ // Send JSON response
            message: `Payroll processing run complete. Processed ${processedJobsCount} new jobs. Jobs skipped due to errors, missing data, or no rates: ${skippedDueToErrorOrMissingDataCount}. Jobs already processed and skipped: ${skippedAlreadyProcessedCount}.`,
          });
        } else {
          functions.logger.info(
            "No jobs required payroll processing operations in this batch (all might have been already processed or initial query was empty).",
          );
          return res.status(200).json({ // Send JSON response
            message:
              "Checked completed jobs. No new jobs required payroll processing operations in this batch, or all were already processed.",
          });
        }
      } catch (error) {
        functions.logger.error("Error during core payroll processing:", error, {
          stack: error.stack, // Include stack for better debugging
        });
        return res.status(500).json({ error: "Internal Server Error during payroll processing." }); // Send JSON error
      }
    });
  });


exports.addPayrollAdjustment = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    functions.logger.info("addPayrollAdjustment (onCall) invoked.");
    functions.logger.info("Raw `data` received:", JSON.stringify(data, null, 2));

    if (context.auth) {
      functions.logger.info("context.auth IS PRESENT. UID:", context.auth.uid);
      functions.logger.info(
        "context.auth.token details (if available):",
        JSON.stringify(context.auth.token, null, 2),
      );
    } else {
      functions.logger.error(
        "context.auth IS NULL or UNDEFINED. This means the user's token was not verified or passed correctly by the Functions backend for the onCall handler.",
      );
    }

    if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
      functions.logger.error(
        "addPayrollAdjustment: Permission denied. Auth check failed.",
        {
          authAvailable: !!context.auth,
          tokenAvailable: !!(context.auth && context.auth.token),
          isAdminClaimPresent: !!(
            context.auth &&
            context.auth.token &&
            context.auth.token.admin === true
          ),
          uidFromContext: context.auth ? context.auth.uid : "N/A (context.auth was falsy)",
        },
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "User must be an authenticated admin to perform this action.",
      );
    }
    const adminUid = context.auth.uid;
    functions.logger.info(
      `addPayrollAdjustment request validated for admin: ${adminUid}`,
    );

    const { employeeId, payPeriodId, amount, reason } = data;
    if (!employeeId || !payPeriodId || amount == null || !reason) {
      const missing = [];
      if (!employeeId) missing.push("employeeId");
      if (!payPeriodId) missing.push("payPeriodId");
      if (amount == null) missing.push("amount");
      if (!reason) missing.push("reason");
      functions.logger.warn(
        "addPayrollAdjustment: Bad Request - Missing required fields.",
        { missingFields: missing, receivedData: data },
      );
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Missing required fields: ${missing.join(", ")}.`,
      );
    }
    if (typeof employeeId !== "string" || employeeId.trim() === "") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "employeeId must be a non-empty string.",
      );
    }
    if (
      typeof payPeriodId !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payPeriodId)
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "payPeriodId must be a non-empty string in YYYY-MM-DD format.",
      );
    }
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Amount must be a finite number.",
      );
    }
    if (typeof reason !== "string" || reason.trim().length < 3) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Reason must be a non-empty string (min 3 chars).",
      );
    }

    const payrollDocId = `${employeeId}_${payPeriodId}`;
    const payrollDocRef = db.collection("employeePayroll").doc(payrollDocId);

    const adjustmentEntry = {
      amount: amount,
      reason: reason.trim(),
      adminUid: adminUid,
      timestamp: admin.firestore.Timestamp.now(), // <<<< **** CORRECTED THIS LINE ****
    };

    try {
      await payrollDocRef.set(
        {
          totalEarnings: FieldValue.increment(amount),
          adjustments: FieldValue.arrayUnion(adjustmentEntry),
          employeeId: employeeId,
          payPeriodId: payPeriodId,
          lastUpdatedByAdmin: adminUid,
          lastAdjustmentAt: serverTimestamp, // This is fine (uses global FieldValue.serverTimestamp)
          updatedAt: serverTimestamp, // This is fine (uses global FieldValue.serverTimestamp)
        },
        { merge: true },
      );
      functions.logger.info(
        `Successfully added adjustment for employee ${employeeId}, period ${payPeriodId}. Amount: ${amount}, Reason: ${reason}`,
      );
      return { success: true, message: "Payroll adjustment added successfully." };
    } catch (error) {
      functions.logger.error(
        `addPayrollAdjustment: Error updating Firestore for doc ${payrollDocId}:`,
        error,
      );
      throw new functions.https.HttpsError(
        "internal",
        "Could not apply payroll adjustment.",
        error.message,
      );
    }
  });

console.log("Functions index.js with testAuthContext, setAdminRole, and createNewUser_v1 loaded.");

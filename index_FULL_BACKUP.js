const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const cors = require("cors")({ origin: true });
const { addDays, addWeeks, addMonths, getDay, startOfDay, formatISO } = require("date-fns");
const { utcToZonedTime, zonedTimeToUtc } = require("date-fns-tz");
const { onSchedule } = require("firebase-functions/v2/scheduler");

// Initialize Firebase Admin SDK ONLY ONCE
// This is a common pattern to prevent re-initialization on warm starts
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log("Firebase Admin SDK initialized successfully (first time).");
  } catch (e) {
    console.error("Firebase Admin SDK initialization error", e);
  }
} else {
  // If already initialized, you can optionally log or just use the existing default app
  console.log("Firebase Admin SDK already initialized.");
}

// Initialize Firestore instance (should be AFTER initializeApp)
const db = admin.firestore();
const timezone = "America/New_York";

// Define serverTimestamp constant using imported FieldValue
const serverTimestamp = FieldValue.serverTimestamp;

// --- Helper Functions ---
// ... your verifyTokenAndAdmin, calculateNextServiceDate, getBiWeeklyPayPeriod functions ...

// --- HTTP Functions ---
// ... your exports.createNewUser_v1, exports.deleteAuthUser_v1, etc. ...

/**
 * Helper Function: Verify ID Token and Admin Claim (for onRequest)
 */
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
    // Ensure custom claims exist and admin property is true
    if (decodedToken.admin !== true) {
      console.warn(`User ${decodedToken.uid} is not an admin.`);
      throw createAuthError(403, "permission-denied");
    }
    console.log(`Admin role confirmed for UID: ${decodedToken.uid}`);
    return decodedToken.uid;
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw our custom error
    }
    console.error("Error verifying ID token:", error);
    const code = error.code === "auth/id-token-expired" ? 401 : 401;
    const message = error.code === "auth/id-token-expired" ? "token-expired" : "unauthenticated";
    throw createAuthError(code, message);
  }
};

/**
 * Calculates the next service date based on frequency and current date.
 */
function calculateNextServiceDate(currentDueDateTimestamp, frequency, serviceDays) {
  const currentDueDate = currentDueDateTimestamp.toDate();
  let nextDate;

  switch (frequency) {
  case "Weekly":
    nextDate = addWeeks(currentDueDate, 1);
    break;
  case "Bi-Weekly":
    nextDate = addWeeks(currentDueDate, 2);
    break;
  case "Monthly":
    nextDate = addMonths(currentDueDate, 1);
    break;
  case "CustomWeekly":
    if (!serviceDays || serviceDays.length === 0) {
      console.warn("CustomWeekly specified but no serviceDays set. Defaulting to +1 week.");
      nextDate = addWeeks(currentDueDate, 1);
    } else {
      const sortedServiceDays = [...serviceDays].sort((a, b) => a - b);
      const currentDayOfWeek = getDay(currentDueDate); // 0=Sun, 6=Sat
      let nextDayOfWeek = -1;
      for (const day of sortedServiceDays) {
        if (day > currentDayOfWeek) {
          nextDayOfWeek = day;
          break;
        }
      }
      let daysToAdd;
      if (nextDayOfWeek !== -1) {
        // Found a service day later in the current week
        daysToAdd = nextDayOfWeek - currentDayOfWeek;
      } else {
        // No service day later this week, find the first service day next week
        daysToAdd = (7 - currentDayOfWeek) + sortedServiceDays[0];
      }
      nextDate = addDays(currentDueDate, daysToAdd);
    }
    break;
  default:
    console.error(`Unknown frequency: ${frequency}. Defaulting to +1 month.`);
    nextDate = addMonths(currentDueDate, 1);
    break;
  }
  return admin.firestore.Timestamp.fromDate(nextDate);
}


/**
 * Calculates the start and end dates of a bi-weekly pay period (Sun-Sat)
 * containing the given service date. Uses UTC for calculations.
 */
function getBiWeeklyPayPeriod(serviceJsDate) {
  // Anchor: Sunday, April 13, 2025, 00:00:00 UTC
  const anchorStartDateUTC = new Date(Date.UTC(2025, 3, 13)); // Month is 0-indexed

  const serviceDateUTC = new Date(Date.UTC(
    serviceJsDate.getFullYear(),
    serviceJsDate.getMonth(),
    serviceJsDate.getDate(),
  ));

  const msInDay = 1000 * 60 * 60 * 24;
  const timeDifference = serviceDateUTC.getTime() - anchorStartDateUTC.getTime();
  const daysDifference = Math.floor(timeDifference / msInDay);
  const periodIndex = Math.floor(daysDifference / 14);

  const periodStartDate = new Date(anchorStartDateUTC.getTime());
  periodStartDate.setUTCDate(periodStartDate.getUTCDate() + periodIndex * 14);

  const periodEndDate = new Date(periodStartDate.getTime());
  periodEndDate.setUTCDate(periodEndDate.getUTCDate() + 13);

  // Variables for ID generation
  const startYear = periodStartDate.getUTCFullYear();
  const startMonth = (periodStartDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const startDay = periodStartDate.getUTCDate().toString().padStart(2, "0");

  // Corrected periodId format
  const periodId = `${startYear}-${startMonth}-${startDay}`;

  console.log(`ServiceDateUTC: ${serviceDateUTC.toISOString()}, PeriodStart: ${periodStartDate.toISOString()}, PeriodEnd: ${periodEndDate.toISOString()}, PeriodID: ${periodId}`);

  return {
    startDate: periodStartDate,
    endDate: periodEndDate,
    periodId: periodId,
  };
}


// --- HTTP Functions (v1 with CORS) ---

exports.createNewUser_v1 = functions.runWith({ memory: "256MB", timeoutSeconds: 60 }).https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log("createNewUser_v1 (onRequest) invoked.");
    let adminUid;
    try {
      if (req.method !== "POST") {
        return res.status(405).send({ success: false, error: { message: "Method Not Allowed" } });
      }
      adminUid = await verifyTokenAndAdmin(req);
      const { email, password, role, clientIdString, companyName, contactName, phone, employeeIdString, firstName, lastName, jobTitle } = req.body;

      console.log(`Received create request: role=${role}`);

      // Basic Validation
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

      // Role Specific Validation & Prep
      if (role === "client") {
        if (!clientIdString || !companyName || !contactName) {
          return res.status(400).send({ success: false, error: { code: "invalid-argument", message: "Missing required fields for client: clientIdString, companyName, contactName." } });
        }
        profileCollectionPath = "clientMasterList";
        customIdField = "clientIdString";
        customIdValue = clientIdString;
        authDisplayName = contactName;
        profileData = {
          clientIdString,
          companyName,
          contactName,
          phone: phone || "",
          email,
          status: true,
          createdAt: admin.firestore.Timestamp.now(), // CORRECTED
          updatedAt: admin.firestore.Timestamp.now(), // CORRECTED
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
          employeeIdString,
          firstName,
          lastName,
          phone: phone || "",
          email,
          jobTitle: jobTitle || "",
          status: true,
          createdAt: admin.firestore.Timestamp.now(), // CORRECTED
          updatedAt: admin.firestore.Timestamp.now(), // CORRECTED
        };
      }

      // Uniqueness check for custom ID
      console.log(`Checking uniqueness for ${customIdField}: ${customIdValue}`);
      const idCheckQuery = db.collection(profileCollectionPath).where(customIdField, "==", customIdValue).limit(1);
      const idCheckSnapshot = await idCheckQuery.get();
      if (!idCheckSnapshot.empty) {
        return res.status(409).send({ success: false, error: { code: "already-exists", message: `The provided ID (${customIdValue}) is already in use.` } });
      }
      console.log(`Custom ID '${customIdValue}' is unique.`);

      // Create Auth User
      console.log(`Attempting to create Auth user for email: ${email}`);
      const userRecord = await admin.auth().createUser({ email, password, displayName: authDisplayName, emailVerified: false, disabled: false });
      console.log(`Successfully created Auth user UID: ${userRecord.uid}`);

      // Set Custom Claims
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: false, role: role });
      console.log(`Set custom claim 'role: ${role}' for UID: ${userRecord.uid}`);

      // Create Firestore Documents (Batch)
      const batch = db.batch();
      const userDocRef = db.collection("users").doc(userRecord.uid);
      const profileDocRef = db.collection(profileCollectionPath).doc(); // Auto-ID

      // Set /users doc
      batch.set(userDocRef, {
        email: userRecord.email,
        role,
        profileId: profileDocRef.id,
        createdAt: serverTimestamp,
      });
      // Set profile doc
      batch.set(profileDocRef, profileData); // profileData already includes timestamps

      await batch.commit();
      console.log(`Committed Firestore batch write. Profile ID: ${profileDocRef.id}`);

      // Update Counter (Best Effort)
      const counterRef = db.collection("counters").doc("ids");
      const counterField = role === "client" ? "lastClientIdNumber" : "lastEmployeeIdNumber";
      try {
        await counterRef.update({ [counterField]: FieldValue.increment(1) });
        console.log(`Incremented counter field: ${counterField}`);
      } catch (counterError) {
        console.error(`Error updating counter ${counterField}:`, counterError);
      }

      console.log(`User creation completed by admin ${adminUid}.`);
      return res.status(200).send({ success: true, uid: userRecord.uid, profileId: profileDocRef.id, message: `Successfully created new ${role} user.` });
    } catch (error) {
      console.error(`Error in createNewUser_v1 for admin ${adminUid || "unknown"}:`, error);
      if (error.code === "already-exists") {
        return res.status(409).send({ success: false, error: { code: "already-exists", message: error.message } });
      }
      if (error.statusCode) { // Auth errors from verifyTokenAndAdmin
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

/**
 * @name processCompletedJobsPayroll
 * @description HTTP Cloud Function to manually trigger payroll calculation
 * for completed serviceHistory records that haven't been processed yet.
 * Handles documents where payrollProcessed field might be missing.
 * Requires authenticated admin user.
 * v1.3 - DIAGNOSTIC: All batch timestamps to new Date()
 *
 * @param {object} req - The HTTP request object.
 * @param {object} res - The HTTP response object.
 */
exports.processCompletedJobsPayroll = functions.runWith({ memory: "512MB", timeoutSeconds: 120 }).https.onRequest(async (req, res) => {
  // ===== DIAGNOSTIC LOGGING LINES (UNCOMMENTED) =====
  functions.logger.info("DEBUG: processCompletedJobsPayroll - Function Invoked.");
  functions.logger.info(`DEBUG: TYPEOF global serverTimestamp constant at function start: ${typeof serverTimestamp}`);
  functions.logger.info(`DEBUG: global serverTimestamp constant IS FieldValue.serverTimestamp: ${serverTimestamp === FieldValue.serverTimestamp}`);
  functions.logger.info(`DEBUG: TYPEOF global FieldValue.serverTimestamp: ${typeof FieldValue.serverTimestamp}`);
  // ===== END DIAGNOSTIC LOGGING LINES =====

  cors(req, res, async () => {
    if (req.method !== "POST") {
      functions.logger.warn("processCompletedJobsPayroll: Method Not Allowed - ", req.method);
      return res.status(405).send("Method Not Allowed");
    }

    let adminUid;
    try {
      adminUid = await verifyTokenAndAdmin(req);
      functions.logger.info(`processCompletedJobsPayroll request received from admin: ${adminUid}`);
    } catch (error) {
      functions.logger.error("processCompletedJobsPayroll: Authentication/Authorization failed:", error);
      const statusCode = error.statusCode || 500;
      const message = error.message || "Internal Server Error during authentication.";
      return res.status(statusCode).send(`Auth Error: ${message}`);
    }

    try {
      const BATCH_LIMIT = 100;
      // db is defined globally

      functions.logger.info("Querying serviceHistory where status == \"Completed\", ordering by serviceDate...");
      const historyQuery = db.collection("serviceHistory")
        .where("status", "==", "Completed")
        .orderBy("serviceDate")
        .limit(BATCH_LIMIT);

      const historySnapshot = await historyQuery.get();
      functions.logger.info(`Query completed. Snapshot size: ${historySnapshot.size}. Snapshot empty: ${historySnapshot.empty}`);

      if (historySnapshot.empty) {
        functions.logger.info("processCompletedJobsPayroll: No \"Completed\" status jobs found to process.");
        return res.status(200).send({ message: "No new completed jobs found to process." });
      }

      functions.logger.info(`processCompletedJobsPayroll: Found ${historySnapshot.size} completed jobs to potentially process.`);
      const batch = db.batch();
      let processedJobsCount = 0;
      let skippedAlreadyProcessedCount = 0;
      let failedJobLookups = 0;

      for (const historyDoc of historySnapshot.docs) {
        const historyId = historyDoc.id;
        const historyData = historyDoc.data();
        const historyDocRef = historyDoc.ref;

        if (historyData.payrollProcessed === true) {
          functions.logger.info(`Skipping job ${historyId} as payrollProcessed is already true.`);
          skippedAlreadyProcessedCount++;
          continue;
        }

        const { locationId, serviceDate: serviceTimestampFromHistory, employeeAssignments, locationName = "N/A" } = historyData;

        if (!locationId || !serviceTimestampFromHistory?.toDate || !Array.isArray(employeeAssignments) || employeeAssignments.length === 0) {
          functions.logger.warn(`Skipping job ${historyId} due to missing critical data.`, { data: historyData });
          failedJobLookups++;
          const historyUpdateSkippedMissingData = {
            payrollProcessed: true,
            payrollProcessedAt: new Date(), // DIAGNOSTIC CHANGE
            payrollProcessingStatus: "Skipped - Missing Data",
          };
          functions.logger.info(`[BATCH PREP - Update historyDocRef - SkipMissingData] ID: ${historyId}`, JSON.stringify(historyUpdateSkippedMissingData));
          batch.update(historyDocRef, historyUpdateSkippedMissingData);
          continue;
        }

        const serviceJsDate = serviceTimestampFromHistory.toDate();
        let payPeriod;
        let payPeriodStartTimestamp;
        let payPeriodEndTimestamp;

        try {
          payPeriod = getBiWeeklyPayPeriod(serviceJsDate);
          if (!payPeriod?.startDate || !(payPeriod.startDate instanceof Date) || !payPeriod?.endDate || !(payPeriod.endDate instanceof Date) || typeof payPeriod.periodId !== "string" || !payPeriod.periodId) {
            throw new Error("Invalid pay period structure returned by helper.");
          }
          payPeriodStartTimestamp = admin.firestore.Timestamp.fromDate(payPeriod.startDate);
          payPeriodEndTimestamp = admin.firestore.Timestamp.fromDate(payPeriod.endDate);
          functions.logger.info(`Job ${historyId}: Service Date ${serviceJsDate.toISOString()} -> Pay Period ID ${payPeriod.periodId}`);
        } catch (periodError) {
          functions.logger.error(`Error calculating pay period for job ${historyId}. Skipping job.`, periodError);
          failedJobLookups++;
          const historyUpdateSkippedPeriodError = {
            payrollProcessed: true,
            payrollProcessedAt: new Date(), // DIAGNOSTIC CHANGE
            payrollProcessingStatus: `Skipped - Pay Period Error: ${periodError.message}`,
          };
          functions.logger.info(`[BATCH PREP - Update historyDocRef - SkipPeriodError] ID: ${historyId}`, JSON.stringify(historyUpdateSkippedPeriodError));
          batch.update(historyDocRef, historyUpdateSkippedPeriodError);
          continue;
        }

        let jobHasAtLeastOneRate = false;
        for (const assignment of employeeAssignments) {
          const { employeeId, employeeName = "N/A" } = assignment || {};
          if (!employeeId) {
            functions.logger.warn(`Skipping assignment in job ${historyId}: missing employeeId.`);
            continue;
          }

          let rateApplied = null;
          let calculatedEarnings = 0;
          try {
            const rateQuerySnapshot = await db.collection("employeeRates")
              .where("employeeProfileId", "==", employeeId)
              .where("locationId", "==", locationId)
              .limit(1)
              .get();

            if (!rateQuerySnapshot.empty) {
              const rateData = rateQuerySnapshot.docs[0].data();
              rateApplied = rateData.rate;
              if (typeof rateApplied !== "number" || !Number.isFinite(rateApplied)) {
                throw new Error(`Invalid rate found: ${rateApplied}`);
              }
              calculatedEarnings = rateApplied;
              jobHasAtLeastOneRate = true;
              functions.logger.info(`Job ${historyId}, Employee ${employeeId}: Found rate ${rateApplied}. Calculated earnings: ${calculatedEarnings}`);
            } else {
              functions.logger.warn(`RATE NOT FOUND for Employee ${employeeId} at Location ${locationId} (Job: ${historyId}). Skipping payroll update for this employee on this job.`);
              continue;
            }
          } catch (rateError) {
            functions.logger.error(`Error fetching rate for Employee ${employeeId} / Location ${locationId} (Job: ${historyId}). Skipping payroll update.`, rateError);
            continue;
          }

          const payrollDocId = `${employeeId}_${payPeriod.periodId}`;
          const payrollDocRef = db.collection("employeePayroll").doc(payrollDocId);

          const jobDetailObject = {
            serviceHistoryId: historyId,
            locationId: locationId,
            locationName: locationName,
            serviceDate: serviceTimestampFromHistory,
            rateApplied: rateApplied,
            earnings: calculatedEarnings,
            processedAt: new Date(), // Using client-generated Date object
          };

          functions.logger.info(`[JOB_DETAIL_OBJECT CHECK] For Employee: ${employeeId}, Job: ${historyId}:`);
          for (const key in jobDetailObject) {
            if (Object.prototype.hasOwnProperty.call(jobDetailObject, key)) {
              if (typeof jobDetailObject[key] === "function") {
                functions.logger.error(`  !!!! FUNCTION FOUND in jobDetailObject !!!! Key: ${key}`);
              } else if (jobDetailObject[key] && typeof jobDetailObject[key].toDate === "function") {
                functions.logger.info(`  Key: ${key}, Type: Firestore Timestamp, Value: ${jobDetailObject[key].toDate().toISOString()}`);
              } else if (jobDetailObject[key] === serverTimestamp || jobDetailObject[key] === admin.firestore.FieldValue.serverTimestamp) {
                functions.logger.info(`  Key: ${key}, Type: FieldValue.serverTimestamp (SENTINEL)`);
              } else {
                functions.logger.info(`  Key: ${key}, Type: ${typeof jobDetailObject[key]}, Value:`, jobDetailObject[key]);
              }
            }
          }
          functions.logger.info(`[BATCH PREP - jobDetailObject for EmployeePayroll] For Employee: ${employeeId}, Job: ${historyId}`, JSON.stringify(jobDetailObject));

          const payrollDocDataForBatch = {
            employeeId: employeeId,
            payPeriodId: payPeriod.periodId,
            employeeName: employeeName,
            payPeriodStartDate: payPeriodStartTimestamp,
            payPeriodEndDate: payPeriodEndTimestamp,
            totalEarnings: FieldValue.increment(calculatedEarnings),
            jobs: FieldValue.arrayUnion(jobDetailObject),
            status: "Pending",
            updatedAt: new Date(), // DIAGNOSTIC CHANGE
            createdAt: new Date(), // DIAGNOSTIC CHANGE (will only set if doc is new due to merge:true)
          };
          functions.logger.info(`Batch set prepared for payrollDocId ${payrollDocId}:`, JSON.stringify(payrollDocDataForBatch));
          batch.set(payrollDocRef, payrollDocDataForBatch, { merge: true });
        }

        if (jobHasAtLeastOneRate) {
          const historyUpdateProcessed = {
            payrollProcessed: true,
            payrollProcessedAt: new Date(), // DIAGNOSTIC CHANGE
            payrollProcessingStatus: "Processed",
          };
          functions.logger.info(`Batch update prepared for job ${historyId}:`, JSON.stringify(historyUpdateProcessed));
          batch.update(historyDocRef, historyUpdateProcessed);
          processedJobsCount++;
        } else {
          functions.logger.warn(`Job ${historyId} had status "Completed" but no valid rates were found for assigned employees. Not marking as processed.`);
          failedJobLookups++;
        }
      }

      if (processedJobsCount > 0 || failedJobLookups > 0 || skippedAlreadyProcessedCount > 0) {
        functions.logger.info("----------------------------------------------------");
        functions.logger.info(`[BATCH COMMIT PREP] Preparing to commit batch. Processed: ${processedJobsCount}, FailedLookups: ${failedJobLookups}, SkippedProcessed: ${skippedAlreadyProcessedCount}`);
        functions.logger.info("----------------------------------------------------");
        await batch.commit();
        functions.logger.info(`Successfully committed batch. Processed ${processedJobsCount} jobs. Skipped ${failedJobLookups} jobs (missing data/rates or no rates found). Skipped ${skippedAlreadyProcessedCount} already processed jobs.`);
        return res.status(200).send({
          message: `Payroll processing complete. Processed ${processedJobsCount} new jobs. Skipped ${failedJobLookups} jobs due to missing data/rates or no rates found. Encountered ${skippedAlreadyProcessedCount} already processed jobs.`,
        });
      } else {
        functions.logger.info("No jobs required processing in this batch.");
        return res.status(200).send({ message: "Checked completed jobs. No new jobs required payroll processing in this batch." });
      }
    } catch (error) {
      functions.logger.error("Error during core processing:", error, { stack: error.stack });
      return res.status(500).send("Internal Server Error during payroll processing.");
    }
  });
});


/**
 * @name addPayrollAdjustment
 * @description HTTPS Callable Cloud Function to add a manual monetary adjustment
 * to an employee's payroll record for a specific pay period.
 * Requires authenticated admin user (checked via context.auth).
 * v1.4 - Removed problematic full context logging.
 *
 * @param {object} data - Data passed from the client.
 * @param {string} data.employeeId - ID of the employee (matches employeeProfileId in employeeMasterList).
 * @param {string} data.payPeriodId - Identifier for the pay period (e.g., "2025-05-11"). Matches format from getBiWeeklyPayPeriod.
 * @param {number} data.amount - The adjustment amount (positive or negative).
 * @param {string} data.reason - Explanation for the adjustment.
 * @param {functions.https.CallableContext} context - Context object containing auth information.
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
exports.addPayrollAdjustment = functions.runWith({ memory: "256MB", timeoutSeconds: 60 }).https.onCall(async (data, context) => {
  functions.logger.info("addPayrollAdjustment (onCall) invoked.");
  functions.logger.info("Raw `data` received:", JSON.stringify(data, null, 2));

  // Log specific parts of context, especially auth
  if (context.auth) {
    functions.logger.info("context.auth IS PRESENT. UID:", context.auth.uid);
    functions.logger.info("context.auth.token details (if available):", JSON.stringify(context.auth.token, null, 2));
  } else {
    // This log will now be key if the permission denied error returns
    functions.logger.error("context.auth IS NULL or UNDEFINED. This means the user's token was not verified or passed correctly by the Functions backend for the onCall handler.");
  }

  // 1. Authentication & Authorization
  if (!context.auth || !context.auth.token || context.auth.token.admin !== true) {
    functions.logger.error("addPayrollAdjustment: Permission denied. Auth check failed.", {
      authAvailable: !!context.auth,
      tokenAvailable: !!(context.auth && context.auth.token),
      isAdminClaimPresent: !!(context.auth && context.auth.token && context.auth.token.admin === true),
      uidFromContext: context.auth ? context.auth.uid : "N/A (context.auth was falsy)",
    });
    // This error will be caught by the client if thrown
    throw new functions.https.HttpsError("permission-denied", "User must be an authenticated admin to perform this action.");
  }
  const adminUid = context.auth.uid;
  functions.logger.info(`addPayrollAdjustment request validated for admin: ${adminUid}`);

  // 2. Input Validation
  const { employeeId, payPeriodId, amount, reason } = data;
  if (!employeeId || !payPeriodId || amount == null || !reason) {
    const missing = [];
    if (!employeeId) missing.push("employeeId");
    if (!payPeriodId) missing.push("payPeriodId");
    if (amount == null) missing.push("amount");
    if (!reason) missing.push("reason");
    functions.logger.warn("addPayrollAdjustment: Bad Request - Missing required fields.", { missingFields: missing, receivedData: data });
    throw new functions.https.HttpsError("invalid-argument", `Missing required fields: ${missing.join(", ")}.`);
  }
  if (typeof employeeId !== "string" || employeeId.trim() === "") {
    throw new functions.https.HttpsError("invalid-argument", "employeeId must be a non-empty string.");
  }
  if (typeof payPeriodId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payPeriodId)) {
    throw new functions.https.HttpsError("invalid-argument", "payPeriodId must be a non-empty string in YYYY-MM-DD format.");
  }
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new functions.https.HttpsError("invalid-argument", "Amount must be a finite number.");
  }
  if (typeof reason !== "string" || reason.trim().length < 3) {
    throw new functions.https.HttpsError("invalid-argument", "Reason must be a non-empty string (min 3 chars).");
  }

  // 3. Firestore Interaction
  const payrollDocId = `${employeeId}_${payPeriodId}`;
  const payrollDocRef = db.collection("employeePayroll").doc(payrollDocId);
  const adjustmentEntry = {
    amount: amount,
    reason: reason.trim(),
    adminUid: adminUid,
    timestamp: serverTimestamp, // Use the global serverTimestamp constant
  };
  try {
    await payrollDocRef.set({
      totalEarnings: FieldValue.increment(amount),
      adjustments: FieldValue.arrayUnion(adjustmentEntry),
      employeeId: employeeId,
      payPeriodId: payPeriodId,
      lastUpdatedByAdmin: adminUid,
      lastAdjustmentAt: serverTimestamp,
      updatedAt: serverTimestamp,
    }, { merge: true });
    functions.logger.info(`Successfully added adjustment for employee ${employeeId}, period ${payPeriodId}. Amount: ${amount}, Reason: ${reason}`);
    return { success: true, message: "Payroll adjustment added successfully." };
  } catch (error) {
    functions.logger.error(`addPayrollAdjustment: Error updating Firestore for doc ${payrollDocId}:`, error);
    throw new functions.https.HttpsError("internal", "Could not apply payroll adjustment.", error.message);
  }
});

// In functions/index.js

/**
 * @name setAdminRole
 * @description HTTPS Callable Cloud Function to set custom claims for admin roles.
 * Only callable by an existing super_admin.
 *
 * @param {object} data - Data passed from the client (expects data.data from callable wrapper).
 * @param {string} data.data.targetUid - The UID of the user whose claims are to be set.
 * @param {string} data.data.roleToSet - The role to assign ('super_admin', 'standard_admin', 'employee', 'client', or 'none_admin').
 * @param {functions.https.CallableContext} context - Context object containing auth information.
 * @returns {Promise<{success: boolean, message: string, error?: string}>}
 */
exports.setAdminRole = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 }) // <-- ADD THIS LINE
  .https.onCall(async (data, context) => {
    functions.logger.info("setAdminRole (Strict Version) invoked by UID:", context.auth ? context.auth.uid : "No auth context");
    functions.logger.info("Raw data wrapper received. Keys in data:", data ? Object.keys(data) : "Data is null/undefined");
    if (data && data.data) {
      functions.logger.info("data.data.targetUid:", data.data.targetUid);
      functions.logger.info("data.data.roleToSet:", data.data.roleToSet);
    } else {
      functions.logger.info("data.data is not present as expected.");
    }

    // 1. Authentication & Authorization (Stricter Check)
    const callerUid = context.auth ? context.auth.uid : null;
    if (!(context.auth && context.auth.token && context.auth.token.super_admin === true)) {
      functions.logger.error("setAdminRole: PERMISSION DENIED. Caller is not a super_admin.", {
        callerUid: callerUid,
        claimsInfo: context.auth && context.auth.token ? "Token object exists" : "No token object",
      });
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to set admin roles. Must be a super_admin.");
    }
    functions.logger.info(`setAdminRole: Caller ${callerUid} validated as super_admin by custom claim.`);

    // 2. Extract and Validate input data
    const actualData = data.data || {}; // Data from callable functions is in data.data
    const { targetUid, roleToSet } = actualData;

    if (!targetUid || typeof targetUid !== "string" || targetUid.trim() === "") {
      throw new functions.https.HttpsError("invalid-argument", "targetUid must be a non-empty string.");
    }
    if (!["super_admin", "standard_admin", "employee", "client", "none_admin"].includes(roleToSet)) {
      throw new functions.https.HttpsError("invalid-argument", "roleToSet must be 'super_admin', 'standard_admin', 'employee', 'client', or 'none_admin'.");
    }

    // Prevent a super_admin from accidentally removing their own super_admin status via this function
    // if they are the only super_admin (or part of a small list). This is a safety net.
    // You might want more sophisticated logic if you have multiple super_admins.
    if (callerUid === targetUid && roleToSet !== "super_admin" && context.auth.token.super_admin === true) {
    // Check if there are other super_admins if you implement that, otherwise prevent self-demotion from last super_admin.
    // For now, a simple prevention for self-demotion from super_admin by a super_admin:
      if (roleToSet !== "super_admin") { // If a super_admin is editing themselves, they must remain super_admin via this function.
        functions.logger.warn(`setAdminRole: Super_admin ${callerUid} attempted to change their own role to ${roleToSet}. This is restricted to ensure at least one super_admin remains. They should remain super_admin.`);
      // Optionally, just force roleToSet to 'super_admin' or throw an error.
      // For simplicity, we'll let it proceed but newClaims will ensure super_admin if target is self for a super_admin call
      }
    }


    try {
      functions.logger.info(`Attempting to set claims for target UID: ${targetUid} to reflect role: ${roleToSet}`);

      const targetUserAuthRecord = await admin.auth().getUser(targetUid);
      const currentClaims = targetUserAuthRecord.customClaims || {};

      const newClaims = {
        ...currentClaims,
        admin: false,
        super_admin: false,
        standard_admin: false,
      };

      const firestoreRoleUpdate = {};

      if (roleToSet === "super_admin") {
        newClaims.admin = true;
        newClaims.super_admin = true;
        firestoreRoleUpdate.role = "super_admin";
      } else if (roleToSet === "standard_admin") {
        newClaims.admin = true;
        newClaims.standard_admin = true;
        // Ensure they are not also super_admin if they are being set to standard_admin
        newClaims.super_admin = false;
        firestoreRoleUpdate.role = "standard_admin";
      } else if (["employee", "client"].includes(roleToSet)) {
      // Removing all admin-level claims if setting to a base role
        newClaims.admin = false;
        newClaims.super_admin = false;
        newClaims.standard_admin = false;
        firestoreRoleUpdate.role = roleToSet;
      } else if (roleToSet === "none_admin") {
      // Explicitly removes all admin-related claims.
      // The 'role' in Firestore should be updated to reflect their primary non-admin role (employee/client).
      // This needs to be handled carefully to not lock out users or assign incorrect base roles.
      // For now, just clears admin claims. The client should ideally pass the intended base role.
        newClaims.admin = false;
        newClaims.super_admin = false;
        newClaims.standard_admin = false;
        functions.logger.info(`Removing admin-level claims for ${targetUid}. Their base role in Firestore needs to be accurate.`);
      // To be safe, we might not update the Firestore role field here if 'none_admin' unless we know their base role
      // For example, you might query the user's doc for existing role and if it's employee/client, keep it.
      // Or, client provides the base role. For now, no change to Firestore 'role' for 'none_admin'.
      }

      // Safety: if the super_admin is editing themselves, ensure they retain super_admin claims
      if (callerUid === targetUid && context.auth.token.super_admin === true) {
        newClaims.admin = true;
        newClaims.super_admin = true;
        if (roleToSet !== "super_admin") { // If they tried to change it, log and force it back
          functions.logger.warn(`Super_admin ${callerUid} was editing self; ensuring super_admin claims are preserved.`);
          firestoreRoleUpdate.role = "super_admin"; // Also ensure Firestore role remains super_admin
        }
      }


      await admin.auth().setCustomUserClaims(targetUid, newClaims);
      functions.logger.info(`Successfully set custom claims for UID ${targetUid}:`, newClaims);

      if (Object.keys(firestoreRoleUpdate).length > 0) {
        const userDocRef = db.collection("users").doc(targetUid);
        await userDocRef.update({
          ...firestoreRoleUpdate,
          updatedAt: admin.firestore.Timestamp.fromDate(new Date()), // Using new Date() for consistency
        });
        functions.logger.info(`Updated Firestore role field for UID ${targetUid} to:`, firestoreRoleUpdate);
      }

      return { success: true, message: `Successfully set claims for user ${targetUid} based on role '${roleToSet}'.` };
    } catch (error) {
      functions.logger.error(`setAdminRole: Error during claim/role update for UID ${targetUid}:`, error);
      if (error.code && error.message && typeof error.code === "string" && error.code.startsWith("functions/") ) {
        throw error;
      }
      if (error.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", `User with UID ${targetUid} does not exist in Firebase Auth.`);
      }
      throw new functions.https.HttpsError("internal", "An internal error occurred while setting roles.", error.message);
    }
  });
  */

// ^^ END OF THE NEW setAdminRole FUNCTION ^^

// --- Firestore Triggered Function (V2 Syntax) --- COMMENTED OUT ---
/*
exports.calculatePayOnCompletion = onDocumentUpdated("serviceHistory/{historyId}", async (event) => {
  // ... (Original Trigger Code - Keep Commented) ...
});
*/


// --- Scheduled Function for Service Generation ---

/**
 * Scheduled function to generate serviceHistory records for recurring services.
 * Runs daily. Checks locations with a nextServiceDate <= today.
 * Creates 'Scheduled' entries and updates the location's nextServiceDate.
 */
exports.generateScheduledServices = onSchedule({
  schedule: "every day 05:00", // Schedule string
  timeZone: timezone, // Use global timezone variable
}, async (event) => {
  console.log(`Running generateScheduledServices at ${event.scheduleTime}`);

  const nowInTimezone = utcToZonedTime(new Date(), timezone);
  const startOfTodayInTimezone = startOfDay(nowInTimezone);
  const startOfTodayUtc = zonedTimeToUtc(startOfTodayInTimezone, timezone);
  const todayTimestamp = admin.firestore.Timestamp.fromDate(startOfTodayUtc);

  console.log(`Checking for services due on or before: ${formatISO(startOfTodayUtc)} (UTC)`);

  const locationsRef = db.collection("locations");
  const query = locationsRef
    .where("serviceFrequency", "in", ["Weekly", "Bi-Weekly", "Monthly", "CustomWeekly"])
    .where("nextServiceDate", "<=", todayTimestamp);

  try {
    const snapshot = await query.get();
    if (snapshot.empty) {
      console.log("No locations due for scheduled service generation.");
      return null;
    }

    console.log(`Found ${snapshot.size} locations potentially needing service generation.`);
    let generatedCount = 0;
    let updatedCount = 0;
    let skippedCustomDayCount = 0;

    // Use Promise.allSettled for better error handling in parallel batches
    const batchPromises = [];
    const MAX_BATCH_SIZE = 400; // Firestore batch limit is 500 writes
    let currentBatch = db.batch();
    let currentBatchSize = 0;

    for (const doc of snapshot.docs) {
      const location = doc.data();
      const locationId = doc.id;
      const { locationName, clientProfileId, clientName, serviceFrequency, serviceDays, nextServiceDate } = location;

      if (!nextServiceDate?.toDate) {
        console.warn(`Location ${locationId} (${locationName}) has invalid nextServiceDate. Skipping.`);
        continue;
      }

      const dueDate = nextServiceDate.toDate();
      const dueDateStartOfDayUtc = startOfDay(dueDate); // Use UTC date for day calculation

      let shouldGenerateToday = true;
      if (serviceFrequency === "CustomWeekly") {
        if (!serviceDays || serviceDays.length === 0) {
          console.warn(`Location ${locationId} (${locationName}) has 'CustomWeekly' but no serviceDays. Skipping generation.`);
          shouldGenerateToday = false;
        } else {
          const dueDayOfWeek = getDay(dueDateStartOfDayUtc); // Get day of week from UTC date
          if (!serviceDays.includes(dueDayOfWeek)) {
            console.log(`Location ${locationId} (${locationName}) due date falls on non-service day (${dueDayOfWeek}). Skipping generation.`);
            shouldGenerateToday = false;
            skippedCustomDayCount++;
          }
        }
      }

      let newNextServiceDate;
      try {
        newNextServiceDate = calculateNextServiceDate(nextServiceDate, serviceFrequency, serviceDays);
        console.log(`Location ${locationId}: Next Due: ${formatISO(newNextServiceDate.toDate())}`);
      } catch (calcError) {
        console.error(`Error calculating next service date for location ${locationId}:`, calcError);
        continue; // Skip this location if calculation fails
      }

      // Add operations to the current batch
      if (shouldGenerateToday) {
        const historyRef = db.collection("serviceHistory").doc();
        const serviceDateTimestamp = nextServiceDate; // Use the date it was due
        currentBatch.set(historyRef, {
          clientProfileId: clientProfileId || null,
          locationId,
          clientName: clientName || null,
          locationName: locationName || null,
          serviceDate: serviceDateTimestamp,
          serviceType: serviceFrequency || "Scheduled",
          status: "Scheduled",
          employeeAssignments: [],
          serviceNotes: null,
          timeEntryId: null,
          payrollProcessed: false,
          createdAt: admin.firestore.Timestamp.now(), // ADD THIS (or ensure it's here)
          updatedAt: admin.firestore.Timestamp.now(), // ENSURE THIS IS HERE
        });
        generatedCount++;
        currentBatchSize++; // Increment for set operation
        console.log(`Prepared serviceHistory for ${locationId} on ${formatISO(serviceDateTimestamp.toDate())}`);
      }

      // Always update the nextServiceDate for the location
      const locationRef = db.collection("locations").doc(locationId);
      currentBatch.update(locationRef, {
        nextServiceDate: newNextServiceDate,
        updatedAt: admin.firestore.Timestamp.now(), // CORRECTED
      });
      updatedCount++;
      currentBatchSize++; // Increment for update operation

      // Commit batch if it reaches size limit
      if (currentBatchSize >= MAX_BATCH_SIZE) {
        console.log(`Committing batch of ${currentBatchSize} operations...`);
        batchPromises.push(currentBatch.commit());
        currentBatch = db.batch(); // Start a new batch
        currentBatchSize = 0;
      }
    } // End loop

    // Commit any remaining operations in the last batch
    if (currentBatchSize > 0) {
      console.log(`Committing final batch of ${currentBatchSize} operations...`);
      batchPromises.push(currentBatch.commit());
    }

    // Wait for all batches to complete
    const results = await Promise.allSettled(batchPromises);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Error committing batch ${index + 1}:`, result.reason);
      } else {
        console.log(`Successfully committed batch ${index + 1}.`);
      }
    });

    console.log(`Finished generateScheduledServices. Generated: ${generatedCount}, Updated: ${updatedCount}, Skipped Custom Day: ${skippedCustomDayCount}.`);
    return null;
  } catch (error) {
    console.error("Error querying/processing locations for scheduled services:", error);
    throw error; // Let Firebase handle retries
  }
}); // End onSchedule

// --- End of Scheduled Function ---
exports.testAuthContext = functions
  .runWith({ memory: "128MB", timeoutSeconds: 60 }) // <-- ADD THIS LINE
  .https.onCall((data, context) => {
    if (context.auth) {
      functions.logger.info("testAuthContext: Auth context IS PRESENT. UID:", context.auth.uid, "Claims:", context.auth.token);
      return {
        status: "Authenticated!",
        uid: context.auth.uid,
        claims: context.auth.token,
      }; // Ensure no trailing spaces here
    } else {
      functions.logger.error("testAuthContext: Auth context IS NULL or UNDEFINED.");
      return {
        status: "Not authenticated. Auth context was null.",
      }; // Ensure no trailing spaces here
    }
  }); // Ensure no trailing spaces here

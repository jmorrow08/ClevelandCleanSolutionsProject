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

// In functions/index.js

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
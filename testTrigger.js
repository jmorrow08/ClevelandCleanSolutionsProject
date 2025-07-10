// testTrigger.js
const admin = require('firebase-admin');

// --- CONFIGURATION ---
// !! Replace with your ACTUAL Firebase project ID !!
const projectId = 'cleveland-clean-portal';
// Default Firestore Emulator port
const firestoreEmulatorHost = 'localhost:8080';
// ---------------------

// IMPORTANT: Point to the emulated Firestore
process.env.FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;

// Initialize admin app
try {
    // Check if already initialized (common in some setups)
    if (admin.apps.length === 0) {
        admin.initializeApp({ projectId: projectId });
        console.log(`Admin SDK initialized for Emulator (Project: ${projectId}).`);
    } else {
         console.log("Admin SDK appears to be already initialized.");
    }
} catch (e) {
     console.error("Error initializing Admin SDK:", e);
     process.exit(1); // Exit if SDK can't initialize
}

const db = admin.firestore();

async function triggerUpdate(historyDocId) {
    if (!historyDocId) {
        console.error("\nError: Please provide a serviceHistory document ID as an argument.");
        console.log("Usage: node testTrigger.js <documentIdToUpdate>\n");
        return;
    }

    const docRef = db.collection('serviceHistory').doc(historyDocId);

    try {
        console.log(`\nAttempting to update status to 'Completed' for document: ${historyDocId} in EMULATED Firestore...`);

        // Optional: Check if doc exists first in emulator
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
           console.error(`\nError: Document ${historyDocId} does not exist in the emulated Firestore.\nUse the Emulator UI (http://localhost:4000/firestore) to find a valid ID.`);
           return;
        }
        console.log(`Found document. Current status: ${docSnap.data()?.status}`);
         if (docSnap.data()?.status === 'Completed') {
            console.warn(`Warning: Document ${historyDocId} already has status 'Completed'. Function might not perform payroll logic.`);
        }


        // Perform the update that should trigger the function
        await docRef.update({
            status: 'Completed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`\nSuccessfully updated document ${historyDocId}.`);
        console.log(">>> Check the OTHER terminal window (where emulators are running) for function logs! <<<");
        console.log(">>> Check the Emulator UI Firestore (http://localhost:4000/firestore) for changes in employeePayroll. <<<\n");

    } catch (error) {
        console.error(`\nError updating document ${historyDocId}:`, error);
    }
}

// Get document ID from command line arguments (node testTrigger.js <docId>)
const docId = process.argv[2];
triggerUpdate(docId);
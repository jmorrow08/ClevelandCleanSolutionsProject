// public/js/admin-clients-locations.js
// Provided Full Rewrite - May 18, 2025
// At the VERY TOP of admin-clients-locations.js, before DOMContentLoaded
console.log("DEBUG ACL: admin-clients-locations.js script PARSED.");
console.log("DEBUG ACL: Initial check - window.dateFns:", typeof window.dateFns, "window.dateFnsTz:", typeof window.dateFnsTz);

document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG ACL: DOMContentLoaded event fired.");
    console.log("DEBUG ACL: Inside DOMContentLoaded - window.dateFns:", typeof window.dateFns, "window.dateFnsTz:", typeof window.dateFnsTz);

    // --- Get references to ALL elements specific to admin-clients-locations.html ---
    const clientListSection = document.getElementById('client-list-section');
    const showAddClientFormBtnPage = document.getElementById('show-add-client-form-button-page');
    const addClientFormSection = document.getElementById('add-client-form-section');
    const addClientForm = document.getElementById('add-client-form');
    const addClientMessageEl = document.getElementById('add-client-message');
    const cancelAddClientFormBtn = document.getElementById('cancel-add-client-form');

    const editClientFormSection = document.getElementById('edit-client-form-section');
    const editClientForm = document.getElementById('edit-client-form');
    const editClientMessageEl = document.getElementById('edit-client-message');
    const cancelEditClientFormBtn = document.getElementById('cancel-edit-client-form');
    const setClientPasswordBtn = document.getElementById('set-client-new-password-button');

    const clientLoadingEl = document.getElementById('client-loading-message');
    const clientTableEl = document.getElementById('client-table');
    let clientTableBodyEl = document.getElementById('client-table-body');
    const noClientsEl = document.getElementById('no-clients-message');

    const locationsManagementSection = document.getElementById('locations-management-section');
    const showAddLocationFormBtnPage = document.getElementById('show-add-location-form-button-page');
    const addEditLocationFormSection = document.getElementById('add-edit-location-form-section');
    const addEditLocationForm = document.getElementById('add-edit-location-form');
    const locationFormTitle = document.getElementById('location-form-title');
    const editLocationDocIdInput = document.getElementById('edit-location-doc-id');
    const locationClientSelect = document.getElementById('location-client-select');
    const locationNameInput = document.getElementById('location-name'); // Assuming 'location-name' is the ID for the input field for location's name
    const addEditLocationMessageEl = document.getElementById('add-edit-location-message');
    const cancelAddEditLocationFormBtn = document.getElementById('cancel-add-edit-location-form');

    const locationsLoadingEl = document.getElementById('locations-loading-message');
    const locationsTableEl = document.getElementById('locations-table');
    let locationsTableBodyEl = document.getElementById('locations-table-body');
    const noLocationsEl = document.getElementById('no-locations-message');

    const locationPhotosSection = document.getElementById('location-photos-section');
    const locationPhotosTitle = document.getElementById('location-photos-title');
    const locationPhotosContainer = document.getElementById('location-photos-container');
    const photosLoadingMessage = document.getElementById('photos-loading-message');
    const noLocationPhotosMessage = document.getElementById('no-location-photos-message');
    // Using one consistent variable name for this button
    const backToLocationsFromPhotosBtn = document.getElementById('back-to-locations-from-photos');

    const allPageSections = [
        clientListSection, locationsManagementSection,
        addClientFormSection, editClientFormSection,
        addEditLocationFormSection, locationPhotosSection
    ];

    console.log("DEBUG: Element references obtained for admin-clients-locations.html.");
    allPageSections.forEach((section, index) => {
        if (!section) {
            const sectionNames = [
                'clientListSection', 'locationsManagementSection',
                'addClientFormSection', 'editClientFormSection',
                'addEditLocationFormSection', 'locationPhotosSection'
            ];
            console.error(`CRITICAL: Page section element '${sectionNames[index] || `section at index ${index}`}' was not found. Check HTML ID.`);
        }
    });
    if (!backToLocationsFromPhotosBtn) {
        console.error("CRITICAL: Element 'backToLocationsFromPhotosBtn' (ID: back-to-locations-from-photos) not found. Check HTML ID.");
    }
    // Add checks for other critical buttons if needed, e.g.:
    if (!showAddClientFormBtnPage) console.error("CRITICAL: Element 'showAddClientFormBtnPage' not found.");
    if (!cancelAddClientFormBtn) console.error("CRITICAL: Element 'cancelAddClientFormBtn' not found.");
    // ... and so on for all buttons directly used in setupClientLocationPageListeners


    let currentUser = null;
    let db, auth, functions, storage;
    let serverTimestampFunction;

    const triggerUrlCreate = "https://us-central1-cleveland-clean-portal.cloudfunctions.net/createNewUser_v1";
    const triggerUrlDelete = "https://us-central1-cleveland-clean-portal.cloudfunctions.net/deleteAuthUser_v1";
    const triggerUrlUpdatePassword = "https://us-central1-cleveland-clean-portal.cloudfunctions.net/updateUserPassword_v1";

    // --- Helper Functions ---
    function redirectToLogin(message) {
        console.error("DEBUG ACL: redirectToLogin CALLED. Reason:", message);
        console.trace(); // Logs call stack
        if (window.location.pathname !== '/' && !window.location.pathname.endsWith('/index.html')) {
            try {
                console.log("DEBUG ACL: Attempting redirection to / (login page). Current path:", window.location.pathname);
                window.location.assign('/');
            } catch (e) {
                console.error("DEBUG ACL: Redirect to login page failed:", e);
            }
        } else {
            console.warn("DEBUG ACL: Already on login page or redirect suppressed. Current path:", window.location.pathname);
        }
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function showGeneralMessage(el, message, type = 'info') {
        if (el) {
            el.textContent = message;
            el.className = `form-message ${type}`; // Ensure 'form-message' is a base class if you have specific styles for 'info', 'error', 'success'
            el.style.display = message ? 'block' : 'none';
        }
        if (type === 'error') console.error("Message Displayed:", message);
        else console.log("Message Displayed (" + type + "):", message);
    }

    function setFormDisabled(form, disabled) {
        if (!form) return;
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => el.disabled = disabled);
    }

    function formatFirestoreTimestamp(timestamp, options) {
        if (!timestamp || typeof timestamp.toDate !== 'function') { return 'N/A'; }
        try {
            const date = timestamp.toDate();
            const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
            const effectiveOptions = { ...defaultOptions, ...options };
            return date.toLocaleDateString(undefined, effectiveOptions);
        } catch (e) { console.error("Error formatting timestamp:", e); return 'Date Err'; }
    }

    function handleRevealPasswordToggle(event) {
        const button = event.target.closest('.reveal-password-btn');
        if (!button) return;
        const targetInputId = button.getAttribute('data-target');
        if (!targetInputId) return;
        const passwordInput = document.getElementById(targetInputId);
        if (!passwordInput) return;
        const currentType = passwordInput.getAttribute('type');
        if (currentType === 'password') {
            passwordInput.setAttribute('type', 'text');
            button.textContent = '🔒'; // Or some other visual indicator
        } else {
            passwordInput.setAttribute('type', 'password');
            button.textContent = '👁️'; // Or some other visual indicator
        }
    }

    async function handleSetNewPassword(event) {
        const button = event.target; // Assuming this event is attached directly to the set password button
        if (!button || button.id !== 'set-client-new-password-button') { // Added null check for button
            console.warn("handleSetNewPassword called by unexpected event target or button ID incorrect.");
            return;
        }
        const passwordInputId = 'set-client-new-password-input';
        const messageElId = 'set-client-password-message';
        const targetAuthUidInput = document.getElementById('edit-client-auth-uid'); // Assumes this input holds the Auth UID of the client

        const targetUid = targetAuthUidInput ? targetAuthUidInput.value : null;
        const passwordInput = document.getElementById(passwordInputId);
        const messageEl = document.getElementById(messageElId);

        if (!passwordInput || !messageEl) { console.error("Error: Could not find password input or message element for client password reset."); alert("Interface error: password elements missing."); return; }
        if (!targetUid) { showGeneralMessage(messageEl, "Error: Target user Auth ID is missing from the form. Cannot set password.", 'error'); return; }

        const newPassword = passwordInput.value;
        if (!newPassword || newPassword.length < 6) { showGeneralMessage(messageEl, "Error: New password must be at least 6 characters long.", 'error'); return; }
        if (!auth.currentUser) { showGeneralMessage(messageEl, "Error: Admin session may have expired. Please refresh and try again.", 'error'); return; }

        button.disabled = true;
        passwordInput.disabled = true;
        showGeneralMessage(messageEl, "Updating password...", 'info');
        try {
            const idToken = await auth.currentUser.getIdToken(true);
            const payload = { targetUid: targetUid, newPassword: newPassword };
            const response = await fetch(triggerUrlUpdatePassword, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` }, body: JSON.stringify(payload) });
            const resultData = await response.json();

            if (!response.ok) { throw new Error(resultData.error || `Server error: ${response.status}.`); }
            if (resultData && resultData.success) {
                showGeneralMessage(messageEl, resultData.message || "Password updated successfully!", 'success');
                passwordInput.value = ''; // Clear password field
            } else {
                throw new Error(resultData.error || "Password update function reported failure.");
            }
        } catch (error) {
            console.error(`Error calling updateUserPassword_v1 for UID ${targetUid}:`, error);
            showGeneralMessage(messageEl, `Error updating password: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            passwordInput.disabled = false;
        }
    }

    // --- Section Visibility Management for this page ---
    function showPageSection(sectionElementToShow) {
        console.log("DEBUG: showPageSection attempting to show element:", sectionElementToShow ? sectionElementToShow.id : 'default (lists)');
        let sectionShown = false;
        allPageSections.forEach(section => {
            if (section) {
                if (section === sectionElementToShow) {
                    section.style.display = 'block';
                    sectionShown = true;
                } else {
                    section.style.display = 'none';
                }
            }
        });

        if (sectionShown) {
            console.log("DEBUG: Successfully shown section:", sectionElementToShow.id);
        } else {
            // Default view: show both client and location lists
            if(clientListSection) clientListSection.style.display = 'block';
            if(locationsManagementSection) locationsManagementSection.style.display = 'block';
            console.log("DEBUG: showPageSection - No specific target or target not in allPageSections. Showing default list sections (clients and locations).");
        }
    }

    // --- Firebase Initialization ---
    if (typeof firebase === 'undefined' || !firebase.app || !firebase.auth || !firebase.firestore || !firebase.functions || !firebase.storage) {
        console.error("CRITICAL ERROR: Firebase SDKs not loaded correctly on admin-clients-locations.html.");
        const bodyContent = document.body; // Simplified to use document.body
        bodyContent.innerHTML = "<p style='color:red; text-align:center; font-size:1.2em;'>Critical Error: Essential Firebase services could not load. Please contact support immediately.</p>";
        return; // Stop script execution
    }
    try {
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions();
        storage = firebase.storage();
        serverTimestampFunction = firebase.firestore.FieldValue.serverTimestamp;
        console.log("DEBUG: Firebase services initialized for admin-clients-locations.js.");
    } catch (error) {
        console.error("DEBUG: Error initializing Firebase services in admin-clients-locations.js:", error);
        document.body.innerHTML = "<p style='color:red; text-align:center; font-size:1.2em;'>Error initializing Firebase services. The page may not function correctly. Please contact support.</p>";
        return; // Stop script execution
    }

    // --- Client Management Functions ---
    function fetchAndDisplayClients() {
        console.log("DEBUG: Fetching client list...");
        if(!db) { console.error("DB not initialized for fetchClients"); return; }
        if(clientLoadingEl) clientLoadingEl.style.display = 'block';
        if(clientTableEl) clientTableEl.style.display = 'none';
        if(noClientsEl) noClientsEl.style.display = 'none';

        db.collection('clientMasterList').orderBy('companyName', 'asc').get()
            .then(snapshot => {
                if(clientLoadingEl) clientLoadingEl.style.display='none';
                if(snapshot.empty){
                    if(noClientsEl) noClientsEl.style.display='block';
                    if(clientTableBodyEl) clientTableBodyEl.innerHTML = '';
                } else {
                    let clientHtml = '';
                    snapshot.forEach(doc => {
                        const client = doc.data();
                        const uid = doc.id;
                        const companyName = client.companyName || 'N/A';
                        const contactName = client.contactName || 'N/A';
                        const email = client.email || 'N/A';
                        const phone = client.phone || 'N/A';
                        const displayId = client.clientIdString || uid.substring(0, 8) + '...';
                        const status = typeof client.status === 'boolean' ? (client.status ? 'Active' : 'Inactive') : 'N/A';
                        clientHtml += `<tr>
                            <td>${escapeHtml(companyName)}</td>
                            <td>${escapeHtml(contactName)}</td>
                            <td>${escapeHtml(email)}</td>
                            <td>${escapeHtml(phone)}</td>
                            <td>${escapeHtml(displayId)}</td>
                            <td>${escapeHtml(status)}</td>
                            <td>
                                <button class="edit-button edit-client-button" data-uid="${uid}">Edit</button>
                                <button class="delete-button delete-user-button" data-profile-id="${uid}" data-name="${escapeHtml(companyName)}" data-role="client">Delete</button>
                            </td>
                        </tr>`;
                    });
                    if(noClientsEl) noClientsEl.style.display='none';
                    if(clientTableBodyEl) clientTableBodyEl.innerHTML = clientHtml;
                    if(clientTableEl) clientTableEl.style.display = 'table';
                }
            })
            .catch(error => {
                console.error("DEBUG: Error fetching clients:", error);
                if(clientLoadingEl){clientLoadingEl.textContent='Error loading clients.'; clientLoadingEl.classList.add('error-message');} // Added a class for styling errors
            });
    }

    async function handleAddClientSubmit(e) {
        e.preventDefault();
        if (!auth.currentUser) { showGeneralMessage(addClientMessageEl, 'Error: No authenticated admin user found. Please re-login.', 'error'); return; }
        setFormDisabled(addClientForm,true);
        showGeneralMessage(addClientMessageEl,'Creating client login and profile...','info');

        const companyName = document.getElementById('client-company-name').value.trim();
        const contactName = document.getElementById('client-contact-name').value.trim();
        const clientIdString = document.getElementById('client-id-string').value.trim();
        const email = document.getElementById('client-email').value.trim();
        const phone = document.getElementById('client-phone').value.trim();
        const password = document.getElementById('client-initial-password').value;

        if (!clientIdString || !companyName || !contactName || !email || !password) {
            showGeneralMessage(addClientMessageEl, 'Client ID String, Company, Contact Name, Email, and Initial Password are required.', 'error');
            setFormDisabled(addClientForm, false);
            return;
        }
        if (password.length < 6) {
            showGeneralMessage(addClientMessageEl, 'Password must be at least 6 characters.', 'error');
            setFormDisabled(addClientForm, false);
            return;
        }

        const userData = {
            email: email,
            password: password,
            role: 'client', // Hardcoded role for client creation
            clientIdString: clientIdString,
            companyName: companyName,
            contactName: contactName,
            phone: phone
        };

        try {
            const idToken = await auth.currentUser.getIdToken(true);
            console.log(`DEBUG: Calling createNewUser_v1 Cloud Function for client: ${email}`);
            const response = await fetch(triggerUrlCreate, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
                body: JSON.stringify(userData)
            });
            const resultData = await response.json();

            if (!response.ok) {
                console.error(`DEBUG: createNewUser_v1 failed. Status: ${response.status}`, resultData);
                let specificError = resultData.error?.message || resultData.message || `HTTP error! status: ${response.status}.`;
                if (resultData.error?.code === 'already-exists' || resultData.error?.code === 'functions/already-exists') { // Check for Firebase Functions specific error code
                     specificError = `Error: ${specificError}`;
                }
                showGeneralMessage(addClientMessageEl, specificError, 'error');
            } else if (resultData && resultData.success) {
                console.log(`DEBUG: Client created successfully via Cloud Function:`, resultData);
                showGeneralMessage(addClientMessageEl, resultData.message || `Client ${contactName} created successfully!`, 'success');
                addClientForm.reset();
                fetchAndDisplayClients(); // Refresh client list
                setTimeout(() => {
                    showPageSection(null); // Go back to lists view
                    showGeneralMessage(addClientMessageEl, '', 'info'); // Clear message
                }, 2000);
            } else {
                throw new Error(resultData.message || "Cloud Function call for client creation reported an unspecified failure.");
            }
        } catch (error) {
            console.error("DEBUG: Error during client creation process:", error);
            // Avoid overwriting a more specific error message if already set
            if (!addClientMessageEl.textContent.toLowerCase().includes('error')) {
                 showGeneralMessage(addClientMessageEl, `Error creating client: ${error.message}`, 'error');
            }
        } finally {
            setFormDisabled(addClientForm, false);
        }
    }

    async function handleEditClientClick(profileUid) {
        console.log(`DEBUG: handleEditClientClick for Profile UID: ${profileUid}`);
        showGeneralMessage(editClientMessageEl, 'Loading client data...', 'info');
        const authUidInput = document.getElementById('edit-client-auth-uid');
        if (authUidInput) authUidInput.value = ''; // Clear previous Auth UID

        try {
            const docRef = db.collection('clientMasterList').doc(profileUid);
            const doc = await docRef.get();

            if (doc.exists) {
                const clientData = doc.data();
                document.getElementById('edit-client-uid').value = profileUid; // Store profile UID for submission
                document.getElementById('edit-client-company-name').value = clientData.companyName || '';
                document.getElementById('edit-client-contact-name').value = clientData.contactName || '';
                document.getElementById('edit-client-email').value = clientData.email || ''; // Email might be non-editable in some systems, but display it
                document.getElementById('edit-client-phone').value = clientData.phone || '';
                document.getElementById('edit-client-id-string').value = clientData.clientIdString || 'N/A';

                const statusSelect = document.getElementById('edit-client-status');
                statusSelect.value = typeof clientData.status === 'boolean' ? clientData.status.toString() : 'true'; // Default to active if not set

                // Attempt to find associated Auth UID from 'users' collection
                console.log(`DEBUG: Querying 'users' collection for profileId: ${profileUid}`);
                const usersQuery = db.collection('users').where('profileId', '==', profileUid).limit(1);
                const userSnapshot = await usersQuery.get();
                const setPassBtn = document.getElementById('set-client-new-password-button');

                if (!userSnapshot.empty) {
                    const authUid = userSnapshot.docs[0].id;
                    console.log(`DEBUG: Found Auth UID: ${authUid} for profile ID: ${profileUid}`);
                    if (authUidInput) authUidInput.value = authUid;
                    if(setPassBtn) setPassBtn.disabled = false;
                } else {
                    console.warn(`DEBUG: No user document found in /users for profileId ${profileUid}. Password reset will be disabled.`);
                    showGeneralMessage(editClientMessageEl, 'Warning: Associated login account not found. Password reset is disabled.', 'error');
                    if(setPassBtn) setPassBtn.disabled = true;
                }
                showGeneralMessage(editClientMessageEl, '', 'info'); // Clear loading message
                showPageSection(editClientFormSection);
            } else {
                console.error("Error: Client data not found for UID:", profileUid);
                alert("Error: Client data not found.");
                showGeneralMessage(editClientMessageEl, `Error: Client profile with ID ${profileUid} not found.`, 'error');
            }
        } catch (error) {
            console.error("Error fetching client data or associated Auth UID:", error);
            alert("Error fetching client data. Please check the console.");
            showGeneralMessage(editClientMessageEl, `Error fetching data: ${error.message}`, 'error');
            const setPassBtn = document.getElementById('set-client-new-password-button');
            if(setPassBtn) setPassBtn.disabled = true; // Disable password reset on error
        }
    }

    async function handleEditClientSubmit(e) {
        e.preventDefault();
        if (!db || !serverTimestampFunction) { showGeneralMessage(editClientMessageEl, 'Database connection not ready. Please try again.', 'error'); return; }
        setFormDisabled(editClientForm,true);
        showGeneralMessage(editClientMessageEl,'Saving client updates...','info');

        const profileUid = document.getElementById('edit-client-uid').value;
        if(!profileUid){
            showGeneralMessage(editClientMessageEl,'Error: Missing client profile UID. Cannot save.', 'error');
            setFormDisabled(editClientForm,false);
            return;
        }

        const updatedData = {
            companyName: document.getElementById('edit-client-company-name').value.trim(),
            contactName: document.getElementById('edit-client-contact-name').value.trim(),
            phone: document.getElementById('edit-client-phone').value.trim(),
            status: document.getElementById('edit-client-status').value === 'true', // Convert string 'true'/'false' to boolean
            // clientIdString and email are typically not updated here to prevent desync with Auth or other systems
            updatedAt: serverTimestampFunction()
        };

        console.log("DEBUG: Updating client profile (ID:", profileUid, ") with data:", updatedData);
        db.collection('clientMasterList').doc(profileUid).update(updatedData)
            .then(()=>{
                showGeneralMessage(editClientMessageEl,'Client updated successfully!','success');
                fetchAndDisplayClients(); // Refresh list
                setTimeout(()=>{
                    showPageSection(null);
                    showGeneralMessage(editClientMessageEl,'','info'); // Clear message
                },1500);
            })
            .catch(err=>{
                console.error("DEBUG: Error updating client profile:", err);
                showGeneralMessage(editClientMessageEl,`Error updating client: ${err.message}`,'error');
            })
            .finally(()=>{
                setFormDisabled(editClientForm,false);
            });
    }

    async function handleDeleteUserClick(button, profileIdToDelete, name, role) {
        if (role !== 'client') {
            console.warn("handleDeleteUserClick called with non-client role from client/location page, which is unexpected here.");
            return;
        }
        if (!profileIdToDelete) {
            console.error("Delete failed: Missing Profile ID.");
            alert("Cannot delete user: Profile ID is missing from button data.");
            return;
        }
        if (!confirm(`ARE YOU SURE you want to permanently delete ${name || 'this client'} (Profile ID: ${profileIdToDelete})? This action is irreversible and will delete the user's login account and associated profile data.`)) {
            return;
        }
        if (!auth.currentUser) {
            alert("Error: Admin session seems to have expired. Please refresh the page and log in again.");
            console.error("DEBUG: Delete cancelled, auth.currentUser is null.");
            return;
        }

        button.disabled = true;
        button.textContent = 'Deleting...';
        console.log(`DEBUG: Starting delete process for client profile ID: ${profileIdToDelete}`);

        let authUidToDelete = null;
        try {
            console.log(`DEBUG: Querying 'users' collection for profileId: ${profileIdToDelete} to find Auth UID.`);
            if (!db) { throw new Error("Firestore database is not initialized. Cannot proceed with deletion."); }

            const usersQuery = db.collection('users').where('profileId', '==', profileIdToDelete).limit(1);
            const userSnapshot = await usersQuery.get();

            if (userSnapshot.empty) {
                // If no auth user, maybe just delete the profile? Or warn and abort?
                // For now, let's assume an Auth user should exist.
                throw new Error(`Could not find associated login account (Auth UID) for profile ${name} (ID: ${profileIdToDelete}). Deletion aborted. You might need to manually check Firestore 'users' collection.`);
            }
            authUidToDelete = userSnapshot.docs[0].id;
            console.log(`DEBUG: Found Auth UID: ${authUidToDelete} for profile ID: ${profileIdToDelete}`);

            const idToken = await auth.currentUser.getIdToken(true);
            const deleteData = { uidToDelete: authUidToDelete }; // Data for the Cloud Function

            console.log(`DEBUG: Calling deleteAuthUser_v1 Cloud Function for Auth UID: ${authUidToDelete}`);
            const response = await fetch(triggerUrlDelete, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
                body: JSON.stringify(deleteData)
            });
            const resultData = await response.json();

            if (!response.ok) {
                console.error(`DEBUG: deleteAuthUser_v1 Cloud Function failed. Status: ${response.status}`, resultData);
                throw new Error(resultData.error?.message || `Cloud Function for user deletion returned HTTP status ${response.status}.`);
            }

            if (resultData && resultData.success) {
                console.log(`DEBUG: Successfully deleted user (Auth UID: ${authUidToDelete}, Profile ID: ${profileIdToDelete}) via Cloud Function.`);
                // Note: The Cloud Function should handle deleting the profile from clientMasterList as well.
                // If not, you'd delete it here: await db.collection('clientMasterList').doc(profileIdToDelete).delete();
                alert(resultData.message || `${name} deleted successfully.`);
                fetchAndDisplayClients(); // Refresh the client list
                showPageSection(null); // Go back to default view
            } else {
                throw new Error(resultData.message || "Delete user Cloud Function call reported failure but did not throw an HTTP error.");
            }
        } catch (error) {
            console.error(`DEBUG: Error during client deletion (Profile ID ${profileIdToDelete}):`, error);
            alert(`Error deleting ${name}: ${error.message}. Please check the console for more details.`);
            if (button && button.isConnected) { // Check if button is still in DOM
                button.disabled = false;
                button.textContent = 'Delete';
            }
        }
    }

    // --- Location Management Functions ---
    function fetchAndDisplayAllLocations() {
        console.log("DEBUG: Fetching locations list...");
        if(!db) { console.error("DB not initialized for fetchLocations"); return; }
        if(locationsLoadingEl) locationsLoadingEl.style.display = 'block';
        if(locationsTableEl) locationsTableEl.style.display = 'none';
        if(noLocationsEl) noLocationsEl.style.display = 'none';

        db.collection('locations').orderBy('locationName', 'asc').get()
            .then(snapshot => {
                if(locationsLoadingEl) locationsLoadingEl.style.display='none';
                if(snapshot.empty){
                    if(noLocationsEl) noLocationsEl.style.display='block';
                    if(locationsTableBodyEl) locationsTableBodyEl.innerHTML = '';
                } else {
                    let locationsHtml = '';
                    snapshot.forEach(doc => {
                        const loc = doc.data();
                        const locId = doc.id;
                        const locationIdString = loc.locationIdString || 'N/A';
                        const locationName = loc.locationName || 'N/A';
                        const clientName = loc.clientName || 'Associated Client N/A'; // Fallback for clientName
                        const address = loc.address ? `${loc.address.street || ''}, ${loc.address.city || ''}` : 'N/A';
                        const status = typeof loc.status === 'boolean' ? (loc.status ? 'Active' : 'Inactive') : 'N/A';
                        locationsHtml += `<tr>
                            <td>${escapeHtml(locationIdString)}</td>
                            <td>${escapeHtml(locationName)}</td>
                            <td>${escapeHtml(clientName)}</td>
                            <td>${escapeHtml(address)}</td>
                            <td>${escapeHtml(status)}</td>
                            <td>
                                <button class="action-button view-photos-button" data-location-id="${locId}" data-location-name="${escapeHtml(locationName)}">View Photos</button>
                            </td>
                            <td>
                                <button class="edit-button edit-location-button" data-location-id="${locId}">Edit</button>
                                <button class="delete-button delete-location-button" data-location-id="${locId}" data-name="${escapeHtml(locationName)}">Delete</button>
                            </td>
                        </tr>`;
                    });
                    if(noLocationsEl) noLocationsEl.style.display='none';
                    if(locationsTableBodyEl) locationsTableBodyEl.innerHTML = locationsHtml;
                    if(locationsTableEl) locationsTableEl.style.display = 'table';
                }
            })
            .catch(error => {
                console.error("DEBUG: Error fetching locations:", error);
                if(locationsLoadingEl){locationsLoadingEl.textContent='Error loading locations.'; locationsLoadingEl.classList.add('error-message');}
            });
    }

    async function populateClientDropdownForLocation(selectElementId = 'location-client-select') { // Added default ID
        const selectEl = document.getElementById(selectElementId);
        if (!selectEl || !db) {
            console.error("Cannot populate client dropdown - Element or DB missing. Element ID:", selectElementId);
            if (selectEl) selectEl.innerHTML = '<option value="">Error loading clients</option>';
            return;
        }
        selectEl.disabled = true;
        selectEl.innerHTML = '<option value="">-- Loading Active Clients --</option>';
        try {
            const snapshot = await db.collection('clientMasterList')
                                     .where('status', '==', true) // Only load active clients
                                     .orderBy('companyName', 'asc')
                                     .get();
            let optionsHtml = '<option value="">-- Select Client --</option>';
            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    const client = doc.data();
                    optionsHtml += `<option value="${doc.id}">${escapeHtml(client.companyName)} (ID: ${client.clientIdString || doc.id.substring(0,6)})</option>`;
                });
            } else {
                optionsHtml = '<option value="">-- No Active Clients Found --</option>';
            }
            selectEl.innerHTML = optionsHtml;
        } catch (error) {
            console.error("Error fetching active clients for dropdown:", error);
            selectEl.innerHTML = '<option value="">Error loading clients list</option>';
            showGeneralMessage(addEditLocationMessageEl, 'Failed to load client list for dropdown.', 'error');
        } finally {
            selectEl.disabled = false;
        }
    }

// In public/js/admin-clients-locations.js

// REPLACE your existing handleSaveLocationSubmit function with this:
async function handleSaveLocationSubmit(e) {
    e.preventDefault();
    if (!db || !serverTimestampFunction || !currentUser) {
        showGeneralMessage(addEditLocationMessageEl, 'Error: System not ready or user not logged in. Please refresh.', 'error');
        return;
    }
    setFormDisabled(addEditLocationForm, true);

    const editDocId = document.getElementById('edit-location-doc-id').value;
    const modeText = editDocId ? "Updating" : "Adding new";
    showGeneralMessage(addEditLocationMessageEl, `${modeText} location...`, 'info');

    const clientId = document.getElementById('location-client-select').value;
    const selectedClientOption = document.getElementById('location-client-select').options[document.getElementById('location-client-select').selectedIndex];
    const clientName = selectedClientOption ? selectedClientOption.textContent.split('(')[0].trim() : 'Unknown Client';

    const locationNameVal = document.getElementById('location-name').value.trim();
    const locationIdString = document.getElementById('location-id-string').value.trim();
    const street = document.getElementById('location-address-street').value.trim();
    const city = document.getElementById('location-address-city').value.trim();
    const state = document.getElementById('location-address-state').value.trim();
    const zip = document.getElementById('location-address-zip').value.trim();
    const contactName = document.getElementById('location-contact-name').value.trim();
    const contactPhone = document.getElementById('location-contact-phone').value.trim();
    const status = document.getElementById('location-status').value === 'true';
    const serviceFrequency = document.getElementById('location-service-frequency').value || null;
    
    const nextServiceDateStr = document.getElementById('location-next-service-date').value; // YYYY-MM-DD
    const nextServiceTimeStr = document.getElementById('edit-location-nextServiceTime').value; // Now using time field

    const lastServiceDateStr = document.getElementById('location-last-service-date').value;

    let serviceDaysArray = null;
    if (serviceFrequency === 'CustomWeekly') {
        serviceDaysArray = [];
        const dayCheckboxes = document.querySelectorAll('#location-service-days-group input[name="serviceDay"]:checked');
        dayCheckboxes.forEach(cb => { serviceDaysArray.push(parseInt(cb.value)); });
        serviceDaysArray.sort((a, b) => a - b); 
        if (serviceDaysArray.length === 0) serviceDaysArray = null; 
    }

    if ((!editDocId && !clientId) || !locationNameVal || !locationIdString || !street || !city || !state || !zip) {
        showGeneralMessage(addEditLocationMessageEl, 'Client (for new locations), Location Name, Location ID, and Full Address are required fields.', 'error');
        setFormDisabled(addEditLocationForm, false);
        return;
    }

    // Convert date-only strings to timestamps (for last service date - read-only)
    const convertDateToTimestamp = (dateStr) => {
        if (!dateStr) return null;
        try {
            const dateParts = dateStr.split('-'); // Expects YYYY-MM-DD
            if (dateParts.length === 3) {
                // For date-only fields, store as local midnight to avoid timezone confusion
                const localDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                if (!isNaN(localDate)) {
                    return firebase.firestore.Timestamp.fromDate(localDate);
                }
            }
            console.warn("Invalid date string format for timestamp conversion:", dateStr);
            return null;
        } catch (e) {
            console.error("Error converting date string to Firestore Timestamp:", e);
            return null;
        }
    };

    // Convert date + time to timestamp with proper timezone handling (for next service date/time)
    const convertDateTimeToTimestamp = (dateStr, timeStr) => {
        if (!dateStr) return null;
        try {
            const dateParts = dateStr.split('-'); // Expects YYYY-MM-DD
            if (dateParts.length === 3) {
                let hours = 9; // Default to 9 AM if no time specified
                let minutes = 0;
                
                if (timeStr && timeStr.trim()) {
                    const timeParts = timeStr.split(':');
                    if (timeParts.length >= 2) {
                        hours = parseInt(timeParts[0]);
                        minutes = parseInt(timeParts[1]);
                    }
                }
                
                // Create date in local timezone (Cleveland/Eastern Time)
                const localDateTime = new Date(
                    parseInt(dateParts[0]), 
                    parseInt(dateParts[1]) - 1, 
                    parseInt(dateParts[2]), 
                    hours, 
                    minutes
                );
                
                if (!isNaN(localDateTime)) {
                    console.log(`DEBUG ACL: Next service time created: ${localDateTime.toLocaleString()} (Local: ${localDateTime.toLocaleDateString()} ${localDateTime.toLocaleTimeString()})`);
                    return firebase.firestore.Timestamp.fromDate(localDateTime);
                }
            }
            console.warn("Invalid date/time format for timestamp conversion:", dateStr, timeStr);
            return null;
        } catch (e) {
            console.error("Error converting date/time to Firestore Timestamp:", e);
            return null;
        }
    };

    const nextServiceDateTimestamp = convertDateTimeToTimestamp(nextServiceDateStr, nextServiceTimeStr);
    const lastServiceDateTimestamp = convertDateToTimestamp(lastServiceDateStr);

    const locationData = {
        locationName: locationNameVal,
        locationIdString: locationIdString,
        address: { street: street, city: city, state: state, zip: zip },
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        status: status,
        updatedAt: serverTimestampFunction(), // Uses your global serverTimestampFunction
        serviceFrequency: serviceFrequency,
        serviceDays: serviceDaysArray,
        nextServiceDate: nextServiceDateTimestamp, // Uses the converted date-only timestamp
        lastServiceDate: lastServiceDateTimestamp,
    };

    let savePromise;
    if (editDocId) {
        console.log(`DEBUG ACL: Updating location (Doc ID: ${editDocId}) with data:`, locationData);
        savePromise = db.collection('locations').doc(editDocId).update(locationData);
    } else {
        locationData.clientProfileId = clientId;
        locationData.clientName = clientName;
        locationData.createdAt = serverTimestampFunction();
        console.log("DEBUG ACL: Adding new location with data:", locationData);
        savePromise = db.collection('locations').add(locationData);
    }

    savePromise.then(() => {
        const successMessage = editDocId ? 'Location updated successfully!' : 'New location added successfully!';
        console.log(`DEBUG ACL: ${successMessage}`); // Keep your existing logs
        showGeneralMessage(addEditLocationMessageEl, successMessage, 'success');
        if(addEditLocationForm) addEditLocationForm.reset();
        document.getElementById('edit-location-doc-id').value = ''; 
        document.getElementById('location-form-title').textContent = "Add New Location"; 
        document.getElementById('save-location-button').textContent = "Save Location"; 
        fetchAndDisplayAllLocations(); 
        setTimeout(() => {
            showPageSection(null); 
            showGeneralMessage(addEditLocationMessageEl, '', 'info'); 
        }, 1500);
    }).catch(err => {
        console.error("DEBUG ACL: Error saving location:", err);
        // Keep your existing detailed error handling
        let userMessage = `Error saving location: ${err.message}`;
        if (err.code === 'permission-denied') {
            userMessage = "Error saving location: You do not have permission for this operation.";
        } else if (err.code === 'invalid-argument') {
            userMessage = `Error: Invalid data format submitted. Please check input fields. (${err.message})`;
        } else if (err.message && err.message.includes("No document to update")) {
            userMessage = `Error: Could not find the location to update. It may have been deleted.`;
        }
        showGeneralMessage(addEditLocationMessageEl, userMessage, 'error');
    }).finally(() => {
        setFormDisabled(addEditLocationForm, false);
    });
}

// REPLACE your existing handleEditLocationClick function with this:
async function handleEditLocationClick(locationId) {
    console.log(`DEBUG ACL: handleEditLocationClick for Location ID: ${locationId}`); // Keep your existing logs
    showGeneralMessage(addEditLocationMessageEl, 'Loading location data...', 'info');
    if(addEditLocationForm) addEditLocationForm.reset(); 
    document.getElementById('edit-location-doc-id').value = ''; 

    const daysGroup = document.getElementById('location-service-days-group');
    if (daysGroup) daysGroup.style.display = 'none';
    const dayCheckboxes = daysGroup ? daysGroup.querySelectorAll('input[name="serviceDay"]') : [];
    dayCheckboxes.forEach(cb => cb.checked = false);

    if (!db) { console.error("DB not ready for editing location"); showGeneralMessage(addEditLocationMessageEl, 'Database connection error.', 'error'); return; }

    try {
        const docRef = db.collection('locations').doc(locationId);
        const doc = await docRef.get();

        if (doc.exists) {
            const locData = doc.data();
            console.log("DEBUG ACL: Location data fetched for edit:", locData); // Keep your existing logs

            document.getElementById('edit-location-doc-id').value = locationId;
            if(locationNameInput) locationNameInput.value = locData.locationName || '';
            document.getElementById('location-id-string').value = locData.locationIdString || '';
            document.getElementById('location-address-street').value = locData.address?.street || '';
            document.getElementById('location-address-city').value = locData.address?.city || '';
            document.getElementById('location-address-state').value = locData.address?.state || '';
            document.getElementById('location-address-zip').value = locData.address?.zip || '';
            document.getElementById('location-contact-name').value = locData.contactName || '';
            document.getElementById('location-contact-phone').value = locData.contactPhone || '';
            document.getElementById('location-status').value = typeof locData.status === 'boolean' ? locData.status.toString() : 'true';

            await populateClientDropdownForLocation('location-client-select'); 
            if(locationClientSelect) locationClientSelect.value = locData.clientProfileId || ''; 

            const freqSelect = document.getElementById('location-service-frequency');
            if (freqSelect) freqSelect.value = locData.serviceFrequency || ''; 

            if (locData.serviceFrequency === 'CustomWeekly') {
                if (daysGroup) daysGroup.style.display = 'block';
                const savedDays = locData.serviceDays || [];
                dayCheckboxes.forEach(cb => {
                    cb.checked = savedDays.includes(parseInt(cb.value));
                });
            } else {
                if (daysGroup) daysGroup.style.display = 'none';
            }

            // Format timestamp for date input (date-only fields like last service)
            const formatTimestampForDateInput = (timestamp) => {
                if (timestamp && typeof timestamp.toDate === 'function') {
                    try {
                        const dateObj = timestamp.toDate(); 
                        // Use local time for date display to match how it was stored
                        const year = dateObj.getFullYear();
                        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                        const day = dateObj.getDate().toString().padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    } catch (e) { console.error("Error formatting timestamp for date input:", e); return ''; }
                }
                return '';
            };
            
            // Format timestamp for date and time inputs (next service date/time)
            const formatTimestampForDateTimeInputs = (timestamp) => {
                if (timestamp && typeof timestamp.toDate === 'function') {
                    try {
                        const dateObj = timestamp.toDate();
                        const year = dateObj.getFullYear();
                        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                        const day = dateObj.getDate().toString().padStart(2, '0');
                        const hours = dateObj.getHours().toString().padStart(2, '0');
                        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
                        return {
                            date: `${year}-${month}-${day}`,
                            time: `${hours}:${minutes}`
                        };
                    } catch (e) { console.error("Error formatting timestamp for date/time inputs:", e); return { date: '', time: '' }; }
                }
                return { date: '', time: '' };
            };
            
            // Set next service date and time
            const nextServiceDateTime = formatTimestampForDateTimeInputs(locData.nextServiceDate);
            document.getElementById('location-next-service-date').value = nextServiceDateTime.date;
            
            const nextServiceTimeInput = document.getElementById('edit-location-nextServiceTime');
            if (nextServiceTimeInput) {
                nextServiceTimeInput.value = nextServiceDateTime.time;
                console.log(`DEBUG ACL: Set next service time to: ${nextServiceDateTime.time} for date: ${nextServiceDateTime.date}`);
            }
            
            document.getElementById('location-last-service-date').value = formatTimestampForDateInput(locData.lastServiceDate); // Assuming this uses same format

            if(locationFormTitle) locationFormTitle.textContent = "Edit Location Details";
            const saveLocBtn = document.getElementById('save-location-button');
            if(saveLocBtn) saveLocBtn.textContent = "Update Location";

            showGeneralMessage(addEditLocationMessageEl, '', 'info'); 
            showPageSection(addEditLocationFormSection); 
        } else {
            console.error("Error: Location document not found for ID:", locationId);
            alert("Error: Location data not found. It may have been deleted.");
            showGeneralMessage(addEditLocationMessageEl, `Error: Location profile with ID ${locationId} not found.`, 'error');
        }
    } catch (error) {
        console.error("Error fetching location for edit:", error);
        alert("Error fetching location data. Please check the console.");
        showGeneralMessage(addEditLocationMessageEl, `Error fetching location: ${error.message}`, 'error');
    }
}

    async function handleDeleteLocationClick(button, locationId, locationName) {
        if (!locationId) {
            console.error("Delete location failed: Missing Location ID from button data.");
            alert("Cannot delete location: ID is missing.");
            return;
        }
        if (!confirm(`ARE YOU SURE you want to permanently delete location: ${locationName || 'this location'} (ID: ${locationId})? This action cannot be undone.`)) {
            return;
        }
        if (!db || !currentUser) {
            alert("Error: System not ready or user not logged in. Please refresh.");
            console.error("DEBUG: Delete location cancelled, DB or currentUser is null.");
            return;
        }

        button.disabled = true;
        button.textContent = 'Deleting...';
        console.log(`DEBUG: Starting delete for Location ID: ${locationId}`);
        try {
            // Consider if there are related documents to delete (e.g., service history, photos for this location)
            // This would require more complex logic, possibly a Cloud Function for cascading deletes.
            await db.collection('locations').doc(locationId).delete();
            console.log(`DEBUG: Successfully deleted location document ${locationId}`);
            alert(`Location "${locationName || locationId}" deleted successfully.`);
            fetchAndDisplayAllLocations(); // Refresh list
            showPageSection(null); // Go back to default view
        } catch (error) {
            console.error(`DEBUG: Error deleting location ${locationId}:`, error);
            alert(`Error deleting location "${locationName || locationId}": ${error.message}. Check console.`);
            if (button && button.isConnected) {
                button.disabled = false;
                button.textContent = 'Delete';
            }
        }
    }

    async function fetchAndDisplayPhotosForLocation(locationId, locationName) {
        console.log(`Workspaceing photos for location: ${locationId} (Name: ${locationName})`);
        if (!db || !storage) { console.error("Firestore DB or Storage not initialized."); alert("Error: Database/Storage connection lost."); return; }
        if (!locationPhotosContainer || !photosLoadingMessage || !noLocationPhotosMessage || !locationPhotosTitle) {
            console.error("Required photo display elements not found (container, loading, noPhotosMsg, title).");
            alert("Error: UI elements for photo display are missing. Cannot show photos.");
            return;
        }

        locationPhotosTitle.textContent = `Photos for: ${escapeHtml(locationName)}`;
        locationPhotosContainer.innerHTML = ''; // Clear previous photos
        photosLoadingMessage.style.display = 'block';
        noLocationPhotosMessage.style.display = 'none';

        showPageSection(locationPhotosSection); // Show the photos section

        try {
            const snapshot = await db.collection('servicePhotos')
                                     .where('locationId', '==', locationId)
                                     .orderBy('uploadedAt', 'desc') // Newest first
                                     .limit(50) // Limit for performance
                                     .get();

            photosLoadingMessage.style.display = 'none';
            if (snapshot.empty) {
                console.log("No photos found for this location in 'servicePhotos' collection.");
                noLocationPhotosMessage.style.display = 'block';
            } else {
                console.log(`Found ${snapshot.size} photos for location ${locationId}.`);
                snapshot.forEach(doc => {
                    const photoData = doc.data();
                    const photoDiv = document.createElement('div');
                    photoDiv.className = 'photo-item'; // For styling

                    const img = document.createElement('img');
                    img.src = photoData.photoUrl; // Make sure photoUrl is valid and accessible
                    const uploadDateStr = formatFirestoreTimestamp(photoData.uploadedAt);
                    img.alt = `Photo for ${escapeHtml(locationName)}, uploaded by ${photoData.employeeName || 'Unknown Employee'} on ${uploadDateStr}`;
                    img.loading = 'lazy'; // Lazy load images
                    img.style.maxWidth = '200px'; img.style.maxHeight = '200px'; img.style.objectFit = 'cover'; // Basic styling
                    img.addEventListener('click', () => {
                        if (photoData.photoUrl) { window.open(photoData.photoUrl, '_blank'); } // Open full image in new tab
                    });
                    photoDiv.appendChild(img);

                    const datePara = document.createElement('p');
                    const formattedDate = formatFirestoreTimestamp(photoData.uploadedAt, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                    datePara.innerHTML = `<strong>Uploaded:</strong> ${formattedDate || 'N/A'}`;
                    photoDiv.appendChild(datePara);

                    if (photoData.employeeName) {
                        const empPara = document.createElement('p');
                        empPara.innerHTML = `<strong>By:</strong> ${escapeHtml(photoData.employeeName)}`;
                        photoDiv.appendChild(empPara);
                    }
                    if (photoData.notes) {
                        const notesPara = document.createElement('p');
                        notesPara.innerHTML = `<strong>Notes:</strong> ${escapeHtml(photoData.notes)}`;
                        photoDiv.appendChild(notesPara);
                    }
                    locationPhotosContainer.appendChild(photoDiv);
                });
            }
        } catch (error) {
            console.error("Error fetching photos from 'servicePhotos':", error);
            photosLoadingMessage.style.display = 'none';
            locationPhotosContainer.innerHTML = '<p class="error-message">Error loading photos. Please try again.</p>'; // User-friendly error
            alert(`Error fetching photos: ${error.message}. Check console for details.`);
        }
    }

    // --- Event Listeners for this page ---
    function setupClientLocationPageListeners() {
        console.log("DEBUG: Setting up Client/Location page listeners...");

        // Ensure all these elements exist before adding listeners
        if (showAddClientFormBtnPage) {
            showAddClientFormBtnPage.addEventListener('click', () => {
                console.log("DEBUG: 'Show Add Client Form' button clicked.");
                if(addClientForm) addClientForm.reset();
                showGeneralMessage(addClientMessageEl, '', 'info');
                showPageSection(addClientFormSection);
            });
        } else { console.warn("DEBUG: 'showAddClientFormBtnPage' not found."); }

        if (cancelAddClientFormBtn) {
            cancelAddClientFormBtn.addEventListener('click', () => showPageSection(null));
        } else { console.warn("DEBUG: 'cancelAddClientFormBtn' not found."); }

        if (cancelEditClientFormBtn) {
            cancelEditClientFormBtn.addEventListener('click', () => showPageSection(null));
        } else { console.warn("DEBUG: 'cancelEditClientFormBtn' not found."); }

        if (showAddLocationFormBtnPage) {
            showAddLocationFormBtnPage.addEventListener('click', () => {
                console.log("DEBUG: 'Show Add Location Form' button clicked.");
                if(addEditLocationForm) addEditLocationForm.reset();
                if(editLocationDocIdInput) editLocationDocIdInput.value = ''; // Clear edit ID
                if(locationFormTitle) locationFormTitle.textContent = "Add New Location";
                const saveLocBtn = document.getElementById('save-location-button');
                if(saveLocBtn) saveLocBtn.textContent = "Save Location";
                showGeneralMessage(addEditLocationMessageEl, '', 'info');
                if(typeof populateClientDropdownForLocation === "function") populateClientDropdownForLocation('location-client-select');
                const freqDropdown = document.getElementById('location-service-frequency');
                const daysGroup = document.getElementById('location-service-days-group');
                if(freqDropdown) freqDropdown.value = ''; // Reset dropdown
                if(daysGroup) { // Reset custom days
                    daysGroup.style.display = 'none';
                    daysGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                }
                showPageSection(addEditLocationFormSection);
            });
        } else { console.warn("DEBUG: 'showAddLocationFormBtnPage' not found."); }

        if (cancelAddEditLocationFormBtn) {
            cancelAddEditLocationFormBtn.addEventListener('click', () => showPageSection(null));
        } else { console.warn("DEBUG: 'cancelAddEditLocationFormBtn' not found."); }

        // Listener for the "Back to Locations List" button from the photos view
        // Uses the consistently named variable `backToLocationsFromPhotosBtn`
        if (backToLocationsFromPhotosBtn) {
            backToLocationsFromPhotosBtn.addEventListener('click', () => {
                console.log("DEBUG ACL: 'Back to Locations List' (from photos view) button clicked.");
                showPageSection(null); // Shows default client and location lists
            });
        } else {
            // This log helps if the button wasn't found by getElementById at the top
            console.warn("DEBUG ACL: Element 'backToLocationsFromPhotosBtn' (ID: back-to-locations-from-photos) was not found during listener setup phase.");
        }

        if (addClientForm) addClientForm.addEventListener('submit', handleAddClientSubmit);
        if (editClientForm) editClientForm.addEventListener('submit', handleEditClientSubmit);
        if (addEditLocationForm) addEditLocationForm.addEventListener('submit', handleSaveLocationSubmit);

        // Clear and re-attach delegated listeners for dynamic tables
        if (clientTableBodyEl && clientTableBodyEl.parentNode) {
            const newClientTableBodyEl = clientTableBodyEl.cloneNode(false); // Create a new empty body
            clientTableBodyEl.parentNode.replaceChild(newClientTableBodyEl, clientTableBodyEl); // Replace old with new
            clientTableBodyEl = newClientTableBodyEl; // Update reference
            clientTableBodyEl.addEventListener('click', (event) => {
                const editButton = event.target.closest('.edit-client-button');
                const deleteButton = event.target.closest('.delete-user-button[data-role="client"]');
                if (editButton) {
                    const uid = editButton.getAttribute('data-uid');
                    if (uid) handleEditClientClick(uid);
                } else if (deleteButton) {
                    const profileId = deleteButton.getAttribute('data-profile-id');
                    const name = deleteButton.getAttribute('data-name');
                    if (profileId) handleDeleteUserClick(deleteButton, profileId, name, 'client');
                }
            });
        } else { console.warn("DEBUG: 'clientTableBodyEl' not found for listener setup.");}

        if (locationsTableBodyEl && locationsTableBodyEl.parentNode) {
            const newLocationsTableBodyEl = locationsTableBodyEl.cloneNode(false);
            locationsTableBodyEl.parentNode.replaceChild(newLocationsTableBodyEl, locationsTableBodyEl);
            locationsTableBodyEl = newLocationsTableBodyEl;
            locationsTableBodyEl.addEventListener('click', (event) => {
                const editButton = event.target.closest('.edit-location-button');
                const deleteButton = event.target.closest('.delete-location-button');
                const photosButton = event.target.closest('.view-photos-button');
                if (editButton) {
                    const locId = editButton.getAttribute('data-location-id');
                    if (locId) handleEditLocationClick(locId);
                } else if (deleteButton) {
                    const locId = deleteButton.getAttribute('data-location-id');
                    const name = deleteButton.getAttribute('data-name');
                    if (locId) handleDeleteLocationClick(deleteButton, locId, name);
                } else if (photosButton) {
                    const locId = photosButton.getAttribute('data-location-id');
                    const name = photosButton.getAttribute('data-location-name');
                    if (locId) fetchAndDisplayPhotosForLocation(locId, name);
                }
            });
        } else { console.warn("DEBUG: 'locationsTableBodyEl' not found for listener setup.");}


        const freqDropdown = document.getElementById('location-service-frequency');
        const daysGroup = document.getElementById('location-service-days-group');
        if (freqDropdown && daysGroup) {
            freqDropdown.addEventListener('change', (e) => {
                daysGroup.style.display = (e.target.value === 'CustomWeekly') ? 'block' : 'none';
                if (e.target.value !== 'CustomWeekly') {
                    daysGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                }
            });
        }

        if (setClientPasswordBtn) {
            setClientPasswordBtn.addEventListener('click', handleSetNewPassword);
        } else { console.warn("DEBUG: 'setClientPasswordBtn' not found.");}

        document.body.addEventListener('click', (event) => { // For password reveal, good to have on body
             if (event.target.matches('.reveal-password-btn')) {
                handleRevealPasswordToggle(event);
            }
        });
        console.log("DEBUG: All Client/Location page listeners have been set up (or attempted).");
    }

    // --- Auth State Change Listener & Initial Data Load ---
    auth.onAuthStateChanged(user => {
        currentUser = user;
        console.log("DEBUG ACL: onAuthStateChanged triggered. User:", user ? user.uid : 'No user');

        if (user) {
            console.log("DEBUG ACL: User is authenticated with UID:", user.uid);
            
            user.getIdTokenResult().then(idTokenResult => {
                const claims = idTokenResult.claims;
                console.log("DEBUG ACL: User claims:", claims);
                
                // Attempt to get Firestore user document for role verification, but proceed if claims are sufficient
                db.collection('users').doc(user.uid).get()
                    .then(docSnapshot => {
                        let userData = null;
                        if (docSnapshot.exists) {
                            userData = docSnapshot.data();
                            console.log("DEBUG ACL: User document data from Firestore:", userData);
                        } else {
                            console.warn("DEBUG ACL: User document not found in Firestore for UID:", user.uid);
                        }

                        // Check for admin privileges based on claims OR Firestore role
                        const isAdminByClaims = claims && (claims.admin === true || claims.super_admin === true || claims.standard_admin === true);
                        const isAdminByRole = userData && (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'standard_admin');

                        if (isAdminByClaims || isAdminByRole) {
                            console.log("DEBUG ACL: Admin access confirmed for Client/Location Page.");
                            showPageSection(null); 
                            fetchAndDisplayClients();
                            fetchAndDisplayAllLocations();
                            setupClientLocationPageListeners();
                        } else {
                            console.error("DEBUG ACL: Access denied. User does not have sufficient admin claims or role. Redirecting.");
                            redirectToLogin("Insufficient admin privileges for Client/Location page.");
                        }
                    })
                    .catch(error => { 
                        console.error("DEBUG ACL: Error fetching user data from Firestore:", error);
                        // Allow access if claims are sufficient, even if Firestore doc fails, but log error
                        const isAdminByClaimsOnly = claims && (claims.admin === true || claims.super_admin === true || claims.standard_admin === true);
                        if(isAdminByClaimsOnly) {
                            console.warn("DEBUG ACL: Proceeding with admin access based on claims despite Firestore user doc error.");
                            showPageSection(null); 
                            fetchAndDisplayClients();
                            fetchAndDisplayAllLocations();
                            setupClientLocationPageListeners();
                        } else {
                            redirectToLogin("Critical error during admin check or page setup for Client/Location page. Check console.");
                        }
                    });
            }).catch(error => {
                console.error("DEBUG ACL: Error fetching ID token result:", error);
                redirectToLogin("Failed to verify admin status. Access denied.");
            });
        } else {
            console.log("DEBUG ACL: No user signed in (user object is null). Preparing to redirect.");
            redirectToLogin("No user signed in for Client/Location page.");
        }
    });

    console.log("DEBUG ACL: End of DOMContentLoaded setup.");
    console.log("DEBUG: Admin Client/Location Page script finished initial setup processing.");
});
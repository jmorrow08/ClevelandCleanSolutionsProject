// public/js/admin-portal.js
// v10.4 - Dashboard: Modal integration for service history editor.

document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG: Admin Dashboard script running (v10.4 - Modal Editor).");

    // --- Editor Check ---
    if (window.self !== window.top) { 
        console.log("DEBUG: Running inside editor iframe. Skipping auth checks.");
        const d = document.getElementById('admin-dashboard-content');
        const loadingMsg = document.getElementById('admin-loading-message');
        if (loadingMsg) loadingMsg.style.display = 'none';
        if (d) d.style.display = 'block';
        const w = document.getElementById('welcome-message');
        if (w) w.textContent = "Editing Admin Dashboard (Auth Disabled)";
        document.querySelectorAll('#admin-dashboard-content button:not(.reveal-password-btn)').forEach(btn => btn.disabled = true);
        return;
    }

    // --- Get references for elements ---
    const welcomeMessageEl = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const dashboardContentEl = document.getElementById('admin-dashboard-content');
    const adminLoadingMessageEl = document.getElementById('admin-loading-message');

    const goToEmployeePortalLink = document.getElementById('go-to-employee-portal-link');
    
    const triggerPayrollButton = document.getElementById('trigger-payroll-button');
    const payrollProcessingMessageEl = document.getElementById('payroll-processing-message');    
    
    const adminSecuritySection = document.getElementById('admin-security-section');
    const showPasswordButtonContainer = document.getElementById('show-password-button-container');
    const showAdminPasswordFormBtn = document.getElementById('show-admin-password-form-btn');
    const changePasswordSection = document.getElementById('change-password-section');
    const changePasswordForm = document.getElementById('change-password-form');
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const passwordMessageEl = document.getElementById('password-message');

    const todayServicesListEl = document.getElementById('today-services-list'); // Added for consistency
    const tomorrowServicesListEl = document.getElementById('tomorrow-services-list'); // Added for consistency
    const pendingPayrollListEl = document.getElementById('pending-payroll-list'); 
    const awaitingReviewListEl = document.getElementById('awaiting-review-list'); 

    const quickStatsTodayCountEl = document.getElementById('stats-today-count');
    const quickStatsTomorrowCountEl = document.getElementById('stats-tomorrow-count');
    const quickStatsReviewCountEl = document.getElementById('stats-review-count'); 
    const quickStatsPendingPayrollEl = document.getElementById('stats-pending-payroll-count'); 
    
    const quickStatsActiveClientsEl = document.getElementById('stats-active-clients-count');
    const quickStatsActiveEmployeesEl = document.getElementById('stats-active-employees-count');

    const quickAddServiceButton = document.getElementById('quick-add-service-button');
    const quickAddServiceFormContainer = document.getElementById('quick-add-service-form-container');
    const quickAddServiceForm = document.getElementById('quick-add-service-form');
    const qasClientSelect = document.getElementById('qas-client-select');
    const qasLocationSelect = document.getElementById('qas-location-select');
    const qasCancelButton = document.getElementById('qas-cancel-button');
    const qasMessageEl = document.getElementById('qas-message');
    
    const listSectionsContainer = document.getElementById('list-sections-container'); // This might be null if not on page

    // --- NEW MODAL ELEMENT REFERENCES ---
    const serviceHistoryEditorModal = document.getElementById('service-history-editor-modal');
    const closeSHEditorModalButton = document.getElementById('close-sh-editor-modal-button');
    const shEditorContentTarget = document.getElementById('sh-editor-content-target');
    let serviceHistoryFormHTML = ''; // Cache for the form HTML

    console.log("DEBUG: Element references obtained for admin.html.");

    let currentUser = null;
    let db, auth, serverTimestampFunction; 
    const triggerUrlProcessPayroll = "https://us-central1-cleveland-clean-portal.cloudfunctions.net/processCompletedJobsPayroll";

    if (dashboardContentEl) dashboardContentEl.style.display = 'none';
    else console.error("CRITICAL ERROR: dashboardContentEl is null.");
    if (adminLoadingMessageEl) adminLoadingMessageEl.style.display = 'block';

    // --- UTILITY FUNCTIONS (Keep existing ones) ---
    function redirectToLogin(message) { /* ... no change ... */ 
        console.warn("DEBUG: Admin portal - Redirecting to login page:", message);
        if (adminLoadingMessageEl) adminLoadingMessageEl.style.display = 'none';
        if (dashboardContentEl) dashboardContentEl.style.display = 'none';
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            try { window.location.assign('/'); } catch (e) { console.error("Redirect to login page failed:", e); }
        } else {
            const loginErrorDisplay = document.getElementById('login-error-message');
            if (loginErrorDisplay && message) {
                loginErrorDisplay.textContent = message;
                loginErrorDisplay.style.display = 'block';
            }
        }
    }
    function escapeHtml(unsafe) { /* ... no change ... */ 
        if (unsafe === null || typeof unsafe === 'undefined') return '';
        if (typeof unsafe !== 'string') {
            if (typeof unsafe === 'number' || typeof unsafe === 'boolean') {
                return String(unsafe);
            }
            return '[Invalid Data]';
        }
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function showFormMessage(el, message, type = 'info') { /* ... no change ... */ 
        if (el) {
            el.textContent = message;
            el.className = `form-message ${type}`;
            el.style.display = message ? 'block' : 'none';
        }
    }
    function showPasswordMessage(message, type = 'error') { /* ... no change ... */ 
         if (passwordMessageEl) {
            passwordMessageEl.textContent = message;
            passwordMessageEl.className = `form-message ${type}`;
            passwordMessageEl.style.display = message ? 'block' : 'none';
        }
    }
    function setFormDisabled(form, disabled) { /* ... no change ... */ 
        if (!form) return;
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => el.disabled = disabled);
    }
    function formatServiceDisplayTime(firestoreTimestamp) { /* ... no change ... */ 
        if (!firestoreTimestamp || typeof firestoreTimestamp.toDate !== 'function') {
            return 'Time N/A';
        }
        const jsDate = firestoreTimestamp.toDate();
        return jsDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    async function fetchActiveClientCount() { /* ... no change ... */ 
        if (!db) {
            console.error("DEBUG AP: Firestore db not initialized for fetchActiveClientCount.");
            return 0;
        }
        try {
            const snapshot = await db.collection('clientMasterList')
                                     .where('status', '==', true)
                                     .get();
            return snapshot.size;
        } catch (error) {
            console.error("DEBUG AP: Error fetching active client count:", error);
            return 0;
        }
    }
    async function fetchActiveEmployeeCount() { /* ... no change ... */ 
        if (!db) {
            console.error("DEBUG AP: Firestore db not initialized for fetchActiveEmployeeCount.");
            return 0;
        }
        try {
            const snapshot = await db.collection('employeeMasterList')
                                     .where('status', '==', true)
                                     .get();
            return snapshot.size;
        } catch (error) {
            console.error("DEBUG AP: Error fetching active employee count:", error);
            return 0;
        }
    }

    // --- MODIFIED LIST DISPLAY FUNCTIONS ---
    async function fetchAndDisplayServicesForDay(targetDate, listElementId, loadingMessageText = "Loading services...") {
        const listEl = document.getElementById(listElementId);
        if (!listEl) {
            console.error(`DEBUG: Element with ID ${listElementId} not found for displaying services.`);
            return 0; 
        }
        // Simplified loading message handling
        listEl.innerHTML = `<p class="loading-text">${loadingMessageText}</p>`;
        
        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
        const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfDay);
        const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfDay);
        try {
            if (!db) { throw new Error("Database not ready."); }
            const querySnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Scheduled')
                .where('serviceDate', '>=', startTimestamp)
                .where('serviceDate', '<=', endTimestamp)
                .orderBy('serviceDate', 'asc')
                .get();
            
            listEl.innerHTML = ''; 
            if (querySnapshot.empty) {
                listEl.innerHTML = '<p>No services scheduled for this day.</p>';
                return 0;
            }
            const ul = document.createElement('ul');
            ul.className = 'service-items-list';
            querySnapshot.forEach(doc => {
                const service = doc.data();
                const li = document.createElement('li');
                const serviceTime = formatServiceDisplayTime(service.serviceDate);
                // CHANGED: Use button for modal trigger
                li.innerHTML = `
                    <strong>${escapeHtml(service.clientName || 'N/A Client')}</strong> - ${escapeHtml(service.locationName || 'N/A Location')}
                    <br>Time: ${escapeHtml(serviceTime)} 
                    ${service.serviceType ? `<br>Type: ${escapeHtml(service.serviceType)}` : ''}
                    <br><button type="button" class="details-link modal-trigger-button" data-service-id="${doc.id}" title="View full details">Details</button>
                `;
                ul.appendChild(li);
            });
            listEl.appendChild(ul);
            return querySnapshot.size;
        } catch (error) {
            console.error(`DEBUG: Error fetching services for ${listElementId}:`, error);
            if (listEl) listEl.innerHTML = `<p class="error-message">Error loading services: ${error.message}</p>`;
            return 0;
        }
    }

    async function fetchAndDisplayPendingPayroll() {
        if (!pendingPayrollListEl) { 
            console.error("DEBUG: Element with ID pending-payroll-list not found.");
            return 0; 
        }
        pendingPayrollListEl.innerHTML = '<p class="loading-text">Loading jobs pending payroll...</p>';
        try {
            if (!db) { throw new Error("Database not ready.");}
            const querySnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Completed')
                .where('payrollProcessed', '==', false)
                .orderBy('serviceDate', 'desc') 
                .limit(20) 
                .get();

            pendingPayrollListEl.innerHTML = ''; 
            if (querySnapshot.empty) {
                pendingPayrollListEl.innerHTML = '<p>No completed jobs are currently pending payroll.</p>';
                return 0;
            }
            const ul = document.createElement('ul');
            ul.className = 'service-items-list';
            querySnapshot.forEach(doc => {
                const service = doc.data();
                const li = document.createElement('li');
                const serviceDate = service.serviceDate ? service.serviceDate.toDate().toLocaleDateString() : 'Date N/A';
                // CHANGED: Use button for modal trigger
                li.innerHTML = `
                    <strong>${escapeHtml(service.clientName || 'N/A Client')}</strong> (${escapeHtml(service.locationName || 'N/A Location')})
                    <br>Completed: ${escapeHtml(serviceDate)}
                    <br><button type="button" class="details-link modal-trigger-button" data-service-id="${doc.id}" title="View details and manage payroll status">View Details / Process Payroll</button>
                `;
                ul.appendChild(li);
            });
            pendingPayrollListEl.appendChild(ul);
            return querySnapshot.size;
        } catch (error) {
            console.error("DEBUG: Error fetching jobs pending payroll:", error);
            if (pendingPayrollListEl) pendingPayrollListEl.innerHTML = `<p class="error-message">Error loading jobs for payroll: ${error.message}</p>`;
            return 0;
        }
    }

    async function fetchAndDisplayAwaitingReview() {
        if (!awaitingReviewListEl) {
            console.error("DEBUG: Element with ID awaiting-review-list not found.");
            return 0;
        }
        awaitingReviewListEl.innerHTML = '<p class="loading-text">Loading services awaiting review...</p>';
        try {
            if (!db) { throw new Error("Database not ready."); }
            const today = new Date();
            today.setHours(23,59,59,999); 
            const todayTimestamp = firebase.firestore.Timestamp.fromDate(today);

            const querySnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Scheduled') 
                .where('serviceDate', '<=', todayTimestamp) 
                .orderBy('serviceDate', 'asc') 
                .limit(20)
                .get();

            awaitingReviewListEl.innerHTML = '';
            if (querySnapshot.empty) {
                awaitingReviewListEl.innerHTML = '<p>No services currently awaiting final review.</p>';
                return 0;
            }
            const ul = document.createElement('ul');
            ul.className = 'service-items-list';
            querySnapshot.forEach(doc => {
                const service = doc.data();
                const li = document.createElement('li');
                const serviceDate = service.serviceDate ? service.serviceDate.toDate().toLocaleDateString() : 'Date N/A';
                const serviceTime = formatServiceDisplayTime(service.serviceDate);
                 // CHANGED: Use button for modal trigger
                li.innerHTML = `
                    <strong>${escapeHtml(service.clientName || 'N/A Client')}</strong> (${escapeHtml(service.locationName || 'N/A Location')})
                    <br>Scheduled: ${escapeHtml(serviceDate)} at ${escapeHtml(serviceTime)}
                    <br><button type="button" class="details-link modal-trigger-button action-button" data-service-id="${doc.id}" style="background-color:#ffc107; color:black;">Review & Finalize Job</button>
                `;
                ul.appendChild(li);
            });
            awaitingReviewListEl.appendChild(ul);
            return querySnapshot.size;
        } catch (error) {
            console.error("DEBUG: Error fetching services awaiting review:", error);
            if (awaitingReviewListEl) awaitingReviewListEl.innerHTML = `<p class="error-message">Error loading services for review: ${error.message}</p>`;
            return 0;
        }
    }
    
    // --- QUICK ADD SERVICE FUNCTIONS (Keep existing ones) ---
    async function populateQASClientDropdown() { /* ... no change ... */ 
        if (!db || !qasClientSelect) {
            console.error("DEBUG AP: DB or qasClientSelect missing for Quick Add Service form.");
            if (qasClientSelect) qasClientSelect.innerHTML = '<option value="">Error loading</option>';
            return;
        }
        qasClientSelect.disabled = true;
        qasClientSelect.innerHTML = '<option value="">-- Loading Clients --</option>';
        try {
            const snapshot = await db.collection('clientMasterList')
                .where('status', '==', true)
                .orderBy('companyName', 'asc')
                .get();
            let optionsHtml = '<option value="">-- Select Client --</option>';
            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    optionsHtml += `<option value="${doc.id}" data-client-name="${escapeHtml(doc.data().companyName)}">${escapeHtml(doc.data().companyName)}</option>`;
                });
            } else {
                optionsHtml = '<option value="">-- No Active Clients --</option>';
            }
            qasClientSelect.innerHTML = optionsHtml;
        } catch (error) {
            console.error("DEBUG AP: Error populating QAS client dropdown:", error);
            qasClientSelect.innerHTML = '<option value="">-- Error Loading --</option>';
            if(qasMessageEl) showFormMessage(qasMessageEl, "Error loading clients.", "error");
        } finally {
            qasClientSelect.disabled = false;
        }
    }
    async function populateQASLocationDropdown(clientId) { /* ... no change ... */ 
        if (!db || !qasLocationSelect) {
            console.error("DEBUG AP: DB or qasLocationSelect missing for Quick Add Service form.");
            if (qasLocationSelect) qasLocationSelect.innerHTML = '<option value="">Error loading</option>';
            return;
        }
        qasLocationSelect.disabled = true;
        qasLocationSelect.innerHTML = '<option value="">-- Loading Locations --</option>';

        if (!clientId) {
            qasLocationSelect.innerHTML = '<option value="">-- Select Client First --</option>';
            return;
        }
        try {
            const snapshot = await db.collection('locations')
                .where('clientProfileId', '==', clientId)
                .where('status', '==', true)
                .orderBy('locationName', 'asc')
                .get();
            let optionsHtml = '<option value="">-- Select Location --</option>';
            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    optionsHtml += `<option value="${doc.id}" data-location-name="${escapeHtml(doc.data().locationName)}">${escapeHtml(doc.data().locationName || 'Unnamed Location')}</option>`;
                });
            } else {
                optionsHtml = '<option value="">-- No Active Locations for this Client --</option>';
            }
            qasLocationSelect.innerHTML = optionsHtml;
        } catch (error) {
            console.error("DEBUG AP: Error populating QAS location dropdown:", error);
            qasLocationSelect.innerHTML = '<option value="">-- Error Loading --</option>';
            if(qasMessageEl) showFormMessage(qasMessageEl, "Error loading locations.", "error");
        } finally {
            qasLocationSelect.disabled = false;
        }
    }
    async function handleQuickAddServiceSubmit(event) { /* ... no change ... */ 
        event.preventDefault();
        if (!db || !currentUser || !serverTimestampFunction) { 
            showFormMessage(qasMessageEl, "System error or not logged in. Please refresh.", "error");
            return;
        }
        if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, true);
        showFormMessage(qasMessageEl, "Scheduling new service...", "info");

        const clientId = qasClientSelect.value;
        const locationId = qasLocationSelect.value;
        const serviceDateStr = document.getElementById('qas-service-date').value;
        const serviceTimeStr = document.getElementById('qas-service-time').value; 
        const serviceTypeNotes = document.getElementById('qas-service-type').value.trim();

        const clientName = qasClientSelect.options[qasClientSelect.selectedIndex]?.dataset.clientName || "Unknown Client";
        const locationName = qasLocationSelect.options[qasLocationSelect.selectedIndex]?.dataset.locationName || "Unknown Location";

        if (!clientId || !locationId || !serviceDateStr) {
            showFormMessage(qasMessageEl, "Client, Location, and Service Date are required.", "error");
            if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
            return;
        }

        let serviceDateTimestamp;
        try {
            const dateParts = serviceDateStr.split('-'); 
            let year = parseInt(dateParts[0]);
            let month = parseInt(dateParts[1]) - 1; 
            let day = parseInt(dateParts[2]);
            let hours = 9; 
            let minutes = 0;

            if (serviceTimeStr) { 
                const timeParts = serviceTimeStr.split(':');
                hours = parseInt(timeParts[0]);
                minutes = parseInt(timeParts[1]);
            }
            
            const serviceDate = new Date(Date.UTC(year, month, day, hours, minutes));

            if (isNaN(serviceDate.getTime())) throw new Error("Invalid date or time format.");
            serviceDateTimestamp = firebase.firestore.Timestamp.fromDate(serviceDate);

        } catch (dateError) {
            showFormMessage(qasMessageEl, `Invalid Service Date/Time: ${dateError.message}`, "error");
            if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
            return;
        }

        const newServiceRecord = {
            clientProfileId: clientId,
            clientName: clientName,
            locationId: locationId,
            locationName: locationName,
            serviceDate: serviceDateTimestamp,
            serviceType: serviceTypeNotes || "Scheduled Service", 
            serviceNotes: null, 
            adminNotes: null,
            employeeAssignments: [], 
            status: "Scheduled",
            payrollProcessed: false,
            createdAt: serverTimestampFunction(),
            updatedAt: serverTimestampFunction(),
        };

        try {
            await db.collection('serviceHistory').add(newServiceRecord);
            showFormMessage(qasMessageEl, "New service scheduled successfully!", "success");
            if(quickAddServiceForm) quickAddServiceForm.reset();
            if(qasLocationSelect) {
                 qasLocationSelect.innerHTML = '<option value="">Select Client First</option>';
                 qasLocationSelect.disabled = true;
            }
            if(qasClientSelect) qasClientSelect.value = ""; 
            
            await refreshDashboardLists(); // Use the refresh function

            setTimeout(() => {
                if (quickAddServiceFormContainer) quickAddServiceFormContainer.style.display = 'none';
                showFormMessage(qasMessageEl, "", "info");
            }, 2000);

        } catch (error) {
            console.error("DEBUG AP: Error quick adding service record:", error);
            showFormMessage(qasMessageEl, `Error scheduling service: ${error.message}`, "error");
        } finally {
            if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
        }
    }

    // --- PASSWORD CHANGE FUNCTIONS (Keep existing ones) ---
    function handleRevealPasswordToggle(event) { /* ... no change ... */ 
        const button = event.target.closest('.reveal-password-btn');
        if (!button) return;
        const targetInputId = button.getAttribute('data-target');
        if (!targetInputId) return;
        const passwordInput = document.getElementById(targetInputId);
        if (!passwordInput) return;
        const currentType = passwordInput.getAttribute('type');
        if (currentType === 'password') {
            passwordInput.setAttribute('type', 'text');
            button.textContent = '🔒';
        } else {
            passwordInput.setAttribute('type', 'password');
            button.textContent = '👁️';
        }
    }
    function setupPasswordRevealListeners() { /* ... no change ... */ 
        console.log("DEBUG: Attaching password reveal listeners (admin-portal.js).");
        if (!document.body.passwordRevealListenerAttached) { 
            document.body.addEventListener('click', handleRevealPasswordToggle);
            document.body.passwordRevealListenerAttached = true;
        }
    }
    function showSection(sectionToShow) { /* ... no change, this is likely for a different feature ... */
        console.log("DEBUG: showSection called for:", sectionToShow ? sectionToShow.id : 'Default View (dashboard might not use this directly)');
        const allMainSectionsOnThisPage = [ listSectionsContainer, adminSecuritySection ]; 
        allMainSectionsOnThisPage.forEach(section => {
            if (section) {
                if (!sectionToShow) { 
                    section.style.display = (section === adminSecuritySection || section === listSectionsContainer) ? 'block' : 'none';
                } else {
                    section.style.display = (section === sectionToShow) ? 'block' : 'none';
                }
            }
        });
        if (payrollProcessingMessageEl && (!sectionToShow || (sectionToShow.id !== 'quick-actions-widget' && !sectionToShow.contains(payrollProcessingMessageEl)))) {    
            showFormMessage(payrollProcessingMessageEl, '', 'info');
        }
        const oldShowListsButton = document.getElementById('show-lists-button');
        if (oldShowListsButton) oldShowListsButton.style.display = 'none'; 
        
        if (changePasswordSection && sectionToShow !== adminSecuritySection) { 
            changePasswordSection.style.display = 'none'; 
        }
        if (showPasswordButtonContainer && sectionToShow === adminSecuritySection) {
             if (!changePasswordSection || changePasswordSection.style.display === 'none') {
                showPasswordButtonContainer.style.display = 'block';
             } else {
                showPasswordButtonContainer.style.display = 'none';
             }
        } else if (showPasswordButtonContainer) {
            showPasswordButtonContainer.style.display = 'none';
        }
    }
    function handleChangePasswordSubmit(e) { /* ... no change ... */ 
        e.preventDefault(); 
        const cP = currentPasswordInput ? currentPasswordInput.value : '';
        const nP = newPasswordInput ? newPasswordInput.value : '';
        const confP = confirmPasswordInput ? confirmPasswordInput.value : '';
        if(!cP||!nP||!confP){showPasswordMessage("All password fields are required.","error");return;} 
        if(nP.length<6){showPasswordMessage("New password must be at least 6 characters.","error");return;} 
        if(nP!==confP){showPasswordMessage("New passwords do not match.","error");return;} 
        if(!currentUser){showPasswordMessage("User session error. Please refresh.","error");return;} 
        if(changePasswordForm) setFormDisabled(changePasswordForm,true);
        showPasswordMessage("Updating your password...","info"); 
        const cred=firebase.auth.EmailAuthProvider.credential(currentUser.email,cP); 
        currentUser.reauthenticateWithCredential(cred).then(()=>{return currentUser.updatePassword(nP);}) 
        .then(()=>{
            showPasswordMessage("Password updated successfully!","success");
            if(changePasswordForm) changePasswordForm.reset(); 
            setTimeout(()=>{ 
                if(changePasswordSection) changePasswordSection.style.display = 'none'; 
                if(showPasswordButtonContainer) showPasswordButtonContainer.style.display = 'block'; 
                showPasswordMessage('', 'info'); 
            }, 2000); 
        }) 
        .catch(err=>{
            if(err.code==='auth/wrong-password'){showPasswordMessage("Incorrect current password.","error");}
            else if(err.code==='auth/weak-password'){showPasswordMessage("New password is too weak.","error");}
            else{console.error("Admin password update error:", err); showPasswordMessage(`Error: ${err.message}`,"error");}
        }) 
        .finally(()=>{if(changePasswordForm) setFormDisabled(changePasswordForm,false);});
    }
    async function handleTriggerPayrollProcessing() { /* ... no change ... */ 
        console.log("DEBUG: Trigger Payroll Processing button clicked."); 
        if (!auth || !auth.currentUser) { 
            showFormMessage(payrollProcessingMessageEl, 'Error: Admin must be logged in.', 'error'); 
            return; 
        } 
        if (!triggerUrlProcessPayroll) { 
            showFormMessage(payrollProcessingMessageEl, 'Error: Payroll function URL not configured.', 'error'); 
            return; 
        } 
        if (triggerPayrollButton) triggerPayrollButton.disabled = true; 
        showFormMessage(payrollProcessingMessageEl, 'Requesting payroll processing...', 'info'); 
        try { 
            const idToken = await auth.currentUser.getIdToken(true); 
            const response = await fetch(triggerUrlProcessPayroll, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${idToken}` } 
            }); 
            let responseData; 
            const responseText = await response.text(); 
            try { 
                responseData = JSON.parse(responseText); 
            } catch (e) { 
                console.warn("Response from payroll was not JSON:", responseText);
                responseData = { message: responseText }; 
            } 
            if (!response.ok) { 
                const errorMessage = responseData?.error?.message || responseData?.message || responseText || `HTTP error ${response.status}`; 
                throw new Error(errorMessage); 
            } 
            if (responseData && responseData.message) { 
                showFormMessage(payrollProcessingMessageEl, responseData.message, 'success'); 
            } else { 
                showFormMessage(payrollProcessingMessageEl, "Processing request sent (check Cloud Function logs for details).", 'success'); 
            } 
        } catch (error) { 
            console.error("Error triggering payroll processing:", error);
            showFormMessage(payrollProcessingMessageEl, `Error: ${error.message}`, 'error'); 
        } finally { 
            if (triggerPayrollButton) triggerPayrollButton.disabled = false; 
        }
    }

    // --- NEW MODAL FUNCTIONS ---
    async function loadServiceHistoryFormHTML() {
        if (serviceHistoryFormHTML) {
            if (shEditorContentTarget) shEditorContentTarget.innerHTML = serviceHistoryFormHTML;
            return true; // Already loaded
        }
        try {
            const response = await fetch('admin-service-history.html'); // Fetch the page that CONTAINS the form
            if (!response.ok) throw new Error(`Failed to fetch form HTML: ${response.statusText}`);
            const pageText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(pageText, 'text/html');
            const formSection = doc.getElementById('add-edit-service-history-section'); // Get the specific form section
            
            if (formSection) {
                serviceHistoryFormHTML = formSection.outerHTML;
                if (shEditorContentTarget) {
                    shEditorContentTarget.innerHTML = serviceHistoryFormHTML;
                    console.log("DEBUG AP: Service history form HTML loaded into dashboard modal target.");
                } else {
                     console.error("DEBUG AP: shEditorContentTarget is null when trying to set innerHTML.");
                }
                return true;
            } else {
                console.error("DEBUG AP: Could not find #add-edit-service-history-section in fetched HTML.");
                if (shEditorContentTarget) shEditorContentTarget.innerHTML = "<p class='error-message'>Error: Could not load service editor form content.</p>";
                return false;
            }
        } catch (error) {
            console.error("DEBUG AP: Error loading service history form HTML:", error);
            if (shEditorContentTarget) shEditorContentTarget.innerHTML = `<p class='error-message'>Error loading service editor form: ${error.message}</p>`;
            return false;
        }
    }

    async function openServiceEditorInModal(serviceId) {
    if (!serviceHistoryEditorModal || !shEditorContentTarget || !closeSHEditorModalButton) {
        console.error("DEBUG AP: Modal elements (serviceHistoryEditorModal, shEditorContentTarget, or closeSHEditorModalButton) not found.");
        alert("Error: Service editor UI components are missing. Cannot open editor.");
        return;
    }

    if (shEditorContentTarget) shEditorContentTarget.innerHTML = "<p class='loading-text'>Loading editor components...</p>";
    
    if (serviceHistoryEditorModal) {
        serviceHistoryEditorModal.style.display = 'flex'; 
        console.log("DEBUG AP: Modal display set to flex.");
    } else {
        console.error("DEBUG AP: serviceHistoryEditorModal IS NULL before setting display style! Cannot show modal.");
        return; 
    }

    const formLoaded = await loadServiceHistoryFormHTML();
    if (!formLoaded) {
        return;
    }
    
    // --- THIS IS THE CORRECTED IF BLOCK ---
    if (typeof window.ashFormHandler === 'undefined' || 
        typeof window.ashFormHandler.handleEditServiceHistoryClick !== 'function' ||
        typeof window.ashFormHandler.handleSaveServiceHistorySubmit !== 'function') {
        console.error("DEBUG AP: Service history handler (window.ashFormHandler) or its required functions (handleEditServiceHistoryClick, handleSaveServiceHistorySubmit) are not available. Make sure admin-service-history.js is loaded correctly and exposes these functions.");
        alert("Error: Critical service editing functions are not loaded. Please try refreshing the page. If the problem persists, contact support.");
        if (shEditorContentTarget) shEditorContentTarget.innerHTML = "<p class='error-message'>Error: Core editing functions failed to load. Cannot proceed.</p>";
        return;
    }
    // --- END CORRECTED IF BLOCK ---

    console.log(`DEBUG AP: Attempting to populate service editor modal for service ID: ${serviceId}`);
   
    try {
        await window.ashFormHandler.handleEditServiceHistoryClick(serviceId);
        console.log("DEBUG AP: ashFormHandler.handleEditServiceHistoryClick completed for modal.");

        if (shEditorContentTarget) {
            const formSectionInModal = shEditorContentTarget.querySelector('#add-edit-service-history-section');
            if (formSectionInModal) {
                formSectionInModal.style.display = 'block'; 
                console.log("DEBUG AP: Set #add-edit-service-history-section to display:block in modal.");
                
                const actualForm = formSectionInModal.querySelector('#add-edit-service-history-form');
                if (actualForm && window.ashFormHandler && typeof window.ashFormHandler.setFormDisabledState === 'function') {
                     window.ashFormHandler.setFormDisabledState(actualForm, false);
                }
            } else {
                console.error("DEBUG AP: #add-edit-service-history-section not found within modal content after population.");
            }
        }

        const modalCancelButton = shEditorContentTarget.querySelector('#cancel-add-edit-service-history-button');
        if (modalCancelButton) {
            const newCancelButton = modalCancelButton.cloneNode(true);
            modalCancelButton.parentNode.replaceChild(newCancelButton, modalCancelButton);
            newCancelButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log("DEBUG AP: Modal cancel button clicked.");
                if (serviceHistoryEditorModal) serviceHistoryEditorModal.style.display = 'none';
                if (shEditorContentTarget) shEditorContentTarget.innerHTML = ''; 
            });
        } else {
            console.warn("DEBUG AP: Modal cancel button #cancel-add-edit-service-history-button not found after loading form.");
        }

        const modalForm = shEditorContentTarget.querySelector('#add-edit-service-history-form');
        if (modalForm) {
            const newModalForm = modalForm.cloneNode(true);
            modalForm.parentNode.replaceChild(newModalForm, modalForm);

            newModalForm.addEventListener('submit', async function handleModalFormSubmit(e) {
                e.preventDefault(); 
                console.log("DEBUG AP: Modal form submitted.");
                await window.ashFormHandler.handleSaveServiceHistorySubmit(e); 
                
                const messageEl = this.querySelector('#add-edit-service-history-message');
                if (messageEl && messageEl.classList.contains('success')) {
                    console.log("DEBUG AP: Modal form save successful.");
                    setTimeout(async () => {
                        if (serviceHistoryEditorModal) serviceHistoryEditorModal.style.display = 'none';
                        if (shEditorContentTarget) shEditorContentTarget.innerHTML = '';
                        await refreshDashboardLists(); 
                    }, 1500);
                } else if (messageEl) {
                    console.warn("DEBUG AP: Modal form save resulted in message:", messageEl.textContent);
                }
            });
        } else {
             console.warn("DEBUG AP: Modal form #add-edit-service-history-form not found after loading form.");
        }

    } catch (error) {
        console.error("DEBUG AP: Error during modal form population (handleEditServiceHistoryClick call) or setup:", error);
        if (shEditorContentTarget) shEditorContentTarget.innerHTML = `<p class='error-message'>Error loading service details into editor: ${error.message}</p>`;
    }
}

    async function refreshDashboardLists() {
        console.log("DEBUG AP: Refreshing dashboard lists after edit/save.");
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Using a try-catch for each to prevent one failure from stopping others
        try {
            if(quickStatsTodayCountEl && typeof fetchAndDisplayServicesForDay === 'function') {
                 quickStatsTodayCountEl.textContent = await fetchAndDisplayServicesForDay(today, 'today-services-list', "Refreshing today's services...");
            }
        } catch(e){ console.error("Error refreshing today's services:", e); if(todayServicesListEl) todayServicesListEl.innerHTML = "<p class='error-message'>Refresh failed.</p>";}
        
        try {
            if(quickStatsTomorrowCountEl && typeof fetchAndDisplayServicesForDay === 'function') {
                quickStatsTomorrowCountEl.textContent = await fetchAndDisplayServicesForDay(tomorrow, 'tomorrow-services-list', "Refreshing tomorrow's services...");
            }
        } catch(e){ console.error("Error refreshing tomorrow's services:", e); if(tomorrowServicesListEl) tomorrowServicesListEl.innerHTML = "<p class='error-message'>Refresh failed.</p>";}
        
        try {
            if(quickStatsReviewCountEl && typeof fetchAndDisplayAwaitingReview === 'function') {
                quickStatsReviewCountEl.textContent = await fetchAndDisplayAwaitingReview();
            }
        } catch(e){ console.error("Error refreshing awaiting review list:", e); if(awaitingReviewListEl) awaitingReviewListEl.innerHTML = "<p class='error-message'>Refresh failed.</p>";}
        
        try {
            if(quickStatsPendingPayrollEl && typeof fetchAndDisplayPendingPayroll === 'function') {
                 quickStatsPendingPayrollEl.textContent = await fetchAndDisplayPendingPayroll();
            }
        } catch(e){ console.error("Error refreshing pending payroll list:", e); if(pendingPayrollListEl) pendingPayrollListEl.innerHTML = "<p class='error-message'>Refresh failed.</p>";}
    }

    // --- Main Firebase Initialization & Auth Logic ---
    (function initializeFirebase() { /* ... no change ... */
        console.log("DEBUG: Checking Firebase availability for init...");
        if (typeof firebase === 'undefined' || !firebase.app || !firebase.auth || !firebase.firestore) {
            if (adminLoadingMessageEl) adminLoadingMessageEl.textContent = "Critical Error: Firebase SDK not loaded. Cannot initialize Admin Portal.";
            return false; 
        }
        console.log("DEBUG: Firebase seems available. Initializing services for admin-portal.js...");
        try {
            auth = firebase.auth();
            db = firebase.firestore();
            serverTimestampFunction = firebase.firestore.FieldValue.serverTimestamp;
            console.log("DEBUG: Firebase core services initialized for admin-portal.js.");
            return true; 
        } catch (error) {
            console.error("DEBUG: Error initializing Firebase services (admin-portal.js):", error);
            if (adminLoadingMessageEl) adminLoadingMessageEl.textContent = "Error initializing admin services.";
            if (dashboardContentEl) dashboardContentEl.style.display = 'none';
            return false; 
        }
    })(); 

    console.log("DEBUG: Setting up auth listener (admin-portal.js)...");
    
    auth.onAuthStateChanged(user => {
        currentUser = user; // Keep currentUser updated for other functions
        console.log("DEBUG: onAuthStateChanged triggered (admin.html). User:", user ? user.uid : 'null');

        if (user) {
            user.getIdTokenResult()
                .then(async (idTokenResult) => {
                    const claims = idTokenResult.claims;
                    console.log(`DEBUG: Admin portal - User claims:`, claims);

                    if (claims.admin === true || claims.super_admin === true || claims.standard_admin === true) {
                        console.log(`DEBUG: Admin Dashboard - Admin claim found. Access GRANTED.`);
                        if (adminLoadingMessageEl) adminLoadingMessageEl.style.display = 'none';
                        if (dashboardContentEl) dashboardContentEl.style.display = 'block';
                        else { console.error("CRITICAL ERROR: dashboardContentEl not found!"); return; }

                        if (welcomeMessageEl) welcomeMessageEl.textContent = `Admin Dashboard (Logged in as: ${escapeHtml(user.email)})`;
                        
                        const userDocRef = db.collection('users').doc(user.uid);
                        try {
                            const doc = await userDocRef.get();
                            let firestoreUserRole = null;
                            if (doc.exists) firestoreUserRole = doc.data().role;
                            if (goToEmployeePortalLink) {
                                if (firestoreUserRole === 'employee' || claims.admin === true || claims.super_admin === true || claims.standard_admin === true) {
                                    goToEmployeePortalLink.style.display = 'inline-block';
                                } else {
                                    goToEmployeePortalLink.style.display = 'none';
                                }
                            }
                        } catch (firestoreError) {
                             console.error("DEBUG: Admin portal - Error fetching user document from Firestore:", firestoreError);
                             if (goToEmployeePortalLink && (claims.admin === true || claims.super_admin === true || claims.standard_admin === true)) {
                                goToEmployeePortalLink.style.display = 'inline-block';
                             }
                        }
                        
                        if(adminSecuritySection) adminSecuritySection.style.display = 'block';
                        if(changePasswordSection) changePasswordSection.style.display = 'none';
                        if(showPasswordButtonContainer) showPasswordButtonContainer.style.display = 'block';

                        await refreshDashboardLists(); // Initial load of dashboard lists

                        // Update quick stats counts that are not derived from the lists above
                        if(quickStatsActiveClientsEl) quickStatsActiveClientsEl.textContent = await fetchActiveClientCount();
                        if(quickStatsActiveEmployeesEl) quickStatsActiveEmployeesEl.textContent = await fetchActiveEmployeeCount();


                        if (!window.adminPortalModalListenersAttached) { // Use a more specific flag
                            console.log("DEBUG: Attaching MODAL and other listeners for admin.html...");
                            
                            // Standard button listeners (mostly unchanged)
                            if (logoutButton) { /* ... no change ... */ 
                                logoutButton.addEventListener('click', () => {
                                    auth.signOut().then(() => {
                                        // onAuthStateChanged will handle redirect
                                    }).catch(err => console.error("Admin dashboard logout error:", err));
                                });
                            }
                            if (triggerPayrollButton) { triggerPayrollButton.addEventListener('click', handleTriggerPayrollProcessing); }
                            if (changePasswordForm) { changePasswordForm.addEventListener('submit', handleChangePasswordSubmit); }
                            if (showAdminPasswordFormBtn) { /* ... no change ... */ 
                                showAdminPasswordFormBtn.addEventListener('click', () => { 
                                    if (showPasswordButtonContainer) showPasswordButtonContainer.style.display = 'none'; 
                                    if (changePasswordSection) changePasswordSection.style.display = 'block'; 
                                    if (changePasswordForm) changePasswordForm.reset(); 
                                    showPasswordMessage('', 'info'); 
                                });
                            }
                            const actualCancelChangePasswordBtn = document.getElementById('cancel-change-password-btn');
                            if (actualCancelChangePasswordBtn) { /* ... no change ... */
                                actualCancelChangePasswordBtn.addEventListener('click', () => { 
                                    if (changePasswordSection) changePasswordSection.style.display = 'none'; 
                                    if (showPasswordButtonContainer) showPasswordButtonContainer.style.display = 'block'; 
                                    showPasswordMessage('', 'info'); 
                                });
                            }
                            if (quickAddServiceButton) { /* ... no change ... */
                                quickAddServiceButton.addEventListener('click', () => {
                                    if (quickAddServiceFormContainer) quickAddServiceFormContainer.style.display = 'block';
                                    populateQASClientDropdown(); 
                                    if(qasLocationSelect) {
                                        qasLocationSelect.innerHTML = '<option value="">Select Client First</option>';
                                        qasLocationSelect.disabled = true;
                                    }
                                    if (quickAddServiceForm) quickAddServiceForm.reset();
                                    if (qasMessageEl) showFormMessage(qasMessageEl, '', 'info');
                                });
                            }
                            if (qasClientSelect) { /* ... no change ... */ 
                                qasClientSelect.addEventListener('change', (event) => {
                                    populateQASLocationDropdown(event.target.value);
                                });
                            }
                            if (qasCancelButton) { /* ... no change ... */
                                qasCancelButton.addEventListener('click', () => {
                                    if (quickAddServiceFormContainer) quickAddServiceFormContainer.style.display = 'none';
                                });
                            }
                            if (quickAddServiceForm) { /* ... no change ... */
                                quickAddServiceForm.addEventListener('submit', handleQuickAddServiceSubmit);
                            }
                            
                            setupPasswordRevealListeners();    

                            // --- NEW MODAL EVENT LISTENERS ---
                            // Event delegation for dynamically added "Review & Finalize Job" / "Details" buttons
                            document.body.addEventListener('click', function(event) {
                                const targetButton = event.target.closest('.modal-trigger-button');
                                if (targetButton) {
                                    event.preventDefault(); 
                                    const serviceId = targetButton.dataset.serviceId;
                                    if (serviceId) {
                                        console.log(`DEBUG AP: Modal trigger button clicked for service ID: ${serviceId}`);
                                        openServiceEditorInModal(serviceId);
                                    } else {
                                        console.warn("DEBUG AP: Modal trigger button clicked, but no service-id found on button.", targetButton);
                                    }
                                }
                            });

                            if (closeSHEditorModalButton) {
                                closeSHEditorModalButton.addEventListener('click', () => {
                                    if (serviceHistoryEditorModal) serviceHistoryEditorModal.style.display = 'none';
                                    if (shEditorContentTarget) shEditorContentTarget.innerHTML = ''; // Clear content to ensure clean slate next time
                                });
                            }
                            // --- END NEW MODAL EVENT LISTENERS ---

                            window.adminPortalModalListenersAttached = true; 
                            console.log("DEBUG: Modal and other listeners attached for admin.html.");
                        }    
                    } else { 
                        redirectToLogin(`Admin Login Error: Required admin privileges not found. Access Denied.`);
                    }
                })    
                .catch((error) => { 
                    console.error("DEBUG: Admin portal - Error getting ID token result:", error); 
                    redirectToLogin(`Failed to verify admin status. Access denied.`);
                });    
        } else { 
            redirectToLogin("User is signed out. Please login.");
        }
    });    

    console.log("DEBUG: Initial script setup finished for admin.html.");
});
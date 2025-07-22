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

    // Function to close modal properly - available globally
    function closeModal() {
        if (serviceHistoryEditorModal) serviceHistoryEditorModal.style.display = 'none';
        if (shEditorContentTarget) shEditorContentTarget.innerHTML = '';
        // Restore body scrolling
        document.body.style.overflow = '';
        console.log("DEBUG AP: Modal closed and body scroll restored");
    }

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

    // Load job status counts
    async function loadJobStatusCounts() {
        if (!db) return;
        
        try {
            // Get current date for filtering
            const today = new Date();
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            
            // Count jobs by status
            const pendingSnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Scheduled')
                .where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(startOfToday))
                .get();
                
            const inProgressSnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'In Progress')
                .get();
                
            const completedSnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Complete')
                .where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(startOfToday))
                .get();
                
            const scheduledSnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Scheduled')
                .get();

            // Update the counts
            document.getElementById('pending-jobs-count').textContent = pendingSnapshot.size;
            document.getElementById('in-progress-jobs-count').textContent = inProgressSnapshot.size;
            document.getElementById('completed-jobs-count').textContent = completedSnapshot.size;
            document.getElementById('scheduled-jobs-count').textContent = scheduledSnapshot.size;
            
        } catch (error) {
            console.error('Error loading job status counts:', error);
        }
    }

    // Load payroll status
    async function loadPayrollStatus() {
        if (!db) return;
        
        try {
            // Try to estimate payroll from completed services (fallback approach)
            const today = new Date();
            const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            // Get completed services in the last 30 days to estimate pending payroll
            const completedServicesSnapshot = await db.collection('serviceHistory')
                .where('status', '==', 'Complete')
                .where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(thirtyDaysAgo))
                .get();
                
            let estimatedPendingAmount = 0;
            let completedJobs = 0;
            
            completedServicesSnapshot.forEach(doc => {
                const data = doc.data();
                // Estimate $50 per completed service (adjust as needed)
                estimatedPendingAmount += 50;
                completedJobs++;
            });
            
            // Try to get actual payroll records, but handle permission errors
            let actualPendingAmount = estimatedPendingAmount;
            let processedCount = 0;
            let statusMessage = `Estimated based on ${completedJobs} completed jobs`;
            
            try {
                const payrollSnapshot = await db.collection('payrollRecords')
                    .where('status', '==', 'Pending')
                    .get();
                    
                actualPendingAmount = 0;
                payrollSnapshot.forEach(doc => {
                    const data = doc.data();
                    actualPendingAmount += data.totalAmount || 0;
                });
                
                const processedSnapshot = await db.collection('payrollRecords')
                    .where('status', '==', 'Paid')
                    .get();
                    
                processedCount = processedSnapshot.size;
                statusMessage = `${payrollSnapshot.size} pending records • Last updated: ${new Date().toLocaleTimeString()}`;
                
            } catch (payrollError) {
                // Silent handling - this is expected for users without payroll access
                statusMessage = `Estimated: ${completedJobs} jobs completed • Limited access mode`;
                pendingCount = 0;
                processedCount = 0;
            }

            // Update the display
            document.getElementById('pending-payroll-amount').textContent = `$${actualPendingAmount.toFixed(2)}`;
            document.getElementById('processed-payroll-count').textContent = processedCount;
            document.getElementById('payroll-status-message').textContent = statusMessage;
            
        } catch (error) {
            console.error('Error loading payroll status:', error);
            document.getElementById('payroll-status-message').textContent = 'Unable to load payroll status';
            document.getElementById('pending-payroll-amount').textContent = '$0.00';
            document.getElementById('processed-payroll-count').textContent = '0';
        }
    }

    // Load recent services
    async function loadRecentServices() {
        if (!db) return;
        
        try {
            const recentSnapshot = await db.collection('serviceHistory')
                .orderBy('createdAt', 'desc')
                .limit(5)
                .get();
                
            const recentServicesList = document.getElementById('recent-services-list');
            if (!recentServicesList) return;
            
            if (recentSnapshot.empty) {
                recentServicesList.innerHTML = '<div class="text-muted-foreground text-sm">No recent services found</div>';
                return;
            }
            
            let servicesHtml = '';
            recentSnapshot.forEach(doc => {
                const data = doc.data();
                const date = data.serviceDate ? data.serviceDate.toDate().toLocaleDateString() : 'No date';
                const client = data.clientName || 'Unknown client';
                const status = data.status || 'Unknown';
                
                const statusColor = {
                    'Complete': 'text-green-600',
                    'In Progress': 'text-blue-600',
                    'Scheduled': 'text-purple-600',
                    'Cancelled': 'text-red-600'
                }[status] || 'text-gray-600';
                
                servicesHtml += `
                    <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                        <div>
                            <div class="font-medium text-sm">${client}</div>
                            <div class="text-xs text-muted-foreground">${date}</div>
                        </div>
                        <div class="text-xs ${statusColor} font-medium">${status}</div>
                    </div>
                `;
            });
            
            recentServicesList.innerHTML = servicesHtml;
            
        } catch (error) {
            console.error('Error loading recent services:', error);
            document.getElementById('recent-services-list').innerHTML = 
                '<div class="text-red-500 text-sm">Error loading recent services</div>';
        }
    }

    // Load employee activity and clock-in/out data
    async function loadEmployeeActivity() {
        const timeTrackingDisplay = document.getElementById('time-tracking-display');
        if (!timeTrackingDisplay || !db) return;
        
        try {
            timeTrackingDisplay.innerHTML = '<p class="text-muted-foreground">Loading employee activity...</p>';
            
            // Get recent employee clock-in/out events (last 24 hours)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            // Try to fetch time tracking data from different possible collections
            let activityHtml = '';
            let hasData = false;
            
            try {
                // Check for time tracking in employeeTimeTracking collection
                const timeTrackingSnapshot = await db.collection('employeeTimeTracking')
                    .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(oneDayAgo))
                    .orderBy('timestamp', 'desc')
                    .limit(10)
                    .get();
                
                if (!timeTrackingSnapshot.empty) {
                    hasData = true;
                    activityHtml += '<div class="space-y-2"><h4 class="font-medium text-sm">Recent Clock Events (24h)</h4>';
                    
                    timeTrackingSnapshot.forEach(doc => {
                        const data = doc.data();
                        const time = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Unknown time';
                        const employee = data.employeeName || 'Unknown employee';
                        const action = data.action || 'activity';
                        const location = data.locationName || 'Unknown location';
                        
                        const actionColor = action.toLowerCase().includes('in') ? 'text-green-600' : 'text-red-600';
                        
                        activityHtml += `
                            <div class="flex justify-between items-center py-1 text-xs border-b border-gray-100 last:border-b-0">
                                <div>
                                    <span class="font-medium">${employee}</span> - ${location}
                                </div>
                                <div class="text-right">
                                    <div class="${actionColor} font-medium">${action}</div>
                                    <div class="text-muted-foreground">${time}</div>
                                </div>
                            </div>
                        `;
                    });
                    
                    activityHtml += '</div>';
                }
            } catch (timeTrackingError) {
                console.log('No time tracking collection or access limited:', timeTrackingError);
            }
            
            // If no time tracking data, try to get recent service assignments as activity indicator
            if (!hasData) {
                try {
                    const recentServicesSnapshot = await db.collection('serviceHistory')
                        .where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(oneDayAgo))
                        .orderBy('serviceDate', 'desc')
                        .limit(5)
                        .get();
                    
                    if (!recentServicesSnapshot.empty) {
                        hasData = true;
                        activityHtml += '<div class="space-y-2"><h4 class="font-medium text-sm">Recent Service Activity (24h)</h4>';
                        
                        recentServicesSnapshot.forEach(doc => {
                            const data = doc.data();
                            const time = data.serviceDate ? data.serviceDate.toDate().toLocaleString() : 'Unknown time';
                            const location = data.locationName || 'Unknown location';
                            const employees = data.employeeAssignments && data.employeeAssignments.length > 0 
                                ? data.employeeAssignments.map(emp => emp.employeeName || 'Unknown').join(', ')
                                : 'No assignments';
                            const status = data.status || 'Unknown';
                            
                            const statusColor = {
                                'Complete': 'text-green-600',
                                'In Progress': 'text-blue-600',
                                'Scheduled': 'text-purple-600'
                            }[status] || 'text-gray-600';
                            
                            activityHtml += `
                                <div class="flex justify-between items-center py-1 text-xs border-b border-gray-100 last:border-b-0">
                                    <div>
                                        <span class="font-medium">${location}</span><br>
                                        <span class="text-muted-foreground">${employees}</span>
                                    </div>
                                    <div class="text-right">
                                        <div class="${statusColor} font-medium">${status}</div>
                                        <div class="text-muted-foreground">${time}</div>
                                    </div>
                                </div>
                            `;
                        });
                        
                        activityHtml += '</div>';
                    }
                } catch (serviceError) {
                    console.log('Error fetching recent services for activity:', serviceError);
                }
            }
            
            // Show results or no data message
            if (hasData) {
                timeTrackingDisplay.innerHTML = activityHtml;
            } else {
                timeTrackingDisplay.innerHTML = `
                    <div class="text-center py-4">
                        <div class="text-muted-foreground text-sm">No recent employee activity found</div>
                        <div class="text-xs text-muted-foreground mt-1">
                            Clock-in/out and service assignments will appear here
                        </div>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Error loading employee activity:', error);
            timeTrackingDisplay.innerHTML = `
                <div class="text-red-500 text-sm">
                    Error loading employee activity: ${error.message}
                </div>
            `;
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
                    <strong>${escapeHtml(service.locationName || 'N/A Location')}</strong>
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

        const serviceMode = document.querySelector('input[name="qas-service-mode"]:checked').value;
        const serviceDateStr = document.getElementById('qas-service-date').value;
        const serviceTimeStr = document.getElementById('qas-service-time').value; 
        let serviceTypeNotes = document.getElementById('qas-service-type').value.trim();

        let clientId, locationId, clientName, locationName, customPrice = null;

        if (serviceMode === 'regular') {
            // Regular service using existing client/location
            clientId = qasClientSelect.value;
            locationId = qasLocationSelect.value;
            clientName = qasClientSelect.options[qasClientSelect.selectedIndex]?.dataset.clientName || "Unknown Client";
            locationName = qasLocationSelect.options[qasLocationSelect.selectedIndex]?.dataset.locationName || "Unknown Location";

            if (!clientId || !locationId || !serviceDateStr) {
                showFormMessage(qasMessageEl, "Client, Location, and Service Date are required.", "error");
                if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
                return;
            }
        } else {
            // Custom service with manual input
            clientName = document.getElementById('qas-custom-client').value.trim();
            locationName = document.getElementById('qas-custom-location').value.trim();
            const customContact = document.getElementById('qas-custom-contact').value.trim();
            const customPriceValue = document.getElementById('qas-custom-price').value;

            if (!clientName || !locationName || !serviceDateStr) {
                showFormMessage(qasMessageEl, "Client Name, Location, and Service Date are required for custom jobs.", "error");
                if(quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
                return;
            }

            // Use special IDs for custom jobs
            clientId = `CUSTOM-${Date.now()}`;
            locationId = `CUSTOM-LOC-${Date.now()}`;
            
            if (customPriceValue && !isNaN(parseFloat(customPriceValue))) {
                customPrice = parseFloat(customPriceValue);
            }

            // Add contact info to notes if provided
            if (customContact) {
                const contactNote = `Contact: ${customContact}`;
                if (serviceTypeNotes) {
                    serviceTypeNotes += ` | ${contactNote}`;
                } else {
                    serviceTypeNotes = contactNote;
                }
            }
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
            
            // Create date in local timezone (Cleveland/Eastern Time) instead of UTC
            const serviceDate = new Date(year, month, day, hours, minutes);

            if (isNaN(serviceDate.getTime())) throw new Error("Invalid date or time format.");
            
            console.log(`DEBUG AP: Service scheduled for: ${serviceDate.toLocaleString()} (Local: ${serviceDate.toLocaleDateString()} ${serviceDate.toLocaleTimeString()})`);
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
            serviceType: serviceTypeNotes || (serviceMode === 'custom' ? "Custom Service" : "Scheduled Service"), 
            serviceNotes: null, 
            adminNotes: null,
            employeeAssignments: [], 
            status: "Scheduled",
            payrollProcessed: false,
            isCustomJob: serviceMode === 'custom',
            customPrice: customPrice,
            createdAt: serverTimestampFunction(),
            updatedAt: serverTimestampFunction(),
        };

        try {
            await db.collection('serviceHistory').add(newServiceRecord);
            showFormMessage(qasMessageEl, "New service scheduled successfully!", "success");
            if(quickAddServiceForm) quickAddServiceForm.reset();
            
            // Reset service mode to regular
            document.getElementById('qas-regular-service').checked = true;
            document.getElementById('qas-regular-fields').classList.remove('hidden');
            document.getElementById('qas-custom-fields').classList.add('hidden');
            
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
        // Scroll to top of page to ensure modal is visible
        window.scrollTo(0, 0);
        // Also ensure modal content starts at top
        const modalContent = serviceHistoryEditorModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.scrollTop = 0;
        }
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';
        console.log("DEBUG AP: Modal display set to flex and scrolled to top.");
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
        // Wait a moment for DOM to be ready after form load
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await window.ashFormHandler.handleEditServiceHistoryClick(serviceId);
        console.log("DEBUG AP: ashFormHandler.handleEditServiceHistoryClick completed for modal.");
        
        // Wait another moment for population to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        if (shEditorContentTarget) {
            const formSectionInModal = shEditorContentTarget.querySelector('#add-edit-service-history-section');
            if (formSectionInModal) {
                formSectionInModal.style.display = 'block'; 
                console.log("DEBUG AP: Set #add-edit-service-history-section to display:block in modal.");
                
                const actualForm = formSectionInModal.querySelector('#add-edit-service-history-form');
                if (actualForm && window.ashFormHandler && typeof window.ashFormHandler.setFormDisabledState === 'function') {
                     window.ashFormHandler.setFormDisabledState(actualForm, false);
                }

                // Debug check: Verify if client and location dropdowns are populated and showing correct values
                const clientSelect = formSectionInModal.querySelector('#sh-client-select');
                const locationSelect = formSectionInModal.querySelector('#sh-location-select');
                const serviceDateInput = formSectionInModal.querySelector('#sh-service-date');
                
                console.log("DEBUG AP: Modal form element check:");
                console.log("- Client select options:", clientSelect ? clientSelect.options.length : 'not found');
                console.log("- Client selected value:", clientSelect ? clientSelect.value : 'not found');
                console.log("- Client selected text:", clientSelect ? clientSelect.options[clientSelect.selectedIndex]?.text : 'not found');
                console.log("- Location select options:", locationSelect ? locationSelect.options.length : 'not found');
                console.log("- Location selected value:", locationSelect ? locationSelect.value : 'not found');
                console.log("- Location selected text:", locationSelect ? locationSelect.options[locationSelect.selectedIndex]?.text : 'not found');
                console.log("- Service date value:", serviceDateInput ? serviceDateInput.value : 'not found');
                
                // Force UI refresh for dropdowns
                if (clientSelect && clientSelect.value) {
                    // Force the dropdown to display the selected option
                    clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log("DEBUG AP: Forced client dropdown refresh");
                }
                
                if (locationSelect && locationSelect.value) {
                    // Force the dropdown to display the selected option  
                    locationSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log("DEBUG AP: Forced location dropdown refresh");
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
                closeModal();
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
                        closeModal();
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
        currentUser = user;
        if (user) {
            user.getIdTokenResult()
                .then((idTokenResult) => {
                    const claims = idTokenResult.claims;
                    console.log("DEBUG AP: User claims:", claims);
                    
                    // Check for owner role or admin privileges
                    const isOwner = claims.owner === true;
                    const isAdmin = claims.admin === true || claims.super_admin === true;
                    
                    if (isOwner || isAdmin) {
                        console.log("DEBUG AP: Admin/Owner access confirmed.");
                        
                        // Add portal toggle for owners
                        if (isOwner) {
                            const sidebar = document.querySelector('.sidebar') || document.querySelector('nav');
                            if (sidebar) {
                                const toggleButton = document.createElement('a');
                                toggleButton.href = '/employee';
                                toggleButton.className = 'btn-secondary w-full mb-2 flex items-center justify-center';
                                toggleButton.innerHTML = `
                                    <i data-lucide="users" class="h-4 w-4 mr-2"></i>
                                    Switch to Employee Portal
                                `;
                                
                                // Add the button at the bottom of the sidebar
                                const existingButtons = sidebar.querySelector('.admin-footer') || sidebar.lastElementChild;
                                if (existingButtons) {
                                    sidebar.insertBefore(toggleButton, existingButtons);
                                } else {
                                    sidebar.appendChild(toggleButton);
                                }
                                
                                // Re-initialize icons
                                if (typeof lucide !== 'undefined') {
                                    lucide.createIcons();
                                }
                            }
                        }
                        
                        // Initialize admin portal
                        initializeAdminPortal();
                    } else {
                        console.error("DEBUG AP: Access denied. User does not have sufficient admin claims.");
                        window.location.href = 'index.html';
                    }
                })
                .catch((error) => {
                    console.error("DEBUG AP: Error getting ID token result:", error);
                    window.location.href = 'index.html';
                });
        } else {
            console.log("DEBUG AP: No user signed in, redirecting to login.");
            window.location.href = 'index.html';
        }
    });

    console.log("DEBUG: Initial script setup finished for admin.html.");
});

// =================
// INTERACTIVE FEATURES
// =================

// Show jobs by status in modal
function showJobsByStatus(status) {
    const modal = document.getElementById('job-management-modal');
    const title = document.getElementById('job-modal-title');
    const content = document.getElementById('job-modal-content');
    
    if (!modal || !title || !content) return;
    
    title.textContent = `Manage ${status} Jobs`;
    content.innerHTML = `
        <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading ${status.toLowerCase()} jobs...</p>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    loadJobsByStatus(status, content);
}

// Load and display jobs by status
async function loadJobsByStatus(status, container) {
    try {
        if (!db) {
            throw new Error("Database not ready");
        }
        
        let query = db.collection('serviceHistory');
        
        // Adjust query based on status
        if (status === 'In Progress') {
            query = query.where('status', 'in', ['In Progress', 'Scheduled'])
                         .where('serviceDate', '<=', firebase.firestore.Timestamp.now());
        } else {
            query = query.where('status', '==', status);
        }
        
        const snapshot = await query.orderBy('serviceDate', 'desc').limit(50).get();
        
        if (snapshot.empty) {
            container.innerHTML = `<p class="text-center text-gray-500 py-8">No ${status.toLowerCase()} jobs found.</p>`;
            return;
        }
        
        let html = '<div class="space-y-4">';
        
        snapshot.forEach(doc => {
            const job = doc.data();
            const serviceDate = job.serviceDate ? job.serviceDate.toDate().toLocaleDateString() : 'Date N/A';
            const serviceTime = job.serviceDate ? job.serviceDate.toDate().toLocaleTimeString() : 'Time N/A';
            
            html += `
                <div class="border rounded-lg p-4 bg-gray-50">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <h4 class="font-medium">${escapeHtml(job.clientName || 'Unknown Client')}</h4>
                            <p class="text-sm text-gray-600">${escapeHtml(job.locationName || 'Unknown Location')}</p>
                            <p class="text-sm text-gray-500">${serviceDate} at ${serviceTime}</p>
                            ${job.adminNotes ? `<p class="text-sm text-blue-600 mt-1">Notes: ${escapeHtml(job.adminNotes)}</p>` : ''}
                        </div>
                        <div class="flex flex-col space-y-2 ml-4">
                            <select onchange="updateJobStatus('${doc.id}', this.value)" class="text-xs p-1 border rounded">
                                <option value="Scheduled" ${job.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                <option value="In Progress" ${job.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Complete" ${job.status === 'Complete' ? 'selected' : ''}>Complete</option>
                            </select>
                            <button onclick="approveJobPhotos('${doc.id}')" class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                                Approve Photos
                            </button>
                            <button onclick="editJobNotes('${doc.id}')" class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                                Edit Notes
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading jobs by status:', error);
        container.innerHTML = `<p class="text-center text-red-500 py-8">Error loading jobs: ${error.message}</p>`;
    }
}

// Update job status
async function updateJobStatus(jobId, newStatus) {
    try {
        if (!db) {
            throw new Error("Database not ready");
        }
        
        await db.collection('serviceHistory').doc(jobId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Job ${jobId} status updated to ${newStatus}`);
        
        // Refresh dashboard counts
        if (typeof loadDashboardStats === 'function') {
            loadDashboardStats();
        }
        
        // Show success message
        showNotification(`Job status updated to ${newStatus}`, 'success');
        
    } catch (error) {
        console.error('Error updating job status:', error);
        showNotification(`Failed to update job status: ${error.message}`, 'error');
    }
}

// Approve job photos
async function approveJobPhotos(jobId) {
    try {
        if (!db) {
            throw new Error("Database not ready");
        }
        
        // Get job details to find location
        const jobDoc = await db.collection('serviceHistory').doc(jobId).get();
        if (!jobDoc.exists) {
            throw new Error("Job not found");
        }
        
        const job = jobDoc.data();
        const serviceDate = job.serviceDate ? job.serviceDate.toDate() : new Date();
        
        // Find photos for this location around the service date
        const startDate = new Date(serviceDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(serviceDate);
        endDate.setHours(23, 59, 59, 999);
        
        const photosSnapshot = await db.collection('servicePhotos')
            .where('locationId', '==', job.locationId)
            .where('uploadedAt', '>=', firebase.firestore.Timestamp.fromDate(startDate))
            .where('uploadedAt', '<=', firebase.firestore.Timestamp.fromDate(endDate))
            .get();
        
        const batch = db.batch();
        let photoCount = 0;
        
        photosSnapshot.forEach(photoDoc => {
            batch.update(photoDoc.ref, {
                isClientVisible: true,
                approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                approvedBy: firebase.auth().currentUser.uid
            });
            photoCount++;
        });
        
        if (photoCount > 0) {
            await batch.commit();
            showNotification(`${photoCount} photos approved for client viewing`, 'success');
        } else {
            showNotification('No photos found for this job date', 'info');
        }
        
    } catch (error) {
        console.error('Error approving photos:', error);
        showNotification(`Failed to approve photos: ${error.message}`, 'error');
    }
}

// Edit job notes
function editJobNotes(jobId) {
    const notes = prompt('Enter admin notes for this job:');
    if (notes !== null) {
        updateJobNotes(jobId, notes);
    }
}

// Update job notes
async function updateJobNotes(jobId, notes) {
    try {
        if (!db) {
            throw new Error("Database not ready");
        }
        
        await db.collection('serviceHistory').doc(jobId).update({
            adminNotes: notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Job notes updated successfully', 'success');
        
    } catch (error) {
        console.error('Error updating job notes:', error);
        showNotification(`Failed to update notes: ${error.message}`, 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
        type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
        type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
        'bg-blue-100 text-blue-800 border border-blue-200'
    }`;
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <span>${escapeHtml(message)}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-lg font-bold">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Service Agreement Management
function openServiceAgreementModal(clientId = '') {
    const modal = document.getElementById('service-agreement-modal');
    const clientSelect = document.getElementById('agreement-client-select');
    
    if (!modal || !clientSelect) return;
    
    // Populate client dropdown
    populateAgreementClientDropdown();
    
    if (clientId) {
        clientSelect.value = clientId;
    }
    
    modal.classList.remove('hidden');
}

// Populate client dropdown for agreements
async function populateAgreementClientDropdown() {
    const select = document.getElementById('agreement-client-select');
    if (!select || !db) return;
    
    try {
        const snapshot = await db.collection('clientMasterList')
            .where('status', '==', true)
            .orderBy('companyName', 'asc')
            .get();
        
        let html = '<option value="">Select Client</option>';
        snapshot.forEach(doc => {
            const client = doc.data();
            html += `<option value="${doc.id}">${escapeHtml(client.companyName)}</option>`;
        });
        
        select.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading clients for agreement:', error);
        select.innerHTML = '<option value="">Error loading clients</option>';
    }
}

// Attach event listeners for interactive features
function attachInteractiveFeatureListeners() {
    // Job management modal close buttons
    const closeJobModal = document.getElementById('close-job-modal');
    const jobModal = document.getElementById('job-management-modal');
    
    if (closeJobModal && jobModal) {
        closeJobModal.addEventListener('click', () => {
            jobModal.classList.add('hidden');
        });
        
        jobModal.addEventListener('click', (e) => {
            if (e.target === jobModal) {
                jobModal.classList.add('hidden');
            }
        });
    }
    
    // Service agreement modal close buttons
    const closeAgreementModal = document.getElementById('close-agreement-modal');
    const agreementModal = document.getElementById('service-agreement-modal');
    const cancelAgreement = document.getElementById('cancel-agreement');
    
    if (closeAgreementModal && agreementModal) {
        closeAgreementModal.addEventListener('click', () => {
            agreementModal.classList.add('hidden');
        });
        
        agreementModal.addEventListener('click', (e) => {
            if (e.target === agreementModal) {
                agreementModal.classList.add('hidden');
            }
        });
    }
    
    if (cancelAgreement && agreementModal) {
        cancelAgreement.addEventListener('click', () => {
            agreementModal.classList.add('hidden');
        });
    }
    
    // Service agreement form submission
    const agreementForm = document.getElementById('service-agreement-form');
    if (agreementForm) {
        agreementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const clientId = document.getElementById('agreement-client-select').value;
            const frequency = document.getElementById('agreement-frequency').value;
            const instructions = document.getElementById('agreement-instructions').value;
            
            const includedServices = [];
            document.querySelectorAll('#included-services-checkboxes input:checked').forEach(cb => {
                includedServices.push(cb.value);
            });
            
            if (!clientId) {
                showNotification('Please select a client', 'error');
                return;
            }
            
            try {
                await db.collection('serviceAgreements').add({
                    clientId: clientId,
                    frequency: frequency,
                    includedServices: includedServices,
                    specialInstructions: instructions,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    isActive: true
                });
                
                showNotification('Service agreement saved successfully', 'success');
                agreementModal.classList.add('hidden');
                agreementForm.reset();
                
            } catch (error) {
                console.error('Error saving service agreement:', error);
                showNotification(`Failed to save agreement: ${error.message}`, 'error');
            }
        });
    }
    
    // Refresh awaiting review button
    const refreshAwaitingReview = document.getElementById('refresh-awaiting-review');
    if (refreshAwaitingReview) {
        refreshAwaitingReview.addEventListener('click', () => {
            if (typeof fetchAndDisplayAwaitingReview === 'function') {
                fetchAndDisplayAwaitingReview();
            }
        });
    }
}

// Check and update in-progress jobs based on time and employee clock-ins
async function updateInProgressJobs() {
    try {
        if (!db) return;
        
        const now = new Date();
        const nowTimestamp = firebase.firestore.Timestamp.fromDate(now);
        
        // Find scheduled jobs that should be in progress based on time
        const scheduledJobsSnapshot = await db.collection('serviceHistory')
            .where('status', '==', 'Scheduled')
            .where('serviceDate', '<=', nowTimestamp)
            .get();
        
        const batch = db.batch();
        let updatedCount = 0;
        
        for (const doc of scheduledJobsSnapshot.docs) {
            const job = doc.data();
            const serviceDate = job.serviceDate.toDate();
            
            // Check if current time is within service window (assuming 4-hour window)
            const serviceEndTime = new Date(serviceDate.getTime() + (4 * 60 * 60 * 1000));
            
            if (now >= serviceDate && now <= serviceEndTime) {
                // Check if any employee is clocked in at this location
                const timeTrackingSnapshot = await db.collection('employeeTimeTracking')
                    .where('locationId', '==', job.locationId)
                    .where('status', '==', 'Clocked In')
                    .where('clockInTime', '>=', firebase.firestore.Timestamp.fromDate(new Date(serviceDate.getTime() - (60 * 60 * 1000)))) // 1 hour before
                    .get();
                
                if (!timeTrackingSnapshot.empty || now >= serviceDate) {
                    batch.update(doc.ref, {
                        status: 'In Progress',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    updatedCount++;
                }
            }
        }
        
        if (updatedCount > 0) {
            await batch.commit();
            console.log(`Updated ${updatedCount} jobs to "In Progress" status`);
            
            // Refresh dashboard if function exists
            if (typeof loadDashboardStats === 'function') {
                loadDashboardStats();
            }
        }
        
    } catch (error) {
        console.error('Error updating in-progress jobs:', error);
    }
}

// Run in-progress check every 5 minutes
setInterval(updateInProgressJobs, 5 * 60 * 1000);

// Make functions globally available
window.showJobsByStatus = showJobsByStatus;
window.updateJobStatus = updateJobStatus;
window.approveJobPhotos = approveJobPhotos;
window.editJobNotes = editJobNotes;
window.openServiceAgreementModal = openServiceAgreementModal;
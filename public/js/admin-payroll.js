// public/js/admin-payroll.js
document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG: Admin Payroll Page script running (admin-payroll.js v1.7 - Added Client Claim Verification).");

    // --- Get references to elements specific to admin-payroll.html ---
    const payrollLoadingEl = document.getElementById('payroll-loading-message');
    const payrollTableEl = document.getElementById('payroll-table');
    let payrollTableBodyEl = document.getElementById('payroll-table-body');
    const noPayrollEl = document.getElementById('no-payroll-message');
    const payrollActionMessageEl = document.getElementById('payroll-action-message');

    const addAdjustmentForm = document.getElementById('add-adjustment-form');
    const adjEmployeeSelect = document.getElementById('adj-employee-select');
    const adjPayPeriodIdInput = document.getElementById('adj-pay-period-id');
    const adjAmountInput = document.getElementById('adj-amount');
    const adjReasonInput = document.getElementById('adj-reason');
    const addAdjustmentMessageEl = document.getElementById('add-adjustment-message');

    // --- Global Variables for this script ---
    let currentUser = null;
    let db, auth, functions; 
    let serverTimestampFunction; 

    // --- Helper Functions ---
    function showGeneralMessage(el, message, type = 'info') {
        if (el) {
            el.textContent = message;
            el.className = `form-message ${type}`;
            el.style.display = message ? 'block' : 'none';
        }
        if (type === 'error') console.error("Message:", message);
        else console.log("Message (" + type + "):", message);
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatFirestoreTimestamp(timestamp, options) {
        if (!timestamp || typeof timestamp.toDate !== 'function') {
            return 'N/A';
        }
        try {
            const date = timestamp.toDate();
            const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
            const effectiveOptions = { ...defaultOptions, ...options };
            return date.toLocaleDateString(undefined, effectiveOptions);
        } catch (e) {
            console.error("Error formatting timestamp:", e);
            return 'Date Err';
        }
    }

    function formatCurrency(amount) {
        if (typeof amount === 'number') {
            return amount.toFixed(2);
        }
        return '0.00';
    }

    function setFormDisabled(form, disabled) {
        if (!form) return;
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => el.disabled = disabled);
    }

    // --- Firebase Initialization ---
    if (typeof firebase === 'undefined' || !firebase.app || !firebase.auth || !firebase.firestore || !firebase.functions) {
        console.error("CRITICAL ERROR: Firebase SDK (app, auth, firestore, functions) not loaded correctly on admin-payroll.html.");
        if (payrollLoadingEl) payrollLoadingEl.textContent = "Error: Firebase SDK failed to load.";
        return;
    }

    try {
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions(); 
        serverTimestampFunction = firebase.firestore.FieldValue.serverTimestamp; 
        console.log("DEBUG: Firebase services initialized for admin-payroll.js.");
    } catch (error) {
        console.error("DEBUG: Error initializing Firebase services in admin-payroll.js:", error);
        if (payrollLoadingEl) payrollLoadingEl.textContent = "Error initializing Firebase services.";
        return;
    }

    // --- Core Payroll Functions ---
    async function fetchAndDisplayPayrollRecords() { 
        console.log("DEBUG: Fetching payroll records..."); 
        if (!db) { 
            console.error("DB not initialized for fetchPayroll"); 
            if (payrollLoadingEl) payrollLoadingEl.textContent = "Error: DB not initialized.";
            return; 
        } 
        if (payrollLoadingEl) payrollLoadingEl.style.display = 'block'; 
        if (payrollTableEl) payrollTableEl.style.display = 'none'; 
        if (noPayrollEl) noPayrollEl.style.display = 'none'; 
        if (payrollTableBodyEl) payrollTableBodyEl.innerHTML = ''; 
        if (payrollActionMessageEl) showGeneralMessage(payrollActionMessageEl, '', 'info'); 

        try { 
            const snapshot = await db.collection('employeePayroll')
                .orderBy('payPeriodStartDate', 'desc')
                .orderBy('employeeName', 'asc')
                .get(); 

            if (payrollLoadingEl) payrollLoadingEl.style.display = 'none'; 

            if (snapshot.empty) { 
                if (noPayrollEl) noPayrollEl.style.display = 'block'; 
            } else { 
                let payrollHtml = ''; 
                snapshot.forEach(doc => { 
                    const payrollData = doc.data(); 
                    const payrollId = doc.id; 
                    const startDateStr = formatFirestoreTimestamp(payrollData.payPeriodStartDate) || 'N/A'; 
                    const endDateStr = formatFirestoreTimestamp(payrollData.payPeriodEndDate) || 'N/A'; 
                    const employeeName = payrollData.employeeName || payrollData.employeeId || 'N/A';
                    const totalEarnings = formatCurrency(payrollData.totalEarnings);
                    const status = payrollData.status || 'Unknown'; 
                    const isPaid = status === 'Paid';
                    
                    payrollHtml += `
                        <tr class="payroll-summary-row" data-payroll-id="${payrollId}">
                            <td>${escapeHtml(startDateStr)}</td>
                            <td>${escapeHtml(endDateStr)}</td>
                            <td>${escapeHtml(employeeName)}</td>
                            <td>$${escapeHtml(totalEarnings)}</td>
                            <td><span style="font-weight: bold; color: ${isPaid ? 'green' : 'orange'};">${escapeHtml(status)}</span></td>
                            <td>
                                ${!isPaid ? `<button class="action-button mark-payroll-paid-button" data-payroll-id="${payrollId}">Mark as Paid</button>` : '<span>-</span>'}
                            </td>
                            <td>
                                <button class="action-button view-payroll-details-button" data-payroll-id="${payrollId}">View Details</button>
                            </td>
                        </tr>`;
                    
                    payrollHtml += `
                        <tr class="payroll-details-row" id="details-${payrollId}">
                            <td colspan="7"> 
                                <div class="payroll-details-content">`;

                    if (payrollData.jobs && payrollData.jobs.length > 0) {
                        payrollHtml += `<h5>Job Details:</h5><ul>`;
                        payrollData.jobs.forEach(job => {
                            payrollHtml += `<li class="job-item">
                                <span class="label">Job:</span> ${escapeHtml(job.locationName || 'N/A')} on ${formatFirestoreTimestamp(job.serviceDate)}
                                <span class="label">Rate:</span> $${formatCurrency(job.rateApplied)}
                                <span class="label">Earnings:</span> $${formatCurrency(job.earnings)}
                                ${job.processedAt ? `<span class="label" style="font-size:0.8em; color:#777;">(Processed: ${formatFirestoreTimestamp(job.processedAt, {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'})})</span>` : ''}
                            </li>`;
                        });
                        payrollHtml += `</ul>`;
                    } else {
                        payrollHtml += `<p>No specific job details recorded for this period.</p>`;
                    }

                    if (payrollData.adjustments && payrollData.adjustments.length > 0) {
                        payrollHtml += `<h5>Adjustments:</h5><ul>`;
                        payrollData.adjustments.forEach(adj => {
                            payrollHtml += `<li class="adjustment-item">
                                <span class="label">Reason:</span> ${escapeHtml(adj.reason || 'N/A')}
                                <span class="label">Amount:</span> $${formatCurrency(adj.amount)}
                                ${adj.timestamp ? `<span class="label" style="font-size:0.8em; color:#777;">(Added: ${formatFirestoreTimestamp(adj.timestamp, {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'})})</span>` : ''}
                                ${adj.adminUid ? `<span class="label" style="font-size:0.8em; color:#777;">(By Admin: ...${adj.adminUid.slice(-4)})</span>` : ''}
                            </li>`;
                        });
                        payrollHtml += `</ul>`;
                    } else {
                        payrollHtml += `<p>No adjustments for this period.</p>`;
                    }
                                
                    payrollHtml += `</div></td></tr>`;
                }); 
                if (payrollTableBodyEl) payrollTableBodyEl.innerHTML = payrollHtml; 
                if (payrollTableEl) payrollTableEl.style.display = 'table'; 
                if (noPayrollEl) noPayrollEl.style.display = 'none'; 
            } 
        } catch (error) { 
            console.error("DEBUG: Error fetching payroll records:", error); 
            if (payrollLoadingEl) { 
                payrollLoadingEl.textContent = 'Error loading payroll records.'; 
                payrollLoadingEl.style.display = 'block'; 
                payrollLoadingEl.classList.add('error'); 
            } 
            if (noPayrollEl) { 
                noPayrollEl.textContent = 'Error loading records.'; 
                noPayrollEl.style.display = 'block'; 
            } 
            if (payrollTableEl) payrollTableEl.style.display = 'none'; 
        } 
    }

    async function handleMarkAsPaidClick(payrollDocId, buttonElement) { 
        console.log(`DEBUG: Mark as Paid clicked for Payroll ID: ${payrollDocId}`); 
        if (!db || !serverTimestampFunction) { 
            showGeneralMessage(payrollActionMessageEl, 'Error: Database connection or timestamp function lost.', 'error'); 
            return; 
        } 
        if (!confirm(`Are you sure you want to mark payroll record ${payrollDocId} as 'Paid'?`)) { 
            return; 
        } 
        if (buttonElement) buttonElement.disabled = true; 
        showGeneralMessage(payrollActionMessageEl, `Updating status for ${payrollDocId}...`, 'info'); 
        const payrollRef = db.collection('employeePayroll').doc(payrollDocId); 
        try { 
            await payrollRef.update({ 
                status: 'Paid', 
                paidDate: serverTimestampFunction(), 
                updatedAt: serverTimestampFunction()
            }); 
            console.log(`Successfully marked ${payrollDocId} as Paid.`); 
            showGeneralMessage(payrollActionMessageEl, `Record ${payrollDocId} marked as Paid successfully! Refreshing list...`, 'success'); 
            setTimeout(() => { 
                fetchAndDisplayPayrollRecords(); 
            }, 1500); 
        } catch (error) { 
            console.error(`Error updating payroll status for ${payrollDocId}:`, error); 
            showGeneralMessage(payrollActionMessageEl, `Error updating status for ${payrollDocId}: ${error.message}`, 'error'); 
            if (buttonElement) buttonElement.disabled = false; 
        } 
    }

    async function populateEmployeeDropdownForAdjustments() {
        console.log("DEBUG: Populating Adjustment Employee Dropdown");
        if (!db || !adjEmployeeSelect) {
            console.error("DB or adjEmployeeSelect missing for adjustments.");
            if (adjEmployeeSelect) adjEmployeeSelect.innerHTML = '<option value="">Error Loading</option>';
            return;
        }
        adjEmployeeSelect.disabled = true;
        adjEmployeeSelect.innerHTML = '<option value="">-- Loading Employees --</option>';
        try {
            const snapshot = await db.collection('employeeMasterList')
                .where('status', '==', true)
                .orderBy('lastName', 'asc')
                .orderBy('firstName', 'asc')
                .get();
            let optionsHtml = '<option value="">-- Select Employee --</option>';
            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    const emp = doc.data();
                    const name = `${emp.lastName || ''}, ${emp.firstName || ''}`.trim() || emp.employeeIdString || doc.id;
                    optionsHtml += `<option value="${doc.id}">${escapeHtml(name)}</option>`;
                });
            } else {
                optionsHtml = '<option value="">-- No Active Employees --</option>';
            }
            adjEmployeeSelect.innerHTML = optionsHtml;
        } catch (error) {
            console.error("Error populating adjustment employee dropdown:", error);
            adjEmployeeSelect.innerHTML = '<option value="">-- Error --</option>';
            showGeneralMessage(addAdjustmentMessageEl, "Error loading employees for dropdown.", 'error');
        } finally {
            adjEmployeeSelect.disabled = false;
        }
    }

    async function handleAddAdjustmentSubmit(event) {
        event.preventDefault();
        console.log("DEBUG: Add Adjustment Form Submitted");

        if (!auth || !auth.currentUser || !functions) {
            showGeneralMessage(addAdjustmentMessageEl, "Error: Firebase not ready or user not logged in.", "error");
            return;
        }

        const employeeId = adjEmployeeSelect.value;
        const payPeriodId = adjPayPeriodIdInput.value.trim();
        const amountStr = adjAmountInput.value;
        const reason = adjReasonInput.value.trim();

        if (!employeeId || !payPeriodId || amountStr.trim() === '' || !reason) {
            showGeneralMessage(addAdjustmentMessageEl, "Employee, Pay Period ID, Amount, and Reason are required.", "error");
            return;
        }

        const amount = parseFloat(amountStr);
        if (isNaN(amount)) {
            showGeneralMessage(addAdjustmentMessageEl, "Adjustment amount must be a valid number.", "error");
            return;
        }

        setFormDisabled(addAdjustmentForm, true);
        showGeneralMessage(addAdjustmentMessageEl, "Adding adjustment...", "info");

        // ===== VERIFY ADMIN CLAIM CLIENT-SIDE =====
        try {
            const idTokenResult = await auth.currentUser.getIdTokenResult(true); // true forces a refresh
            console.log("Current user's custom claims from client-side:", idTokenResult.claims); // Log the claims
            if (idTokenResult.claims.admin !== true) {
                showGeneralMessage(addAdjustmentMessageEl, "Client-side check: User does not have admin claim. Please re-login or contact support if this persists.", "error");
                setFormDisabled(addAdjustmentForm, false);
                return; 
            }
        } catch (tokenError) {
            console.error("Error fetching ID token result on client:", tokenError);
            showGeneralMessage(addAdjustmentMessageEl, "Error verifying admin status on client. Please try again.", "error");
            setFormDisabled(addAdjustmentForm, false);
            return;
        }
        // ===== END VERIFY ADMIN CLAIM =====

        try {
            const addAdjustmentCallable = functions.httpsCallable('addPayrollAdjustment'); 
            
            const payload = {
                employeeId: employeeId,
                payPeriodId: payPeriodId,
                amount: amount,
                reason: reason
            };
            console.log("DEBUG: Calling addPayrollAdjustment Cloud Function with payload:", payload);

            const result = await addAdjustmentCallable(payload);
            
            console.log("DEBUG: addPayrollAdjustment function result:", result);
            if (result.data && result.data.success) {
                showGeneralMessage(addAdjustmentMessageEl, result.data.message || "Adjustment added successfully!", "success");
                addAdjustmentForm.reset();
                fetchAndDisplayPayrollRecords(); 
            } else {
                const funcErrorMsg = result.data && result.data.error ? result.data.error : (result.data && result.data.message ? result.data.message : "Failed to add adjustment.");
                throw new Error(funcErrorMsg);
            }
        } catch (error) {
            console.error("DEBUG: Error calling addPayrollAdjustment function:", error);
            const errorMessage = error.message || "Could not add adjustment. Check function logs for details.";
            showGeneralMessage(addAdjustmentMessageEl, `Error: ${errorMessage}`, "error");
        } finally {
            setFormDisabled(addAdjustmentForm, false);
        }
    }

    function setupPayrollPageListeners() {
        if (payrollTableBodyEl) {
            const newPayrollTableBodyEl = payrollTableBodyEl.cloneNode(false); 
            payrollTableBodyEl.parentNode.replaceChild(newPayrollTableBodyEl, payrollTableBodyEl);
            payrollTableBodyEl = newPayrollTableBodyEl;

            payrollTableBodyEl.addEventListener('click', (event) => {
                const targetButton = event.target.closest('button.action-button');
                if (!targetButton) return;
                const payrollId = targetButton.getAttribute('data-payroll-id');

                if (targetButton.classList.contains('mark-payroll-paid-button')) {
                    if (payrollId) handleMarkAsPaidClick(payrollId, targetButton);
                } else if (targetButton.classList.contains('view-payroll-details-button')) {
                    if (payrollId) {
                        const detailsRow = document.getElementById(`details-${payrollId}`);
                        if (detailsRow) {
                            detailsRow.classList.toggle('visible');
                            targetButton.textContent = detailsRow.classList.contains('visible') ? 'Hide Details' : 'View Details';
                        }
                    }
                }
            });
            console.log("DEBUG: Delegated listener attached to payroll table body for actions.");
        } else {
            console.warn("DEBUG: payrollTableBodyEl not found for listener setup.");
        }

        if (addAdjustmentForm) {
            addAdjustmentForm.addEventListener('submit', handleAddAdjustmentSubmit);
            console.log("DEBUG: Listener attached to add adjustment form.");
        } else {
            console.warn("DEBUG: Add adjustment form not found.");
        }
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            console.log("DEBUG: Admin Payroll Page - User authenticated:", user.uid);
            
            user.getIdTokenResult().then(idTokenResult => {
                const claims = idTokenResult.claims;
                console.log("DEBUG APR: User claims:", claims);
                
                // Attempt to get Firestore user document for role verification, but proceed if claims are sufficient
                db.collection('users').doc(user.uid).get()
                    .then(docSnapshot => {
                        let userData = null;
                        if (docSnapshot.exists) {
                            userData = docSnapshot.data();
                            console.log("DEBUG APR: User document data from Firestore:", userData);
                        } else {
                            console.warn("DEBUG APR: User document not found in Firestore for UID:", user.uid);
                        }

                        // Check for admin privileges based on claims OR Firestore role
                        const isAdminByClaims = claims && (claims.admin === true || claims.super_admin === true || claims.standard_admin === true);
                        const isAdminByRole = userData && (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'standard_admin');

                        if (isAdminByClaims || isAdminByRole) {
                            console.log("DEBUG APR: Admin access confirmed for Payroll Page.");
                            fetchAndDisplayPayrollRecords();
                            populateEmployeeDropdownForAdjustments(); 
                            setupPayrollPageListeners();
                        } else {
                            console.error("DEBUG APR: Access denied. User does not have sufficient admin claims or role. Redirecting.");
                            window.location.assign('/');
                        }
                    })
                    .catch(error => { 
                        console.error("DEBUG APR: Error fetching user data from Firestore:", error);
                        // Allow access if claims are sufficient, even if Firestore doc fails, but log error
                        const isAdminByClaimsOnly = claims && (claims.admin === true || claims.super_admin === true || claims.standard_admin === true);
                        if(isAdminByClaimsOnly) {
                            console.warn("DEBUG APR: Proceeding with admin access based on claims despite Firestore user doc error.");
                            fetchAndDisplayPayrollRecords();
                            populateEmployeeDropdownForAdjustments(); 
                            setupPayrollPageListeners();
                        } else {
                            window.location.assign('/');
                        }
                    });
            }).catch(error => {
                console.error("DEBUG APR: Error fetching ID token result:", error);
                window.location.assign('/');
            });
        } else {
            console.log("DEBUG: Admin Payroll Page - No user signed in. Redirecting to login.");
            window.location.assign('/'); 
        }
    });

    console.log("DEBUG: Admin Payroll Page script finished initial setup.");
    
    // Expose functions globally for access from other scripts
    window.populateEmployeeDropdownForAdjustments = populateEmployeeDropdownForAdjustments;
});

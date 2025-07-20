// public/employee/js/employee-portal.js
// V6 - Added General Job Notes functionality - May 20, 2025

// Add navigation functionality at the beginning of the file

let currentView = 'dashboard';

// Navigation function
function showView(viewName) {
    console.log(`DEBUG EMP: Switching to view: ${viewName}`);
    
    // Hide all views
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show selected view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.remove('hidden');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        item.classList.add('text-muted-foreground', 'hover:bg-secondary');
        item.classList.remove('bg-primary', 'text-primary-foreground');
    });
    
    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
        activeNav.classList.add('active');
        activeNav.classList.remove('text-muted-foreground', 'hover:bg-secondary');
        activeNav.classList.add('bg-primary', 'text-primary-foreground');
    }
    
    currentView = viewName;
    
    // Re-initialize icons after view change
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Update dashboard stats
function updateDashboardStats() {
    // Update clock status in dashboard
    const dashboardClockStatus = document.getElementById('dashboard-clock-status');
    const dashboardClockIndicator = document.getElementById('dashboard-clock-indicator');
    const clockStatus = document.getElementById('clock-status');
    
    if (dashboardClockStatus && clockStatus) {
        dashboardClockStatus.textContent = clockStatus.textContent;
    }
    
    if (dashboardClockIndicator) {
        const clockIndicator = document.getElementById('clock-status-indicator');
        if (clockIndicator) {
            dashboardClockIndicator.className = clockIndicator.className;
        }
    }
    
    // Update location in dashboard
    const dashboardLocation = document.getElementById('dashboard-location');
    const locationSelect = document.getElementById('location-select-input');
    if (dashboardLocation && locationSelect && locationSelect.value) {
        const selectedOption = locationSelect.options[locationSelect.selectedIndex];
        dashboardLocation.textContent = selectedOption.text;
    }
    
    // Update photos count
    const dashboardPhotosCount = document.getElementById('dashboard-photos-count');
    const photosContainer = document.getElementById('my-uploaded-photos-container');
    if (dashboardPhotosCount && photosContainer) {
        const photoCount = photosContainer.children.length;
        dashboardPhotosCount.textContent = photoCount + ' photos';
    }
}

// Make showView globally available
window.showView = showView;

// Add to existing auth state handler - update employee name in sidebar
function updateEmployeeName(name) {
    const sidebarName = document.getElementById('employee-name-sidebar');
    if (sidebarName) {
        sidebarName.textContent = name;
    }
}

// Add navigation listeners
function setupNavigation() {
    const navItems = [
        { id: 'nav-dashboard', view: 'dashboard' },
        { id: 'nav-clock', view: 'clock' },
        { id: 'nav-photos', view: 'photos' },
        { id: 'nav-uploads', view: 'uploads' },
        { id: 'nav-notes', view: 'notes' },
        { id: 'nav-payroll', view: 'payroll' },
        { id: 'nav-settings', view: 'settings' }
    ];
    
    navItems.forEach(({ id, view }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', () => showView(view));
        }
    });
}

// Call setupNavigation after other listeners are attached

document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG EMP: Employee Dashboard script running (V6 - General Job Notes).");

    // --- Firebase App Initialization ---
    if (typeof firebase === 'undefined' || !firebase.app || !firebase.auth || !firebase.firestore || !firebase.storage) {
        console.error("CRITICAL EMP: Firebase SDKs not fully loaded or Firebase app not initialized.");
        if(document.getElementById('employee-dashboard-content')) {
            document.getElementById('employee-dashboard-content').innerHTML = '<p class="ccs-status-msg ccs-error">Critical Error: Firebase services not available. Please contact support.</p>';
            document.getElementById('employee-dashboard-content').style.display = 'block';
        }
        return;
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();
    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
    const GeoPoint = firebase.firestore.GeoPoint;

    // --- Element References ---
    const welcomeMessageEl = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const dashboardContentEl = document.getElementById('employee-dashboard-content');
    const clockStatusEl = document.getElementById('clock-status');
    const clockInButton = document.getElementById('clock-in-button');
    const clockOutButton = document.getElementById('clock-out-button');
    const clockMessageEl = document.getElementById('clock-message');
    const locationSelectInput = document.getElementById('location-select-input');
    const cameraInput = document.getElementById('camera-input');
    const galleryInput = document.getElementById('gallery-input');
    const selectedFilesDisplayEl = document.getElementById('selected-files-display');
    const photoUploadNotesTextarea = document.getElementById('photo-upload-notes');
    const uploadButton = document.getElementById('upload-button');
    const uploadProgressEl = document.getElementById('upload-progress');
    const uploadMessageEl = document.getElementById('upload-message');
    const payrollLoadingMessageEl = document.getElementById('payroll-loading-message');
    const payrollCardsContainer = document.getElementById('payroll-cards-container');
    const noPayrollMessageEl = document.getElementById('no-payroll-message');
    const clockStatusIndicator = document.getElementById('clock-status-indicator');
    const changePasswordForm = document.getElementById('change-password-form');
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const passwordMessageEl = document.getElementById('password-message');
    const myUploadsLoadingMessage = document.getElementById('my-uploads-loading-message');
    const noMyUploadsMessage = document.getElementById('no-my-uploads-message');
    const myUploadedPhotosContainer = document.getElementById('my-uploaded-photos-container');

    // NEW Element References for General Job Notes
    const generalJobNotesTextarea = document.getElementById('general-job-notes-textarea');
    const saveJobNotesButton = document.getElementById('save-job-notes-button');
    const jobNotesMessageEl = document.getElementById('job-notes-message');
   
    // ADDED: Element Reference for Admin Portal Link
    const goToAdminPortalLink = document.getElementById('go-to-admin-portal-link');
   
    // --- Global Variables ---
    let currentEmployeeProfileId = null;
    let currentEmployeeName = null;
    let activeTimeEntryId = null;
    let currentUserId = null; 
    let currentUser = null;   
    let filesToUpload = []; 

    console.log("DEBUG EMP: Firebase service variables initialized. Setting up auth listener...");

    // --- Helper Functions ---
    function redirectToLogin(m){ console.error("DEBUG EMP: Redirecting to login:", m); if(!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('/index.html')) { try{window.location.assign('/index.html');}catch(e){console.error("Redirect failed:",e);} } }
    function showClockMessage(m,t='info'){if(clockMessageEl){clockMessageEl.textContent=m; clockMessageEl.className=t; clockMessageEl.style.display = m ? 'block' : 'none';}if(t==='error')console.error("EMP Clock Msg:",m);else console.log(`EMP Clock Msg (${t}): ${m}`);}
    function showUploadMessage(m,t='info'){if(uploadMessageEl){uploadMessageEl.textContent=m; uploadMessageEl.className=t; uploadMessageEl.style.display = m ? 'block' : 'none';}if(t==='error')console.error("EMP Upload Msg:",m);else console.log(`EMP Upload Msg (${t}): ${m}`);}
    function showPasswordMessage(m,t='error'){if(passwordMessageEl){passwordMessageEl.textContent=m;passwordMessageEl.className=`form-message ${t}`; passwordMessageEl.style.display = m ? 'block' : 'none';}}
    function showJobNotesMessage(m,t='info'){if(jobNotesMessageEl){jobNotesMessageEl.textContent=m; jobNotesMessageEl.className=`form-message ${t}`; jobNotesMessageEl.style.display = m ? 'block' : 'none';}if(t==='error')console.error("EMP Job Notes Msg:",m);else console.log(`EMP Job Notes Msg (${t}): ${m}`);}
   
    function updateClockStatus(status) {
        console.log(`DEBUG EMP: updateClockStatus called with status: ${status}`);
        if (clockStatusEl) clockStatusEl.textContent = status;
        
        // Update status indicator color
        const clockStatusIndicator = document.getElementById('clock-status-indicator');
        if (clockStatusIndicator) {
            if (status.toLowerCase().includes('clocked in')) {
                clockStatusIndicator.className = 'h-3 w-3 rounded-full bg-green-500';
            } else if (status.toLowerCase().includes('clocked out')) {
                clockStatusIndicator.className = 'h-3 w-3 rounded-full bg-red-500';
            } else {
                clockStatusIndicator.className = 'h-3 w-3 rounded-full bg-gray-400';
            }
        }
    }

    function updateClockUI(isClockedIn, statusText = "Loading...") {
        try {
            updateClockStatus(statusText);
            if(clockInButton) {
                if (isClockedIn) {
                    clockInButton.classList.add('hidden');
                } else {
                    clockInButton.classList.remove('hidden');
                }
            }
            if(clockOutButton) {
                if (isClockedIn) {
                    clockOutButton.classList.remove('hidden');
                } else {
                    clockOutButton.classList.add('hidden');
                }
            }
            if(clockMessageEl && !clockMessageEl.classList.contains('error') && !clockMessageEl.classList.contains('success')) {
                 clockMessageEl.textContent = '';
            }
            setClockButtonsDisabled(false); 
            if(locationSelectInput) locationSelectInput.disabled = isClockedIn;
        } catch (uiError) { console.error("Error in updateClockUI:", uiError); }
    }
    function setClockButtonsDisabled(d){
        if(clockInButton)clockInButton.disabled=d;
        if(clockOutButton)clockOutButton.disabled=d;
    }
    function setUploadButtonDisabled(d){
        if(uploadButton)uploadButton.disabled=d;
        if(cameraInput)cameraInput.disabled=d;
        if(galleryInput)galleryInput.disabled=d;
        const labels = document.querySelectorAll('#upload-section label.action-button');
        labels.forEach(label => { if(d) { label.style.opacity = '0.5'; label.style.cursor = 'not-allowed'; } else { label.style.opacity = '1'; label.style.cursor = 'pointer'; } });
    }
    function setFormDisabled(form, disabled){if(!form)return; const buttons=form.querySelectorAll('button'); buttons.forEach(b=>b.disabled=disabled);}
    function formatFirestoreTimestamp(t,o={month:'short',day:'numeric',year:'numeric', hour:'numeric', minute:'2-digit'}){if(t&&typeof t.toDate==='function'){try{return t.toDate().toLocaleString('en-US',o);}catch(e){console.error("Err format TS:",e); return 'Date Err';}}return'N/A';}
    function formatCurrency(a){if(typeof a==='number'){return a.toLocaleString('en-US',{style:'currency',currency:'USD'});}return'N/A';}
    function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

    function populateLocationDropdown() {
        if (!db || !locationSelectInput) { console.error("DEBUG EMP: Cannot populate locations - DB or Select Input missing."); if(locationSelectInput) locationSelectInput.innerHTML = '<option value="">Error loading locations</option>'; return; }
        locationSelectInput.disabled = true; locationSelectInput.innerHTML = '<option value="">-- Loading Locations --</option>';
        db.collection('locations').where('status', '==', true).orderBy('locationName', 'asc').get()
          .then(snapshot => {
              if (snapshot.empty) { if(locationSelectInput) locationSelectInput.innerHTML = '<option value="">-- No active locations --</option>'; return; }
              let optionsHtml = '<option value="">-- Select a Location --</option>';
              snapshot.forEach(doc => {
                  const loc = doc.data();
                  optionsHtml += `<option value="${doc.id}">${escapeHtml(loc.locationName || 'Unnamed')} (${escapeHtml(loc.clientName || 'N/A')})</option>`;
              });
              if (locationSelectInput) locationSelectInput.innerHTML = optionsHtml;
          })
          .catch(error => { if(locationSelectInput) locationSelectInput.innerHTML = '<option value="">Error loading</option>'; showUploadMessage("Error loading locations.", 'error'); })
          .finally(() => { 
              const isClockedIn = clockOutButton && !clockOutButton.classList.contains('hidden') && !clockOutButton.disabled; 
              if(locationSelectInput) locationSelectInput.disabled = isClockedIn; 
            });
    }

    async function compressImage(file) {
        if (!file.type.startsWith('image/')) return file;
        showUploadMessage(`Processing ${file.name}...`, 'info');
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.7 };
        try {
            if (typeof imageCompression !== 'function') {
                showUploadMessage("Image library error. Uploading original.", "warning"); return file;
            }
            const compressedFile = await imageCompression(file, options);
            console.log(`DEBUG EMP: Compressed ${file.name} from ${(file.size/1024/1024).toFixed(2)}MB to ${(compressedFile.size/1024/1024).toFixed(2)}MB`);
            return compressedFile;
        } catch (error) {
            showUploadMessage(`Compression error for ${file.name}. Uploading original.`, 'warning'); return file;
        }
    }

    async function handleFileSelection(e) {
        if (!e.target || !e.target.files) return; 
        const newFiles = Array.from(e.target.files); 
        if (newFiles.length === 0) return;
        showUploadMessage(`Processing ${newFiles.length} file(s)...`, 'info');
        setUploadButtonDisabled(true); 
        const processedFiles = [];
        for (const file of newFiles) {
            try {
                processedFiles.push(await compressImage(file));
            } catch (error) {
                processedFiles.push(file); 
                showUploadMessage(`Error processing ${file.name}. Original will be used.`, 'warning');
            }
        }
        filesToUpload = filesToUpload.concat(processedFiles);
        if (selectedFilesDisplayEl) { 
            selectedFilesDisplayEl.textContent = `Selected (${filesToUpload.length}): ${filesToUpload.map(f => escapeHtml(f.name)).join(', ')}`; 
        }
        e.target.value = null; 
        showUploadMessage(filesToUpload.length > 0 ? `${filesToUpload.length} file(s) ready.` : 'No files processed.', 'info');
        setUploadButtonDisabled(filesToUpload.length === 0);
    }

    function handleLogout() { auth.signOut().then(() => redirectToLogin("User signed out.")).catch(e => console.error("Sign out error", e)); }

    function handleClockIn() {
        if (!currentEmployeeProfileId || !db || !serverTimestamp || !locationSelectInput || !GeoPoint) { showClockMessage("System error.", 'error'); return; }
        const selectedLocationId = locationSelectInput.value;
        if (!selectedLocationId) { showClockMessage("Please select a location.", 'error'); return; }
        setClockButtonsDisabled(true); showClockMessage("Getting location & clocking in...", 'info');
        navigator.geolocation.getCurrentPosition(
            (position) => addTimeEntry({ clockInCoordinates: new GeoPoint(position.coords.latitude, position.coords.longitude), locationId: selectedLocationId }),
            (error) => { showClockMessage("Location not found. Clocking in without coordinates...", 'warning'); addTimeEntry({ clockInCoordinates: null, locationId: selectedLocationId }); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    function addTimeEntry(data) {
        const timeEntryData = {
            employeeProfileId: currentEmployeeProfileId, locationId: data.locationId, clockInTime: serverTimestamp(),
            clockOutTime: null, status: "Clocked In", clockInCoordinates: data.clockInCoordinates,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        };
        db.collection('employeeTimeTracking').add(timeEntryData)
        .then(d => {
            activeTimeEntryId = d.id; // Store the active time entry ID
            const locText = locationSelectInput.options[locationSelectInput.selectedIndex]?.text || 'Selected Location';
            updateClockUI(true, `Clocked In @ ${locText} since ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`);
            showClockMessage("Clocked In!", 'success');
        })
        .catch(e => { showClockMessage("Error clocking in.", 'error'); setClockButtonsDisabled(false); if(locationSelectInput) locationSelectInput.disabled = false; });
    }

    function handleClockOut() {
        if (!activeTimeEntryId || !db || !serverTimestamp || !GeoPoint) { showClockMessage("Error: No active clock-in or system error.", 'error'); return; }
        setClockButtonsDisabled(true); showClockMessage("Getting location & clocking out...", 'info');
        navigator.geolocation.getCurrentPosition(
            (position) => updateTimeEntry({ clockOutCoordinates: new GeoPoint(position.coords.latitude, position.coords.longitude) }),
            (error) => { showClockMessage("Location not found. Clocking out without coordinates...", 'warning'); updateTimeEntry({ clockOutCoordinates: null }); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    function updateTimeEntry(data) {
        const updateData = {
            clockOutTime: serverTimestamp(), status: "Clocked Out",
            clockOutCoordinates: data.clockOutCoordinates, updatedAt: serverTimestamp()
        };
        db.collection('employeeTimeTracking').doc(activeTimeEntryId).update(updateData)
        .then(() => {
            activeTimeEntryId = null; // Clear active time entry ID after clock out
            updateClockUI(false, "Clocked Out");
            showClockMessage("Clocked Out!", 'success');
            if(locationSelectInput) locationSelectInput.disabled = false;
        })
        .catch(e => { showClockMessage("Error clocking out.", 'error'); setClockButtonsDisabled(false); });
    }

    async function handleUpload() {
        if (!db || !storage || !serverTimestamp || !locationSelectInput || !currentUser || !currentUserId || !currentEmployeeProfileId) { 
            showUploadMessage("System error or user data missing. Please refresh.", "error"); return; 
        }
        const files = filesToUpload; 
        const selectedLocationId = locationSelectInput.value; 
        const selectedLocationName = locationSelectInput.options[locationSelectInput.selectedIndex]?.text?.replace(/ *\([^)]*\) */g, "").trim() || 'Unknown Location';
        const photoNotes = photoUploadNotesTextarea ? photoUploadNotesTextarea.value.trim() : null;

        if (!files || files.length === 0) { showUploadMessage("No photos selected.", 'error'); return; } 
        if (!selectedLocationId) { showUploadMessage("Please select a Location.", 'error'); return; }

        setUploadButtonDisabled(true); showUploadMessage(`Uploading ${files.length} file(s)...`, 'info'); 
        if (uploadProgressEl) uploadProgressEl.textContent = '';

        let uploadPromises = [];
        files.forEach((file, i) => {
            const timestamp = Date.now(); 
            const originalNameParts = file.name.split('.');
            const extension = originalNameParts.length > 1 ? originalNameParts.pop().toLowerCase() : 'jpg';
            const baseName = originalNameParts.join('.');
            const uniqueFileName = `${timestamp}_${baseName.replace(/[^a-zA-Z0-9._-]/g, '_')}.${extension}`;
            const storagePath = `employeeUploads/${currentUserId}/${uniqueFileName}`; 
            const storageRef = storage.ref(storagePath); 
            const uploadTask = storageRef.put(file); 
            uploadPromises.push(new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => { 
                        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100); 
                        if (uploadProgressEl) uploadProgressEl.textContent = `File ${i + 1}/${files.length}: ${progress}%`;
                    },
                    (error) => reject({ file: file.name, error: error }),
                    () => { uploadTask.snapshot.ref.getDownloadURL().then(url => resolve({url: url, originalName: file.name})).catch(reject); }
                );
            }));
        });

        let successfulUploadsCount = 0;
        Promise.allSettled(uploadPromises)
        .then(results => {
            const successfulUploads = results.filter(r => r.status === 'fulfilled').map(r => r.value);
            successfulUploadsCount = successfulUploads.length;
            const failedUploads = results.filter(r => r.status === 'rejected').map(r => r.reason);
            if (failedUploads.length > 0) {
                showUploadMessage(`Error uploading some files. Successful ones will be saved.`, 'warning');
            }
            if (successfulUploads.length === 0 && files.length > 0) throw new Error("All photo uploads failed.");
            if (successfulUploads.length === 0) {
                if(files.length > 0 && failedUploads.length === files.length) {} else { showUploadMessage("No photos successfully uploaded.", "info"); }
                return Promise.resolve([]); 
            }
            showUploadMessage(`Uploads complete (${successfulUploads.length}/${files.length}). Saving...`, 'info');
            const firestoreWritePromises = successfulUploads.map(uploadResult => {
                const photoData = { 
                    photoUrl: uploadResult.url, originalFileName: uploadResult.originalName,
                    locationId: selectedLocationId, locationName: selectedLocationName, 
                    employeeProfileId: currentEmployeeProfileId, employeeName: currentEmployeeName || 'Unknown', 
                    uploadedAt: serverTimestamp(), timeEntryId: activeTimeEntryId || null, 
                    notes: photoNotes || null 
                };
                // Assuming you have corrected the photoMetadata to photoData here if it was a typo before
                console.log("DEBUG EMP: Saving photo metadata to Firestore:", photoData); 
                return db.collection('servicePhotos').add(photoData);
            });
            return Promise.all(firestoreWritePromises);
        })
        .then((firestoreResults) => {
            if (firestoreResults && firestoreResults.length > 0) { 
                showUploadMessage(`${firestoreResults.length} photo(s) uploaded & details saved!`, 'success');
                if (photoUploadNotesTextarea) photoUploadNotesTextarea.value = ''; 
                fetchAndDisplayMyUploadedPhotos(); // Auto-refresh list
            } else if (filesToUpload.length > 0 && successfulUploadsCount > 0) {
                showUploadMessage("Photos uploaded but details may not have all saved.", 'warning');
                fetchAndDisplayMyUploadedPhotos(); // Auto-refresh list
            }
        })
        .catch(err => {
             showUploadMessage("Error: " + (err.message || "Upload/save process failed."), 'error');
             console.error("Upload/Save Error:", err);
        })
        .finally(() => {
            filesToUpload = []; 
            if (selectedFilesDisplayEl) selectedFilesDisplayEl.textContent = ''; 
            if (uploadProgressEl) uploadProgressEl.textContent = ''; 
            setUploadButtonDisabled(false);
            setTimeout(() => { if (uploadMessageEl && !uploadMessageEl.classList.contains('error')) { showUploadMessage('', 'info'); } }, 7000);
        });
    }

    function handleChangePassword(e) {
        e.preventDefault(); 
        if (!auth || !currentUser || !currentPasswordInput || !newPasswordInput || !confirmPasswordInput) { showPasswordMessage("System error.", "error"); return; }
        const cP=currentPasswordInput.value;const nP=newPasswordInput.value;const confP=confirmPasswordInput.value;
        if(!cP||!nP||!confP){showPasswordMessage("All fields required.","error");return;}
        if(nP.length<6){showPasswordMessage("New password too short (min 6 chars).","error");return;}
        if(nP!==confP){showPasswordMessage("New passwords do not match.","error");return;}
        setFormDisabled(changePasswordForm,true);showPasswordMessage("Updating...","info");
        const cred=firebase.auth.EmailAuthProvider.credential(currentUser.email,cP);
        currentUser.reauthenticateWithCredential(cred)
          .then(()=>currentUser.updatePassword(nP))
          .then(()=>{showPasswordMessage("Password updated!","success");if(changePasswordForm)changePasswordForm.reset();})
          .catch(err=>{
              if(err.code==='auth/wrong-password'){showPasswordMessage("Incorrect current password.","error");}
              else if(err.code==='auth/weak-password'){showPasswordMessage("New password is too weak.","error");}
              else{showPasswordMessage("Error updating password: " + err.message,"error");}
              console.error("EMP PW Change Error:", err);
          })
          .finally(()=>setFormDisabled(changePasswordForm,false));
    }

    function checkClockStatus() {
        if (!currentEmployeeProfileId || !db) return; 
        updateClockUI(false, "Checking status...");
        db.collection('employeeTimeTracking').where('employeeProfileId','==',currentEmployeeProfileId).where('clockOutTime','==',null).orderBy('clockInTime','desc').limit(1).get()
          .then((querySnapshot) => {
              if (!querySnapshot.empty) { 
                const d=querySnapshot.docs[0]; activeTimeEntryId=d.id; const tData = d.data();
                const t=tData.clockInTime.toDate();
                db.collection('locations').doc(tData.locationId).get().then(locDoc => {
                    const locName = locDoc.exists ? (locDoc.data().locationName || 'Unknown') : 'Unknown';
                    const clientName = locDoc.exists ? (locDoc.data().clientName || '') : '';
                    updateClockUI(true,`Clocked In @ ${locName} (${clientName}) since ${t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`);
                    if (locationSelectInput) locationSelectInput.value = tData.locationId;
                }).catch(() => updateClockUI(true, `Clocked In since ${t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`));
              } else { activeTimeEntryId=null; updateClockUI(false,"Clocked Out"); }
          }).catch(e=>{ showClockMessage("Error checking status.",'error'); updateClockUI(false, "Error Checking Status"); });
    }

    function fetchPayrollData() {
        if (!currentEmployeeProfileId || !db) return; 
        if (payrollLoadingMessageEl) payrollLoadingMessageEl.classList.remove('hidden');
        if (payrollCardsContainer) payrollCardsContainer.classList.add('hidden');
        if (noPayrollMessageEl) noPayrollMessageEl.classList.add('hidden');
        if (payrollCardsContainer) payrollCardsContainer.innerHTML = '';
        
        db.collection('employeePayroll').where('employeeProfileId', '==', currentEmployeeProfileId).orderBy('paymentDate', 'desc').limit(10).get()
          .then(payrollSnapshot => {
              if (payrollLoadingMessageEl) payrollLoadingMessageEl.classList.add('hidden');
              if (payrollSnapshot.empty) { 
                  if (noPayrollMessageEl) noPayrollMessageEl.classList.remove('hidden');
              } else { 
                  let payrollHtml = '';
                  payrollSnapshot.forEach(payrollDoc => {
                      const data = payrollDoc.data(); 
                      const payPeriod = `${formatFirestoreTimestamp(data.payPeriodStartDate)} - ${formatFirestoreTimestamp(data.payPeriodEndDate)}`;
                      const paymentDate = formatFirestoreTimestamp(data.paymentDate);
                      const netPay = formatCurrency(data.netPay);
                      const status = escapeHtml(data.status || 'Processing');
                      
                      const statusBadgeClass = status === 'Paid' ? 'bg-green-100 text-green-800' :
                                              status === 'Processing' ? 'bg-yellow-100 text-yellow-800' :
                                              'bg-gray-100 text-gray-800';
                      
                      payrollHtml += `
                          <div class="bg-white border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                              <div class="flex justify-between items-start mb-3">
                                  <div>
                                      <h4 class="font-semibold text-foreground">${payPeriod}</h4>
                                      <p class="text-sm text-muted-foreground">Pay Period</p>
                                  </div>
                                  <span class="px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClass}">${status}</span>
                              </div>
                              <div class="space-y-2 text-sm">
                                  <div class="flex items-center justify-between">
                                      <div class="flex items-center gap-2">
                                          <i data-lucide="calendar" class="h-4 w-4 text-muted-foreground"></i>
                                          <span class="text-muted-foreground">Payment Date:</span>
                                      </div>
                                      <span class="font-medium">${paymentDate}</span>
                                  </div>
                                  <div class="flex items-center justify-between">
                                      <div class="flex items-center gap-2">
                                          <i data-lucide="dollar-sign" class="h-4 w-4 text-muted-foreground"></i>
                                          <span class="text-muted-foreground">Net Pay:</span>
                                      </div>
                                      <span class="font-medium text-green-600">${netPay}</span>
                                  </div>
                              </div>
                          </div>
                      `;
                  });
                  if (noPayrollMessageEl) noPayrollMessageEl.classList.add('hidden'); 
                  if (payrollCardsContainer) {
                      payrollCardsContainer.innerHTML = payrollHtml; 
                      payrollCardsContainer.classList.remove('hidden');
                      // Re-initialize Lucide icons for the new payroll cards
                      if (typeof lucide !== 'undefined') lucide.createIcons();
                  }
              }
          }).catch(error => { 
              if (payrollLoadingMessageEl) payrollLoadingMessageEl.classList.add('hidden');
              if (noPayrollMessageEl) {
                  noPayrollMessageEl.innerHTML = `
                      <i data-lucide="alert-circle" class="h-12 w-12 text-red-500 mx-auto mb-3"></i>
                      <p class="text-red-600">Error loading payroll: ${error.message}</p>
                  `;
                  noPayrollMessageEl.classList.remove('hidden');
                  if (typeof lucide !== 'undefined') lucide.createIcons();
              }
          });
    }

    async function fetchAndDisplayMyUploadedPhotos() {
        if (!currentEmployeeProfileId || !db) {
            console.log("DEBUG EMP: Cannot fetch 'My Uploads' - Employee ID or DB missing.");
            if (myUploadsLoadingMessage) myUploadsLoadingMessage.classList.add('hidden');
            if (noMyUploadsMessage) {
                noMyUploadsMessage.textContent = "Could not load your uploads: User information missing.";
                noMyUploadsMessage.classList.remove('hidden');
            }
            return;
        }
        console.log("DEBUG EMP: Fetching 'My Recent Uploads (Today)' for employee:", currentEmployeeProfileId);

        if (myUploadsLoadingMessage) myUploadsLoadingMessage.classList.remove('hidden');
        if (noMyUploadsMessage) noMyUploadsMessage.classList.add('hidden');
        if (myUploadedPhotosContainer) myUploadedPhotosContainer.innerHTML = '';

        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            const todayStartTimestamp = firebase.firestore.Timestamp.fromDate(todayStart);
            const todayEndTimestamp = firebase.firestore.Timestamp.fromDate(todayEnd);

            console.log(`DEBUG EMP: Querying 'My Uploads' for today between ${todayStart.toLocaleString()} and ${todayEnd.toLocaleString()}`);

            const snapshot = await db.collection('servicePhotos')
                .where('employeeProfileId', '==', currentEmployeeProfileId)
                .where('uploadedAt', '>=', todayStartTimestamp)
                .where('uploadedAt', '<=', todayEndTimestamp)
                .orderBy('uploadedAt', 'desc')
                .get();

            if (myUploadsLoadingMessage) myUploadsLoadingMessage.classList.add('hidden');

            if (snapshot.empty) {
                if (noMyUploadsMessage) {
                    noMyUploadsMessage.classList.remove('hidden');
                }
                console.log("DEBUG EMP: No photos found for this employee uploaded today.");
                return;
            }

            let photosHtml = '';
            snapshot.forEach(doc => {
                const photo = doc.data();
                photosHtml += `
                    <div class="photo-item">
                        <img src="${escapeHtml(photo.photoUrl)}" alt="Uploaded by ${escapeHtml(photo.employeeName || 'you')} for ${escapeHtml(photo.locationName || 'location')}" onclick="window.open('${escapeHtml(photo.photoUrl)}', '_blank');">
                        <div class="space-y-2 text-sm">
                            <div class="flex items-center gap-2">
                                <i data-lucide="clock" class="h-4 w-4 text-muted-foreground"></i>
                                <span class="text-muted-foreground">${formatFirestoreTimestamp(photo.uploadedAt)}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <i data-lucide="map-pin" class="h-4 w-4 text-muted-foreground"></i>
                                <span class="text-muted-foreground">${escapeHtml(photo.locationName || 'Unknown')}</span>
                            </div>
                            ${photo.notes ? `
                                <div class="flex items-start gap-2">
                                    <i data-lucide="sticky-note" class="h-4 w-4 text-muted-foreground mt-0.5"></i>
                                    <span class="text-muted-foreground text-xs italic">${escapeHtml(photo.notes)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            if (myUploadedPhotosContainer) {
                myUploadedPhotosContainer.innerHTML = photosHtml;
                // Re-initialize Lucide icons for the new photo cards
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            console.log(`DEBUG EMP: Displayed ${snapshot.size} photos from today.`);

        } catch (error) {
            console.error("DEBUG EMP: Error fetching 'My Uploaded Photos':", error);
            if (myUploadsLoadingMessage) myUploadsLoadingMessage.classList.add('hidden');
            if (noMyUploadsMessage) {
                noMyUploadsMessage.innerHTML = `
                    <i data-lucide="alert-circle" class="h-12 w-12 text-red-500 mx-auto mb-3"></i>
                    <p class="text-red-600">Error loading your uploaded photos.</p>
                `;
                noMyUploadsMessage.classList.remove('hidden');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }

    async function handleSaveJobNotes() {
        console.log("DEBUG EMP: Save Job Notes button clicked.");
        if (!currentEmployeeProfileId || !currentEmployeeName || !db || !serverTimestamp) {
            showJobNotesMessage("System error or user data missing. Cannot save notes.", "error");
            return;
        }
        const selectedLocationId = locationSelectInput ? locationSelectInput.value : null;
        const selectedLocationName = locationSelectInput ? (locationSelectInput.options[locationSelectInput.selectedIndex]?.text?.replace(/ *\([^)]*\) */g, "").trim() || 'Unknown Location') : 'Unknown Location';
        const notes = generalJobNotesTextarea ? generalJobNotesTextarea.value.trim() : '';

        if (!selectedLocationId) {
            showJobNotesMessage("Please select a location before saving job notes.", "error");
            return;
        }
        if (!notes) {
            showJobNotesMessage("Please enter some notes to save.", "error");
            return;
        }

        if (saveJobNotesButton) saveJobNotesButton.disabled = true;
        showJobNotesMessage("Saving job notes...", "info");

        const jobNoteData = {
            employeeProfileId: currentEmployeeProfileId,
            employeeName: currentEmployeeName,
            locationId: selectedLocationId,
            locationName: selectedLocationName,
            notes: notes,
            createdAt: serverTimestamp(),
            timeEntryId: activeTimeEntryId || null
        };

        try {
            await db.collection("generalJobNotes").add(jobNoteData);
            showJobNotesMessage("Job notes saved successfully!", "success");
            if (generalJobNotesTextarea) generalJobNotesTextarea.value = ""; 
        } catch (error) {
            console.error("DEBUG EMP: Error saving general job notes:", error);
            showJobNotesMessage("Error saving job notes: " + error.message, "error");
        } finally {
            if (saveJobNotesButton) saveJobNotesButton.disabled = false;
            setTimeout(() => { if (jobNotesMessageEl && !jobNotesMessageEl.classList.contains('error')) { showJobNotesMessage('', 'info'); } }, 5000);
        }
    }

    function attachAllListeners() {
        console.log("DEBUG EMP: Attaching ALL event listeners...");
        if (logoutButton) logoutButton.addEventListener('click', handleLogout);
        if (clockInButton) clockInButton.addEventListener('click', handleClockIn);
        if (clockOutButton) clockOutButton.addEventListener('click', handleClockOut);
        if (cameraInput) { cameraInput.removeEventListener('change', handleFileSelection); cameraInput.addEventListener('change', handleFileSelection); }
        if (galleryInput) { galleryInput.removeEventListener('change', handleFileSelection); galleryInput.addEventListener('change', handleFileSelection); }
        if (uploadButton) uploadButton.addEventListener('click', handleUpload);
        if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePassword);
        if (saveJobNotesButton) saveJobNotesButton.addEventListener('click', handleSaveJobNotes);
        console.log("DEBUG EMP: All employee dashboard listeners attached.");
    }

    auth.onAuthStateChanged(user => {
        // MODIFIED: Store the auth 'user' object in the global 'currentUser'
        currentUser = user; 
        currentUserId = null; 
        currentEmployeeProfileId = null; 
        currentEmployeeName = null; 
        activeTimeEntryId = null;

        if (currentUser) { // Use the global currentUser
            currentUserId = currentUser.uid;

            // ADDED: Logic to show/hide admin portal link based on custom claims
            currentUser.getIdTokenResult()
                .then((idTokenResult) => {
                    const claims = idTokenResult.claims;
                    console.log("DEBUG EMP: User claims:", claims); 
                    if (goToAdminPortalLink) { // Check if element exists
                        if (claims.admin === true || claims.super_admin === true || claims.standard_admin === true) {
                            goToAdminPortalLink.style.display = 'inline-block'; 
                        } else {
                            goToAdminPortalLink.style.display = 'none';
                        }
                    }
                })
                .catch((error) => {
                    console.error("DEBUG EMP: Error getting ID token result:", error);
                    if (goToAdminPortalLink) {
                        goToAdminPortalLink.style.display = 'none';
                    }
                });
            // END ADDED Admin Portal Link Logic

            // Existing logic to fetch Firestore user data
            db.collection('users').doc(currentUser.uid).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data();
                    if ((userData.role === 'employee' || userData.role === 'admin') && userData.profileId) { // Admins might also be employees
                        currentEmployeeProfileId = userData.profileId;
                        db.collection('employeeMasterList').doc(currentEmployeeProfileId).get()
                          .then(profileDoc => {
                              if (profileDoc.exists) {
                                  const p = profileDoc.data(); 
                                  currentEmployeeName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Employee';
                                  updateEmployeeName(currentEmployeeName); // Update sidebar name
                                  if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, ${currentEmployeeName}!`;
                                  
                                  // Hide loading and show content
                                  const loadingEl = document.getElementById('employee-loading-message');
                                  if (loadingEl) loadingEl.style.display = 'none';
                                  if (dashboardContentEl) dashboardContentEl.style.display = 'block';
                                  
                                  // Initialize page functions
                                  checkClockStatus(); 
                                  fetchPayrollData(); 
                                  populateLocationDropdown();
                                  fetchAndDisplayMyUploadedPhotos(); 
                                  updateDashboardStats(); // Update dashboard stats
                                  
                                  if (!window.employeePortalListenersAttached) {
                                      attachAllListeners();
                                      setupNavigation();
                                      window.employeePortalListenersAttached = true;
                                  }
                                  
                                  // Update dashboard stats periodically
                                  setTimeout(updateDashboardStats, 1000);
                                  setInterval(updateDashboardStats, 30000); // Update every 30 seconds
                                  setupNavigation(); // Setup navigation listeners
                              } else { 
                                  redirectToLogin("Employee profile not found."); 
                              }
                          }).catch(e => {
                              console.error("DEBUG EMP: Error fetching employee profile.", e);
                              redirectToLogin("Error fetching employee profile.");
                          });
                    } else { 
                        // If user is not an employee or admin with profileId (e.g. pure admin without employee profile)
                        // or if they don't have a profileId.
                        // They might still be an admin (checked by claims above for the link), 
                        // but they can't use employee-specific functions here.
                        // If there's no admin link visible and no employee functions, this effectively logs them out of employee view.
                        if (goToAdminPortalLink && goToAdminPortalLink.style.display === 'inline-block') {
                            // Admin link is visible, so allow them to stay on page to use it.
                            // Hide employee-specific content if necessary or show a message.
                            if (welcomeMessageEl) welcomeMessageEl.textContent = `Welcome, Admin! (No employee profile loaded)`;
                            if (dashboardContentEl) dashboardContentEl.style.display = 'block'; // Show header at least
                             // Hide or disable employee specific sections if they are a non-employee admin
                            if (document.getElementById('clock-section')) document.getElementById('clock-section').style.display = 'none';
                            if (document.getElementById('upload-section')) document.getElementById('upload-section').style.display = 'none';
                            if (document.getElementById('my-uploads-section')) document.getElementById('my-uploads-section').style.display = 'none';
                            if (document.getElementById('job-notes-section')) document.getElementById('job-notes-section').style.display = 'none';
                            if (document.getElementById('payroll-section')) document.getElementById('payroll-section').style.display = 'none';

                        } else {
                            redirectToLogin("Access denied (not an active employee or no profile ID).");
                        }
                    }
                } else { 
                    redirectToLogin("User data not found in Firestore."); 
                }
            }).catch((error) => {
                console.error("DEBUG EMP: Error getting user data from Firestore.", error);
                const loadingEl = document.getElementById('employee-loading-message');
                if (loadingEl) loadingEl.style.display = 'none';
                redirectToLogin("Error getting user data.");
            });
        } else { 
            // No user signed in
            const loadingEl = document.getElementById('employee-loading-message');
            if (loadingEl) loadingEl.style.display = 'none';
            if (dashboardContentEl) dashboardContentEl.style.display = 'none';
            if (welcomeMessageEl) welcomeMessageEl.textContent = 'Please log in.';
            if (goToAdminPortalLink) { // Ensure link is hidden if no user
                goToAdminPortalLink.style.display = 'none';
            }
            redirectToLogin("User is signed out."); 
        }
    });

    console.log("DEBUG EMP: Employee Portal script (V6 with General Job Notes) fully initialized.");
});
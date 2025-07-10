// public/js/admin-service-history.js
// V5.4 - Corrected photo fetching for review gallery to use locationId + date.
//      - Integrated isClientVisible flag for photo approval.
// Make initMapAsh globally accessible for Google Maps callback
// At the VERY TOP of your admin-service-history.js file
function initMapAsh() {
    console.log("DEBUG ASH: Google Maps API script loaded and initMapAsh called.");
    window.googleMapsApiLoaded = true;
    if (window.ashMapQueue && window.ashMapQueue.length > 0) {
        console.log("DEBUG ASH: Processing queued maps in initMapAsh.");
        window.ashMapQueue.forEach(mapItem => {
            displayMapForTimeEntry(mapItem.id, mapItem.lat, mapItem.lng, mapItem.title);
        });
        window.ashMapQueue = []; // Clear queue
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log("DEBUG ASH: Admin Service History script (V5.4)");

    if (typeof firebase === 'undefined' || !firebase.app || !firebase.auth || !firebase.firestore) {
        console.error("CRITICAL ASH: Firebase services not available.");
        document.body.innerHTML = "<p style='color:red;text-align:center;font-size:1.2em;'>Error: Firebase services not available.</p>";
        return;
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

    // --- Element References ---
    const serviceHistoryListView = document.getElementById('service-history-list-view');
    const serviceHistoryLoadingMsg = document.getElementById('service-history-loading-message');
    const noServiceHistoryMsg = document.getElementById('no-service-history-message');
    const serviceHistoryTableBody = document.getElementById('service-history-table-body');

    const photosViewerSection = document.getElementById('service-photos-viewer-section');
    const photosViewerTitle = document.getElementById('photos-viewer-title');
    const photosViewerLoadingMsg = document.getElementById('photos-viewer-loading-message');
    const noServicePhotosMsg = document.getElementById('no-service-photos-message');
    const photosViewerContainer = document.getElementById('photos-viewer-container');
    const closePhotosViewerBtn = document.getElementById('close-photos-viewer-button');

    const filterDateStartInput = document.getElementById('filter-date-start');
    const filterDateEndInput = document.getElementById('filter-date-end');
    const applyFiltersBtn = document.getElementById('apply-filters-button');
    const resetFiltersBtn = document.getElementById('reset-filters-button');

    // ADD THESE NEW ELEMENT REFERENCES
    const shTimeTrackingDisplaySection = document.getElementById('sh-time-tracking-display-section');
    const shTimeTrackingLoading = document.getElementById('sh-time-tracking-loading');
    const shTimeTrackingList = document.getElementById('sh-time-tracking-list');
    const shNoTimeTracking = document.getElementById('sh-no-time-tracking');

    const showAddServiceHistoryFormBtn = document.getElementById('show-add-service-history-form-button');
    const addEditServiceHistorySection = document.getElementById('add-edit-service-history-section');
    const addEditServiceHistoryForm = document.getElementById('add-edit-service-history-form');
    const serviceHistoryFormTitle = document.getElementById('service-history-form-title');
    const editServiceHistoryDocIdInput = document.getElementById('edit-service-history-doc-id');
    const shClientSelect = document.getElementById('sh-client-select');
    const shLocationSelect = document.getElementById('sh-location-select');
    const shServiceDateInput = document.getElementById('sh-service-date');
    const shEmployeeCheckboxList = document.getElementById('sh-employee-checkbox-list');
    const shServiceTypeInput = document.getElementById('sh-service-type');
    const shStatusSelect = document.getElementById('sh-status');
    const shServiceNotesTextarea = document.getElementById('sh-service-notes');
    const saveServiceHistoryButton = document.getElementById('save-service-history-button');
    const cancelAddEditServiceHistoryBtn = document.getElementById('cancel-add-edit-service-history-button');
    const addEditServiceHistoryMessageEl = document.getElementById('add-edit-service-history-message');
    
    const shPhotoReviewGallery = document.getElementById('sh-photo-review-gallery');
    const shPhotoReviewGalleryLoading = document.getElementById('sh-photo-review-gallery-loading');
    const shNoPhotosForReview = document.getElementById('sh-no-photos-for-review');
    const shApproveAllPhotosBtn = document.getElementById('sh-approve-all-photos-btn');
    const shHideAllPhotosBtn = document.getElementById('sh-hide-all-photos-btn');
    const shAdminNotesTextarea = document.getElementById('sh-admin-notes');

    const allManagedPageSections = [serviceHistoryListView, addEditServiceHistorySection, photosViewerSection];
    let currentAdminUser = null;
    let currentAdminClaims = null;

    auth.onAuthStateChanged(user => {
        currentAdminUser = user;
        if (user) {
            user.getIdTokenResult().then(idTokenResult => {
                currentAdminClaims = idTokenResult.claims;
                // Attempt to get Firestore user document for role verification, but proceed if claims are sufficient
                db.collection('users').doc(user.uid).get()
                    .then(docSnapshot => {
                        let userData = null;
                        if (docSnapshot.exists) {
                            userData = docSnapshot.data();
                        } else {
                            console.warn("DEBUG ASH: User document not found in Firestore for UID:", user.uid);
                        }

                        // Check for admin privileges based on claims OR Firestore role
                        const isAdminByClaims = currentAdminClaims && (currentAdminClaims.admin === true || currentAdminClaims.super_admin === true || currentAdminClaims.standard_admin === true);
                        const isAdminByRole = userData && (userData.role === 'admin' || userData.role === 'super_admin' || userData.role === 'standard_admin');

                        if (isAdminByClaims || isAdminByRole) {
                            console.log("DEBUG ASH: Admin access confirmed.");

                            // Check if we are on the dedicated admin-service-history.html page
                            if (document.body.classList.contains('on-service-history-page')) {
                                console.log("DEBUG ASH: Initializing for dedicated admin-service-history.html page.");
                                setupEventListeners(); // Setup listeners specific to elements on this page
                                loadServiceHistory();  // Load the main table view

                                if (window.location.hash) {
                                    const serviceIdFromHash = window.location.hash.substring(1);
                                    if (serviceIdFromHash) {
                                        console.log("DEBUG ASH: Found hash, attempting to load service ID:", serviceIdFromHash);
                                        // Ensure the form section is visible before populating
                                        setTimeout(() => { 
                                            handleEditServiceHistoryClick(serviceIdFromHash); 
                                        }, 150);
                                    } else {
                                        showPageSection(serviceHistoryListView); // Show list if hash is just '#'
                                    }
                                } else {
                                    showPageSection(serviceHistoryListView); // Default to list view
                                }
                            } else {
                                console.log("DEBUG ASH: Script loaded on a page other than admin-service-history.html (e.g., dashboard). Functions are available but page-specific auto-init is skipped.");
                                // When loaded on another page (like admin.html for the modal),
                                // we don't want to automatically load the table or process hashes for page sections.
                                // The functions are exposed via window.ashFormHandler and will be called explicitly.
                                // We do, however, want to ensure event listeners for the form itself are set up
                                // if the form is dynamically loaded. `setupEventListeners()` handles form elements too.
                                // It's generally safe to call if element IDs are unique and present.
                                // However, the admin-portal.js will re-attach specific listeners for modal context.
                                // For now, let's ensure basic listeners are attempted.
                                // If `addEditServiceHistoryForm` is not on the page, these won't do anything harmful.
                                if (typeof setupEventListeners === 'function') {
                                     // Call setupEventListeners, but it should ideally be idempotent or only attach to existing elements.
                                     // The dashboard will handle overriding specific buttons like cancel/save for the modal.
                                    setupEventListeners();
                                    console.log("DEBUG ASH: setupEventListeners called (potentially for dynamically loaded form elements if present).");
                                }
                            }
                        } else {
                            console.error("DEBUG ASH: Access denied. User does not have sufficient admin claims or role. Redirecting.");
                            window.location.href = 'index.html'; // Redirect if not admin
                        }
                    })
                    .catch(error => { 
                        console.error("DEBUG ASH: Error fetching user data from Firestore:", error);
                        // Allow access if claims are sufficient, even if Firestore doc fails, but log error
                        const isAdminByClaimsOnly = currentAdminClaims && (currentAdminClaims.admin === true || currentAdminClaims.super_admin === true || currentAdminClaims.standard_admin === true);
                        if(isAdminByClaimsOnly) {
                            console.warn("DEBUG ASH: Proceeding with admin access based on claims despite Firestore user doc error.");
                             if (document.body.classList.contains('on-service-history-page')) {
                                setupEventListeners();
                                loadServiceHistory();
                                if (window.location.hash) { /* ... simplified hash handling ... */ }
                                else { showPageSection(serviceHistoryListView); }
                            } else {
                                if (typeof setupEventListeners === 'function') setupEventListeners();
                            }
                        } else {
                            window.location.href = 'index.html'; 
                        }
                    });
            }).catch(error => {
                console.error("DEBUG ASH: Error fetching ID token result:", error);
                window.location.href = 'index.html'; // Redirect on token error
            });
        } else { 
            console.log("DEBUG ASH: No user authenticated. Redirecting.");
            window.location.href = 'index.html'; // Redirect if no user
        }
    });
    
    function showPageSection(sectionToShow) {
        allManagedPageSections.forEach(section => {
            if (section) {
                section.style.display = (section === sectionToShow) ? 'block' : 'none';
            }
        });
        if (!sectionToShow && serviceHistoryListView) {
            serviceHistoryListView.style.display = 'block';
        }
    }

    function setupEventListeners() {
        console.log("DEBUG ASH: Setting up event listeners.");

        if (showAddServiceHistoryFormBtn) {
            showAddServiceHistoryFormBtn.addEventListener('click', () => {
                if (addEditServiceHistoryForm) addEditServiceHistoryForm.reset();
                if (editServiceHistoryDocIdInput) editServiceHistoryDocIdInput.value = '';
                if (serviceHistoryFormTitle) serviceHistoryFormTitle.textContent = "Add New Service Record";
                if (saveServiceHistoryButton) saveServiceHistoryButton.textContent = "Save Service Record";
                if(shLocationSelect) { 
                    shLocationSelect.innerHTML = '<option value="">-- Select Client First --</option>';
                    shLocationSelect.disabled = true;
                }
                if(shEmployeeCheckboxList) shEmployeeCheckboxList.innerHTML = '<p><i>Loading employees...</i></p>';
                if(shStatusSelect) shStatusSelect.value = 'Completed';
                if(shAdminNotesTextarea) shAdminNotesTextarea.value = ''; 
                if(shPhotoReviewGallery) shPhotoReviewGallery.innerHTML = ''; 
                if(shNoPhotosForReview && shPhotoReviewGalleryLoading) { 
                    shNoPhotosForReview.style.display = 'block';
                    shPhotoReviewGalleryLoading.style.display = 'none';
                // ... (after resetting photo review gallery)
                if (shTimeTrackingList) shTimeTrackingList.innerHTML = '';
                if (shNoTimeTracking && shTimeTrackingLoading) { // Check both exist
                    shNoTimeTracking.style.display = 'block'; // Show "no data" by default for new
                    shTimeTrackingLoading.style.display = 'none';
            }
                }
                showGeneralMessage(addEditServiceHistoryMessageEl, '', 'info');
                populateClientDropdownForServiceHistory();
                populateEmployeeCheckboxes();
                showPageSection(addEditServiceHistorySection);
                if(addEditServiceHistoryForm) setFormDisabledState(addEditServiceHistoryForm, false);
            });
        }

        if (cancelAddEditServiceHistoryBtn) {
            cancelAddEditServiceHistoryBtn.addEventListener('click', () => {
                showPageSection(serviceHistoryListView);
                showGeneralMessage(addEditServiceHistoryMessageEl, '', 'info');
            });
        }
        
        if (addEditServiceHistoryForm) {
            addEditServiceHistoryForm.addEventListener('submit', handleSaveServiceHistorySubmit);
        }

        if (shClientSelect) {
            shClientSelect.addEventListener('change', (event) => {
                populateLocationDropdownForClient(event.target.value);
            });
        }

        if (closePhotosViewerBtn) {
            closePhotosViewerBtn.addEventListener('click', () => {
                if (photosViewerSection) photosViewerSection.style.display = 'none';
            });
        }

        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', loadServiceHistory);
        }

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                if (filterDateStartInput) filterDateStartInput.value = '';
                if (filterDateEndInput) filterDateEndInput.value = '';
                loadServiceHistory();
            });
        }

        if (serviceHistoryTableBody) {
            serviceHistoryTableBody.addEventListener('click', event => {
                const target = event.target;
                const viewPhotosButton = target.closest('.view-service-photos-button');
                const editServiceButton = target.closest('.edit-service-history-button'); 
                const deleteServiceButton = target.closest('.delete-service-history-button'); 

                if (viewPhotosButton) {
                    const serviceId = viewPhotosButton.dataset.serviceId;
                    const locationId = viewPhotosButton.dataset.locationId;
                    const serviceDateStr = viewPhotosButton.dataset.serviceDate; 
                    const locationName = viewPhotosButton.dataset.locationName;
                    const clientName = viewPhotosButton.dataset.clientName; 
                    if (serviceId && locationId && serviceDateStr) {
                        openPhotosViewer(serviceId, locationId, serviceDateStr, locationName, clientName);
                    } else {
                        console.error("DEBUG ASH: Missing data for photo viewer.", viewPhotosButton.dataset);
                        alert("Cannot load photos: information missing.");
                    }
                } else if (editServiceButton) { 
                    const serviceId = editServiceButton.dataset.serviceId;
                    if (serviceId) { handleEditServiceHistoryClick(serviceId); }
                } else if (deleteServiceButton) { 
                    const serviceId = deleteServiceButton.dataset.serviceId;
                    const clientName = deleteServiceButton.dataset.clientName;
                    const locationName = deleteServiceButton.dataset.locationName;
                    const serviceDateDisplay = deleteServiceButton.dataset.serviceDateDisplay;
                    if (serviceId) { handleDeleteServiceHistoryClick(serviceId, clientName, locationName, serviceDateDisplay); }
                }
            });
        }
        
        if (shApproveAllPhotosBtn) {
            shApproveAllPhotosBtn.addEventListener('click', () => {
                if (shPhotoReviewGallery) {
                    shPhotoReviewGallery.querySelectorAll('input[type="checkbox"][data-photo-id]').forEach(cb => cb.checked = true);
                }
            });
        }
        if (shHideAllPhotosBtn) {
            shHideAllPhotosBtn.addEventListener('click', () => {
                if (shPhotoReviewGallery) {
                    shPhotoReviewGallery.querySelectorAll('input[type="checkbox"][data-photo-id]').forEach(cb => cb.checked = false);
                }
            });
        }
        console.log("DEBUG ASH: Event listeners setup complete.");
    }

    function showGeneralMessage(el, message, type = 'info') { 
        if (el) {
            el.textContent = message;
            el.className = `form-message ${type}`;
            el.style.display = message ? 'block' : 'none';
        }
        if (type === 'error') console.error("ASH Message:", message);
        else console.log("ASH Message (" + type + "):", message);
    }
    function setFormDisabledState(formElement, disabled) { 
        if (!formElement) return;
        const elements = formElement.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => el.disabled = disabled);
    }
    function escapeHtml(unsafe) { 
        if (unsafe === null || typeof unsafe === 'undefined') return '';
        if (typeof unsafe !== 'string') {
            if (typeof unsafe === 'number' || typeof unsafe === 'boolean') {
                unsafe = String(unsafe);
            } else { return '[Invalid Data]'; }
        }
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    async function loadServiceHistory() {
        console.log("DEBUG ASH: loadServiceHistory called.");
        if (!db) { console.error("DEBUG ASH: Firestore DB not available."); return; }
        if (!currentAdminUser || !currentAdminClaims) {
             console.warn("DEBUG ASH: Admin user or claims not ready for loadServiceHistory. Attempting to refresh claims if user exists.");
             if (currentAdminUser) {
                 try {
                    const idTokenResult = await currentAdminUser.getIdTokenResult(true); 
                    currentAdminClaims = idTokenResult.claims;
                    console.log("DEBUG ASH: Claims refreshed for loadServiceHistory. super_admin:", currentAdminClaims ? currentAdminClaims.super_admin : 'N/A');
                 } catch (claimsError) {
                     console.error("DEBUG ASH: Error refreshing claims in loadServiceHistory:", claimsError);
                 }
             } else {
                 console.error("DEBUG ASH: currentAdminUser is null in loadServiceHistory.");
                 if (serviceHistoryTableBody) serviceHistoryTableBody.innerHTML = '<tr><td colspan="8">User not authenticated. Please refresh.</td></tr>';
                 if (serviceHistoryLoadingMsg) serviceHistoryLoadingMsg.style.display = 'none';
                 if (noServiceHistoryMsg) {
                    noServiceHistoryMsg.textContent = 'User not authenticated. Please refresh.';
                    noServiceHistoryMsg.style.display = 'block';
                 }
                 return;
             }
        }

        if (serviceHistoryLoadingMsg) serviceHistoryLoadingMsg.style.display = 'block';
        if (noServiceHistoryMsg) noServiceHistoryMsg.style.display = 'none';
        if (serviceHistoryTableBody) serviceHistoryTableBody.innerHTML = '';

        try {
            let query = db.collection('serviceHistory').orderBy('serviceDate', 'desc');

            const startDateVal = filterDateStartInput ? filterDateStartInput.value : null;
            const endDateVal = filterDateEndInput ? filterDateEndInput.value : null;

            if (startDateVal) {
                const jsStartDate = new Date(startDateVal); 
                jsStartDate.setUTCHours(0,0,0,0);
                query = query.where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(jsStartDate));
            }
            if (endDateVal) {
                const jsEndDate = new Date(endDateVal);
                jsEndDate.setUTCHours(23,59,59,999);
                query = query.where('serviceDate', '<=', firebase.firestore.Timestamp.fromDate(jsEndDate));
            }
            
            query = query.limit(100);
            const snapshot = await query.get();
            if (serviceHistoryLoadingMsg) serviceHistoryLoadingMsg.style.display = 'none';

            if (snapshot.empty) {
                if (noServiceHistoryMsg) noServiceHistoryMsg.style.display = 'block';
                return;
            }

            let tableRowsHtml = '';
            snapshot.forEach(doc => {
                const entry = doc.data();
                const serviceId = doc.id; 
                const safeServiceId = escapeHtml(serviceId);

                let serviceDateDisplay = 'N/A';
                if (entry.serviceDate && entry.serviceDate.toDate) {
                    const dateObj = entry.serviceDate.toDate();

                    const year = dateObj.getUTCFullYear();
                    const month = dateObj.getUTCMonth() + 1; // JS months are 0-indexed
                    const day = dateObj.getUTCDate();

                    serviceDateDisplay = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
                }
                let assignedEmployees = 'N/A';
                if (entry.employeeAssignments && Array.isArray(entry.employeeAssignments) && entry.employeeAssignments.length > 0) {
                    assignedEmployees = entry.employeeAssignments.map(emp => escapeHtml(emp.employeeName || 'Unnamed')).join(', ');
                }

                let actionButtonsHtml = `
                    <button class="view-service-photos-button button-small action-button" 
                            data-service-id="${safeServiceId}" 
                            data-location-id="${escapeHtml(entry.locationId || '')}" 
                            data-service-date="${entry.serviceDate && entry.serviceDate.toDate ? entry.serviceDate.toDate().toISOString() : ''}" 
                            data-location-name="${escapeHtml(entry.locationName || 'N/A')}"
                            data-client-name="${escapeHtml(entry.clientName || 'N/A')}">
                        View Photos
                    </button>
                    <button class="edit-service-history-button button-small edit-button" 
                            data-service-id="${safeServiceId}">
                        Edit/Review
                    </button>`;

                if (currentAdminClaims && currentAdminClaims.super_admin === true) {
                    actionButtonsHtml += `
                        <button class="delete-service-history-button button-small delete-button" 
                                data-service-id="${safeServiceId}"
                                data-client-name="${escapeHtml(entry.clientName || 'N/A')}"
                                data-location-name="${escapeHtml(entry.locationName || 'N/A')}"
                                data-service-date-display="${escapeHtml(serviceDateDisplay)}">
                            Delete
                        </button>`;
                }

                tableRowsHtml += `
                    <tr>
                        <td>${escapeHtml(serviceDateDisplay)}</td>
                        <td>${escapeHtml(entry.locationName || 'N/A')}</td>
                        <td>${escapeHtml(entry.clientName || 'N/A')}</td>
                        <td>${assignedEmployees}</td>
                        <td>${escapeHtml(entry.serviceType || 'N/A')}</td>
                        <td>${escapeHtml(entry.status || 'N/A')}</td>
                        <td>${escapeHtml(entry.serviceNotes || '').substring(0, 75)}${ (entry.serviceNotes && entry.serviceNotes.length > 75) ? '...' : '' }</td>
                        <td>${actionButtonsHtml}</td>
                    </tr>`;
            });
            if (serviceHistoryTableBody) serviceHistoryTableBody.innerHTML = tableRowsHtml;
        } catch (error) {
            console.error("DEBUG ASH: Error loading service history:", error);
            if (serviceHistoryLoadingMsg) serviceHistoryLoadingMsg.style.display = 'none';
            if (noServiceHistoryMsg) {
                noServiceHistoryMsg.textContent = "Error loading service history. " + error.message;
                noServiceHistoryMsg.style.display = 'block';
            }
        }
    }

    async function openPhotosViewer(serviceId, locationId, serviceDateISOString, locationName, clientName) { 
        console.log(`DEBUG ASH: openPhotosViewer called. Service ID: ${serviceId}, Loc ID: ${locationId}, Service Date ISO: ${serviceDateISOString}`);
        // ... (Keep your existing corrected openPhotosViewer from Turn 47, which uses locationId and date range) ...
        if (!db) { 
            console.error("DEBUG ASH: Firestore DB not available for openPhotosViewer."); 
            alert("Error: Database connection not ready.");
            return; 
        }
        if (!locationId || !serviceDateISOString) { 
            console.error("DEBUG ASH: Insufficient data for openPhotosViewer - locationId or serviceDateISOString missing.");
            alert("Error: Cannot display photos, essential information missing (location or service date).");
            return;
        }

        if (photosViewerSection) photosViewerSection.style.display = 'flex'; 
        if (photosViewerTitle) photosViewerTitle.textContent = `Photos for ${escapeHtml(locationName || 'N/A Location')} (${escapeHtml(clientName || 'N/A Client')}) on ${serviceDateISOString ? new Date(serviceDateISOString).toLocaleDateString() : 'N/A'}`;
        if (photosViewerContainer) photosViewerContainer.innerHTML = ''; 
        if (noServicePhotosMsg) noServicePhotosMsg.style.display = 'none';
        if (photosViewerLoadingMsg) photosViewerLoadingMsg.style.display = 'block';

        try {
            const serviceDateObj = new Date(serviceDateISOString); 
            const startOfDayUTC = new Date(Date.UTC(serviceDateObj.getUTCFullYear(), serviceDateObj.getUTCMonth(), serviceDateObj.getUTCDate(), 0, 0, 0, 0));
            const endOfQueryWindowUTC = new Date(startOfDayUTC);
            endOfQueryWindowUTC.setUTCHours(startOfDayUTC.getUTCHours() + 29);
            const startOfDayTimestamp = firebase.firestore.Timestamp.fromDate(startOfDayUTC);
            const endOfQueryWindowTimestamp = firebase.firestore.Timestamp.fromDate(endOfQueryWindowUTC); // Use this new end
            console.log(`DEBUG ASH: Querying servicePhotos for locationId: ${locationId}, between ${startOfDayUTC.toISOString()} and ${endOfQueryWindowUTC.toISOString()}`);

            const photosSnapshot = await db.collection('servicePhotos')
                .where('locationId', '==', locationId)
                .where('uploadedAt', '>=', startOfDayTimestamp)
                .where('uploadedAt', '<=', endOfQueryWindowTimestamp)
                .orderBy('uploadedAt', 'desc')
                .get();

            if (photosViewerLoadingMsg) photosViewerLoadingMsg.style.display = 'none';

            if (photosSnapshot.empty) {
                console.log(`DEBUG ASH: No photos found for location ${locationId} on ${serviceDateObj.toLocaleDateString()}.`);
                if (noServicePhotosMsg) noServicePhotosMsg.style.display = 'block';
                return;
            }

            console.log(`DEBUG ASH: Found ${photosSnapshot.size} photos for location ${locationId} on ${serviceDateObj.toLocaleDateString()}.`);
            let photosHtml = '';
            photosSnapshot.forEach(doc => {
                const photoData = doc.data();
                photosHtml += `
                    <div class="photo-item">
                        <img src="${photoData.photoUrl}" alt="Service photo for ${escapeHtml(locationName)}" loading="lazy" data-full-url="${photoData.photoUrl}">
                        <p><strong>Uploaded:</strong> ${photoData.uploadedAt && photoData.uploadedAt.toDate ? photoData.uploadedAt.toDate().toLocaleString() : 'N/A'}</p>
                        <p><strong>By:</strong> ${escapeHtml(photoData.employeeName || 'Unknown')}</p>
                        ${photoData.notes ? `<p><strong>Notes:</strong> ${escapeHtml(photoData.notes)}</p>` : ''}
                    </div>`;
            });

            if (photosViewerContainer) {
                photosViewerContainer.innerHTML = photosHtml;
                photosViewerContainer.querySelectorAll('.photo-item img').forEach(img => {
                    img.addEventListener('click', (e) => {
                        const fullUrl = e.target.dataset.fullUrl;
                        if (fullUrl) window.open(fullUrl, '_blank');
                    });
                });
            }
        } catch (error) {
            console.error("DEBUG ASH: Error fetching/displaying service photos:", error);
            if (photosViewerLoadingMsg) photosViewerLoadingMsg.style.display = 'none';
            if (photosViewerContainer) photosViewerContainer.innerHTML = '<p class="error-message">Error loading photos. Please try again.</p>';
            if (noServicePhotosMsg) { 
                noServicePhotosMsg.textContent = "Error loading photos.";
                noServicePhotosMsg.style.display = 'block';
            }
        }
    }

  async function populateClientDropdownForServiceHistory() { 
      console.log("DEBUG ASH: Populating SH Client Dropdown");
      const localShClientSelect = shClientSelect || document.getElementById('sh-client-select');

      if (!db || !localShClientSelect) { 
          console.error("DEBUG ASH: DB or sh-client-select element not found for SH form."); 
          if(localShClientSelect === null) console.error("DEBUG ASH: document.getElementById('sh-client-select') returned null for client dropdown.");
          return; 
      }
      localShClientSelect.disabled = true;
      const currentValue = localShClientSelect.value; 
      localShClientSelect.innerHTML = '<option value="">-- Loading Clients --</option>';
      try {
          const snapshot = await db.collection('clientMasterList').where('status', '==', true).orderBy('companyName', 'asc').get();
          let optionsHtml = '<option value="">-- Select Client --</option>';
          if (!snapshot.empty) {
              snapshot.forEach(doc => {
                  const docId = doc.id; 
                  const companyName = doc.data().companyName; 
                  const escapedCompanyName = escapeHtml(companyName);

                  console.log(`DEBUG ASH_CLIENT_ITEM: ID='${docId}', Name='${companyName}', EscapedName='${escapedCompanyName}'`);
                  const singleOptionString = `<option value="${docId}">${escapedCompanyName}</option>`;
                  console.log(`DEBUG ASH_CLIENT_ITEM_HTML: '${singleOptionString}'`);

                  optionsHtml += singleOptionString; 
              });
          } else {
              optionsHtml = '<option value="">-- No Active Clients Found --</option>';
          }
          console.log("DEBUG ASH_FINAL_CLIENT_HTML:", optionsHtml); 
          localShClientSelect.innerHTML = optionsHtml;
          if (currentValue) localShClientSelect.value = currentValue; 
      } catch (error) {
          console.error("DEBUG ASH: Error populating SH client dropdown:", error);
          localShClientSelect.innerHTML = '<option value="">-- Error Loading Clients --</option>';
          const localAddEditMsgEl = addEditServiceHistoryMessageEl || document.getElementById('add-edit-service-history-message');
          if (localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "Error loading client list.", 'error');
      } finally {
          localShClientSelect.disabled = false;
      }
  }

    async function populateLocationDropdownForClient(clientId) { 
        console.log("DEBUG ASH: Populating SH Location Dropdown for Client:", clientId);
        const localShLocationSelect = shLocationSelect || document.getElementById('sh-location-select');

        if (!db || !localShLocationSelect) { 
            console.error("DEBUG ASH: DB or sh-location-select element not found for SH form."); 
            if(localShLocationSelect === null) console.error("DEBUG ASH: document.getElementById('sh-location-select') returned null for location dropdown.");
            return; 
        }
        localShLocationSelect.disabled = true;
        const currentValue = localShLocationSelect.value; 
        localShLocationSelect.innerHTML = '<option value="">-- Loading Locations --</option>';
    
        if (!clientId) {
            localShLocationSelect.innerHTML = '<option value="">-- Select Client First --</option>';
            // No need to set disabled = true again, it's already true
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
                    const docId = doc.id; // Explicitly assign to variable
                    const locationName = doc.data().locationName || 'Unnamed Location'; // Explicitly assign
                    const escapedLocationName = escapeHtml(locationName); // Escape separately

                    // Debug log for this specific item
                    console.log(`DEBUG ASH_LOCATION_ITEM: ID='${docId}', Name='${locationName}', EscapedName='${escapedLocationName}'`);
                    const singleOptionString = `<option value="${docId}">${escapedLocationName}</option>`;
                    console.log(`DEBUG ASH_LOCATION_ITEM_HTML: '${singleOptionString}'`);
    
                    optionsHtml += singleOptionString; 
                });
            } else {
                optionsHtml = '<option value="">-- No Active Locations for this Client --</option>';
            }
            console.log("DEBUG ASH_FINAL_LOCATION_HTML:", optionsHtml);
            localShLocationSelect.innerHTML = optionsHtml;
            if (currentValue) localShLocationSelect.value = currentValue; 
        } catch (error) {
            console.error("DEBUG ASH: Error populating SH location dropdown:", error);
            localShLocationSelect.innerHTML = '<option value="">-- Error Loading Locations --</option>';
            const localAddEditMsgEl = addEditServiceHistoryMessageEl || document.getElementById('add-edit-service-history-message');
            if (localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "Error loading locations for client.", 'error');
        } finally {
            localShLocationSelect.disabled = false;
        }
    }

    async function populateEmployeeCheckboxes() { 
        console.log("DEBUG ASH: Populating SH Employee Checkbox List");
        const localShEmployeeCheckboxList = shEmployeeCheckboxList || document.getElementById('sh-employee-checkbox-list');

        if (!db || !localShEmployeeCheckboxList) {
            console.error("DEBUG ASH: DB or sh-employee-checkbox-list element not found.");
            if(localShEmployeeCheckboxList === null) console.error("DEBUG ASH: document.getElementById('sh-employee-checkbox-list') returned null for employee checkboxes.");
            if(localShEmployeeCheckboxList) localShEmployeeCheckboxList.innerHTML = '<p style="color: red;"><i>Error: Employee list container missing.</i></p>';
            return;
        }
        localShEmployeeCheckboxList.innerHTML = '<p><i>Loading active employees...</i></p>';
        try {
            const snapshot = await db.collection('employeeMasterList')
                .where('status', '==', true)
                .orderBy('lastName', 'asc')
                .orderBy('firstName', 'asc')
                .get();
            if (snapshot.empty) {
                localShEmployeeCheckboxList.innerHTML = '<p><i>No active employees found to assign.</i></p>';
            } else {
                let checkboxesHtml = '';
                snapshot.forEach(doc => {
                    const emp = doc.data();
                    const empId = doc.id; 
                    const empFirstName = emp.firstName || '';
                    const empLastName = emp.lastName || '';
                    const name = `${empFirstName} ${empLastName}`.trim() || 'Unnamed Employee';
                    const escapedName = escapeHtml(name); // Escape separately
                    const escapedDataName = escapeHtml(name); // data-name should also be escaped

                    // Debug log for this specific item
                    console.log(`DEBUG ASH_EMPLOYEE_ITEM: ID='${empId}', Name='${name}', EscapedName='${escapedName}'`);
                const singleCheckboxString = 
                        `<label style="display: block; margin-bottom: 5px; font-weight: normal;">
                            <input type="checkbox" name="sh_employee" value="${empId}" data-name="${escapedDataName}"> 
                            ${escapedName}
                        </label>`;
                    console.log(`DEBUG ASH_EMPLOYEE_ITEM_HTML: '${singleCheckboxString.replace(/\n\s*/g, "")}'`); // Log minified

                    checkboxesHtml += singleCheckboxString;
                });
                console.log("DEBUG ASH_FINAL_EMPLOYEE_HTML:", checkboxesHtml);
                localShEmployeeCheckboxList.innerHTML = checkboxesHtml;
        }
        } catch (error) {
            console.error("DEBUG ASH: Error populating SH employee checkboxes:", error);
            localShEmployeeCheckboxList.innerHTML = '<p style="color: red;"><i>Error loading employees list.</i></p>';
        }
    }

    // ADD THIS ENTIRE NEW FUNCTION
async function fetchAndDisplayTimeTrackingForService(serviceHistoryDocData, serviceHistoryId) {
    console.log(`DEBUG ASH: Fetching time tracking for Service ID: ${serviceHistoryId}, Location ID: ${serviceHistoryDocData.locationId}, Service Date: ${serviceHistoryDocData.serviceDate.toDate()}`);
    if (!db) {
        console.error("DEBUG ASH: Firestore DB not available for time tracking.");
        if(shTimeTrackingList) shTimeTrackingList.innerHTML = '<p class="error-message">Database error.</p>';
        return;
    }
    if (!serviceHistoryDocData || !serviceHistoryDocData.locationId || !serviceHistoryDocData.serviceDate || !serviceHistoryDocData.serviceDate.toDate) {
        console.warn("DEBUG ASH: Missing locationId or serviceDate from service history data. Cannot fetch time tracking.");
        if(shNoTimeTracking) shNoTimeTracking.style.display = 'block';
        if(shTimeTrackingList) shTimeTrackingList.innerHTML = '';
        if(shTimeTrackingLoading) shTimeTrackingLoading.style.display = 'none';
        return;
    }

    if (shTimeTrackingLoading) shTimeTrackingLoading.style.display = 'block';
    if (shNoTimeTracking) shNoTimeTracking.style.display = 'none';
    if (shTimeTrackingList) shTimeTrackingList.innerHTML = '';

    const serviceDate = serviceHistoryDocData.serviceDate.toDate();
    // Define the day range in UTC for querying Firestore Timestamps
    const startOfServiceDayUTC = new Date(Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), serviceDate.getUTCDate(), 0, 0, 0, 0));
    const endOfServiceDayUTC = new Date(Date.UTC(serviceDate.getUTCFullYear(), serviceDate.getUTCMonth(), serviceDate.getUTCDate(), 23, 59, 59, 999));

    const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfServiceDayUTC);
    const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfServiceDayUTC);

    const assignedEmployeeIds = (serviceHistoryDocData.employeeAssignments || []).map(asgn => asgn.employeeId);
    console.log("DEBUG ASH: Assigned employee IDs for this service:", assignedEmployeeIds);

    try {
        const timeTrackingSnapshot = await db.collection('employeeTimeTracking')
            .where('locationId', '==', serviceHistoryDocData.locationId)
            .where('clockInTime', '>=', startTimestamp)
            .where('clockInTime', '<=', endTimestamp) // Could also use clockOutTime if some entries span midnight
            .orderBy('clockInTime', 'asc')
            .get();

        if (shTimeTrackingLoading) shTimeTrackingLoading.style.display = 'none';

        let relevantEntriesHtml = '';
        let relevantEntriesFound = 0;
        let mapInitQueue = []; 

        if (timeTrackingSnapshot.empty) {
            console.log("DEBUG ASH: No time tracking entries found for this location and date range in employeeTimeTracking collection.");
        } else {
            timeTrackingSnapshot.forEach(doc => {
                const entry = doc.data();
                const timeEntryId = doc.id; 

                // Filter for entries by employees actually assigned to THIS serviceHistory record
                if (assignedEmployeeIds.includes(entry.employeeProfileId)) {
                    relevantEntriesFound++;
                    const clockInTimeStr = entry.clockInTime && entry.clockInTime.toDate ? entry.clockInTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: true }) : 'N/A';
                    const clockOutTimeStr = entry.clockOutTime && entry.clockOutTime.toDate ? entry.clockOutTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: true }) : (entry.status === 'Clocked In' ? 'Still Clocked In' : 'N/A');

                    let durationStr = 'N/A';
                    if (entry.clockInTime && entry.clockOutTime && entry.clockInTime.toDate && entry.clockOutTime.toDate) {
                        const diffMs = entry.clockOutTime.toDate().getTime() - entry.clockInTime.toDate().getTime();
                        const diffMins = Math.round(diffMs / 60000);
                        durationStr = `${diffMins} mins`;
                    }

                    // Find the employee name from the serviceHistory assignments for consistency
                    const assignmentInfo = serviceHistoryDocData.employeeAssignments.find(a => a.employeeId === entry.employeeProfileId);
                    const employeeName = assignmentInfo ? assignmentInfo.employeeName : entry.employeeProfileId; 

                    relevantEntriesHtml += `<div class="time-entry-item">
                        <p><strong>Employee:</strong> ${escapeHtml(employeeName)}</p>
                        <p><strong>Clocked In:</strong> ${escapeHtml(clockInTimeStr)}</p>`;
                    if (entry.clockInCoordinates && entry.clockInCoordinates.latitude && entry.clockInCoordinates.longitude) {
                        relevantEntriesHtml += `<p><small>Location: Lat ${entry.clockInCoordinates.latitude.toFixed(5)}, Lng ${entry.clockInCoordinates.longitude.toFixed(5)}</small></p>`;
                        relevantEntriesHtml += `<div id="clock-in-map-${timeEntryId}" class="map-canvas"></div>`;
                        mapInitQueue.push({ id: `clock-in-map-${timeEntryId}`, lat: entry.clockInCoordinates.latitude, lng: entry.clockInCoordinates.longitude, title: `Clock-in: ${escapeHtml(employeeName)}` });
                    }
                    relevantEntriesHtml += `<p><strong>Clocked Out:</strong> ${escapeHtml(clockOutTimeStr)}</p>`;
                    if (entry.clockOutCoordinates && entry.clockOutCoordinates.latitude && entry.clockOutCoordinates.longitude) {
                         relevantEntriesHtml += `<p><small>Location: Lat ${entry.clockOutCoordinates.latitude.toFixed(5)}, Lng ${entry.clockOutCoordinates.longitude.toFixed(5)}</small></p>`;
                         relevantEntriesHtml += `<div id="clock-out-map-${timeEntryId}" class="map-canvas"></div>`;
                         mapInitQueue.push({ id: `clock-out-map-${timeEntryId}`, lat: entry.clockOutCoordinates.latitude, lng: entry.clockOutCoordinates.longitude, title: `Clock-out: ${escapeHtml(employeeName)}` });
                    }
                    relevantEntriesHtml += `<p><strong>Duration:</strong> ${escapeHtml(durationStr)}</p></div>`;
                }
            });
        }

        if (relevantEntriesFound > 0) {
            if (shTimeTrackingList) shTimeTrackingList.innerHTML = relevantEntriesHtml;
            if (window.googleMapsApiLoaded) { // Check if Maps API is ready
                mapInitQueue.forEach(mapItem => {
                    displayMapForTimeEntry(mapItem.id, mapItem.lat, mapItem.lng, mapItem.title);
                });
            } else {
                console.warn("DEBUG ASH: Google Maps API not ready when trying to init maps. Will try again when API loads.");
                // Set a flag or retry mechanism if maps don't load initially because initMapAsh hasn't run yet.
                // A simple way is that initMapAsh itself could check for a queue.
                window.ashMapQueue = mapInitQueue; // Store for initMapAsh to process
            }
        } else {
            console.log("DEBUG ASH: No time tracking entries found for *assigned* employees on this location/date.");
            if(shNoTimeTracking) shNoTimeTracking.style.display = 'block';
        }

    } catch (error) {
        console.error("DEBUG ASH: Error fetching time tracking data:", error);
        if (shTimeTrackingLoading) shTimeTrackingLoading.style.display = 'none';
        if (shTimeTrackingList) shTimeTrackingList.innerHTML = '<p class="error-message">Error loading time data.</p>';
    }
}

    // --- Function to render a single photo in the review gallery ---
    function renderPhotoForReview(photoData, photoId) {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-item'; 

        const img = document.createElement('img');
        img.src = photoData.photoUrl;
        img.alt = `Service photo by ${escapeHtml(photoData.employeeName || 'Unknown')}`;
        img.loading = 'lazy';
        img.addEventListener('click', () => { if (photoData.photoUrl) window.open(photoData.photoUrl, '_blank'); });
        photoDiv.appendChild(img);

        const checkboxLabel = document.createElement('label');
        checkboxLabel.style.display = 'block'; 
        checkboxLabel.style.marginTop = '5px';
        checkboxLabel.style.fontSize = '0.9em';
        checkboxLabel.style.alignItems = 'center';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        // Default to true (visible) if isClientVisible field doesn't exist on the photo document, or if it's explicitly true
        checkbox.checked = (photoData.isClientVisible === undefined) ? true : photoData.isClientVisible;
        checkbox.dataset.photoId = photoId; 
        checkbox.id = `vis-check-${photoId}`; 
        checkboxLabel.htmlFor = checkbox.id;

        checkboxLabel.appendChild(checkbox);
        checkboxLabel.appendChild(document.createTextNode(' Client Visible?')); 
        photoDiv.appendChild(checkboxLabel);

        const uploaderP = document.createElement('p');
        uploaderP.innerHTML = `By: ${escapeHtml(photoData.employeeName || 'Unknown')}`;
        photoDiv.appendChild(uploaderP);

        if (photoData.notes) {
            const notesP = document.createElement('p');
            notesP.innerHTML = `Notes: ${escapeHtml(photoData.notes)}`;
            photoDiv.appendChild(notesP);
        }
        return photoDiv;
    }

    // ADD THIS NEW HELPER FUNCTION
function displayMapForTimeEntry(mapContainerId, lat, lng, title) {
    const mapElement = document.getElementById(mapContainerId);
    if (!mapElement) {
        console.error("DEBUG ASH: Map container element not found:", mapContainerId);
        return;
    }
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.error("DEBUG ASH: Google Maps API not loaded yet for displayMapForTimeEntry. Ensure initMapAsh has been called and API key is valid.");
        mapElement.innerHTML = '<p style="color:red; font-size:0.8em;">Google Maps API not loaded. Ensure API key is correct and API is enabled.</p>';
        return;
    }
    try {
        mapElement.innerHTML = ''; // Clear any previous message
        const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
        const map = new google.maps.Map(mapElement, {
            zoom: 15, 
            center: location,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
        });
        new google.maps.Marker({
            position: location,
            map: map,
            title: title
        });
    } catch (mapError) {
        console.error("DEBUG ASH: Error initializing map for", mapContainerId, mapError);
        mapElement.innerHTML = '<p style="color:red; font-size:0.8em;">Error loading map.</p>';
    }
}

    async function handleEditServiceHistoryClick(serviceId) {
    console.log("DEBUG ASH: handleEditServiceHistoryClick called for service ID:", serviceId);

    // Get initial references from your provided block - these are top-level consts from the script
    const localAddEditForm = addEditServiceHistoryForm || document.getElementById('add-edit-service-history-form');
    const localEditIdInput = editServiceHistoryDocIdInput || document.getElementById('edit-service-history-doc-id');
    const localFormTitle = serviceHistoryFormTitle || document.getElementById('service-history-form-title');
    const localSaveButton = saveServiceHistoryButton || document.getElementById('save-service-history-button');
    // Original refs for elements that might be reset. We'll get fresh ones for population.
    const originalAdminNotesTextarea = shAdminNotesTextarea || document.getElementById('sh-admin-notes');
    const originalPhotoReviewGallery = shPhotoReviewGallery || document.getElementById('sh-photo-review-gallery');
    const originalNoPhotosReviewMsg = shNoPhotosForReview || document.getElementById('sh-no-photos-for-review');
    const originalPhotoReviewLoading = shPhotoReviewGalleryLoading || document.getElementById('sh-photo-review-gallery-loading');
    const originalTimeTrackingList = shTimeTrackingList || document.getElementById('sh-time-tracking-list');
    const originalNoTimeTrackingMsg = shNoTimeTracking || document.getElementById('sh-no-time-tracking');
    const originalTimeTrackingLoading = shTimeTrackingLoading || document.getElementById('sh-time-tracking-loading');
    const localAddEditMsgEl = addEditServiceHistoryMessageEl || document.getElementById('add-edit-service-history-message');
    const localAddEditSection = addEditServiceHistorySection || document.getElementById('add-edit-service-history-section');


    if (!db || !serviceId) {
        if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "Cannot load service: Missing ID or DB connection.", "error");
        return;
    }
    if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "Loading service record for editing...", "info");
    
    if (localAddEditForm) {
        localAddEditForm.reset();
        setFormDisabledState(localAddEditForm, true); 
    }
    
    // Reset specific UI parts using the initial references
    if (originalAdminNotesTextarea) originalAdminNotesTextarea.value = ''; 
    if (originalPhotoReviewGallery) originalPhotoReviewGallery.innerHTML = ''; 
    if (originalNoPhotosReviewMsg) originalNoPhotosReviewMsg.style.display = 'none';
    if (originalPhotoReviewLoading) originalPhotoReviewLoading.style.display = 'block';
    if (originalTimeTrackingList) originalTimeTrackingList.innerHTML = '';
    if (originalNoTimeTrackingMsg) originalNoTimeTrackingMsg.style.display = 'none'; 
    if (originalTimeTrackingLoading) originalTimeTrackingLoading.style.display = 'block';

    try {
        const docRef = db.collection('serviceHistory').doc(serviceId);
        const docSnap = await docRef.get(); 

        // CORRECTED: .exists is a property, .data() is a function
        if (docSnap.exists) {  // This was correctly docSnap in your "original"
            const data = docSnap.data(); 
            
            // Use initial const references for these top-level form elements if they were found on page load,
            // otherwise, try to get them by ID (important for modal).
            const currentEditIdInput = editServiceHistoryDocIdInput || document.getElementById('edit-service-history-doc-id');
            if (currentEditIdInput) currentEditIdInput.value = docSnap.id; 
            
            const currentFormTitle = serviceHistoryFormTitle || document.getElementById('service-history-form-title');
            if (currentFormTitle) currentFormTitle.textContent = "Edit & Review Service Record"; 
            
            const currentSaveButton = saveServiceHistoryButton || document.getElementById('save-service-history-button');
            if (currentSaveButton) currentSaveButton.textContent = "Update & Finalize Record";

            // --- Client Dropdown ---
            await populateClientDropdownForServiceHistory(); 
            const freshClientSelect = document.getElementById('sh-client-select'); // Fresh reference
            if (freshClientSelect) {
                freshClientSelect.disabled = false; 
                const targetClientId = data.clientProfileId || '';
                console.log(`DEBUG ASH: Trying to set Client to ID: '${targetClientId}'`);
                let clientOptionFound = false;
                for (let i = 0; i < freshClientSelect.options.length; i++) {
                    if (freshClientSelect.options[i].value === targetClientId) {
                        freshClientSelect.options[i].selected = true;
                        clientOptionFound = true;
                        break;
                    }
                }
                // Fallback to setting .value (might not be needed if loop works, but safe)
                if (!clientOptionFound && targetClientId !== '') {
                     freshClientSelect.value = targetClientId;
                } else if (targetClientId === '') {
                    freshClientSelect.value = ''; // Ensure placeholder is selected if target is empty
                }
                console.log(`DEBUG ASH: Client Select - Target: '${targetClientId}', Actual JS Value: '${freshClientSelect.value}', SelectedIndex: ${freshClientSelect.selectedIndex}, LoopFound: ${clientOptionFound}`);
                if (typeof(Event) === 'function') freshClientSelect.dispatchEvent(new Event('change', { bubbles: true }));
            } else { console.error("DEBUG ASH: #sh-client-select not found for setting value."); }
            
            // --- Location Dropdown ---
            if (data.clientProfileId) {
                await populateLocationDropdownForClient(data.clientProfileId); 
                const freshLocationSelect = document.getElementById('sh-location-select'); // Fresh reference
                if (freshLocationSelect) {
                    freshLocationSelect.disabled = false; 
                    const targetLocationId = data.locationId || '';
                    console.log(`DEBUG ASH: Trying to set Location to ID: '${targetLocationId}' for Client ID: '${data.clientProfileId}'`);
                    let locOptionFound = false;
                    for (let i = 0; i < freshLocationSelect.options.length; i++) {
                        if (freshLocationSelect.options[i].value === targetLocationId) {
                            freshLocationSelect.options[i].selected = true;
                            locOptionFound = true;
                            break;
                        }
                    }
                    if (!locOptionFound && targetLocationId !== '') {
                        freshLocationSelect.value = targetLocationId;
                    } else if (targetLocationId === '') {
                        freshLocationSelect.value = '';
                    }
                    console.log(`DEBUG ASH: Location Select - Target: '${targetLocationId}', Actual JS Value: '${freshLocationSelect.value}', SelectedIndex: ${freshLocationSelect.selectedIndex}, LoopFound: ${locOptionFound}`);
                    if (typeof(Event) === 'function') freshLocationSelect.dispatchEvent(new Event('change', { bubbles: true }));
                } else { console.error("DEBUG ASH: #sh-location-select not found for setting value."); }
            } else {
                const freshLocationSelect = document.getElementById('sh-location-select');
                if (freshLocationSelect) {
                    freshLocationSelect.innerHTML = '<option value="">-- Select Client First --</option>';
                    freshLocationSelect.disabled = true;
                }
            }
            
            // --- Service Date Input ---
            const freshServiceDateInput = document.getElementById('sh-service-date'); 
            if (freshServiceDateInput && data.serviceDate && data.serviceDate.toDate) {
                const dateObj = data.serviceDate.toDate();
                freshServiceDateInput.value = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
            } else if (freshServiceDateInput) { freshServiceDateInput.value = ''; }

            // --- Employee Checkboxes ---
            await populateEmployeeCheckboxes(); 
            const freshEmployeeList = document.getElementById('sh-employee-checkbox-list'); 
            if (freshEmployeeList && data.employeeAssignments && Array.isArray(data.employeeAssignments)) {
                freshEmployeeList.querySelectorAll('input[name="sh_employee"]').forEach(cb => cb.checked = false);
                data.employeeAssignments.forEach(assignedEmp => {
                    const checkbox = freshEmployeeList.querySelector(`input[name="sh_employee"][value="${assignedEmp.employeeId}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }

            // --- Other Fields (using fresh references) ---
            const freshServiceTypeInput = document.getElementById('sh-service-type');
            if (freshServiceTypeInput) freshServiceTypeInput.value = data.serviceType || '';
            const freshStatusSelect = document.getElementById('sh-status');
            if (freshStatusSelect) freshStatusSelect.value = data.status || 'Scheduled'; 
            const freshServiceNotesTextarea = document.getElementById('sh-service-notes');
            if (freshServiceNotesTextarea) freshServiceNotesTextarea.value = data.serviceNotes || ''; 
            const freshAdminNotesTextareaRef = document.getElementById('sh-admin-notes');  // Matched your original variable name
            if (freshAdminNotesTextareaRef) freshAdminNotesTextareaRef.value = data.adminNotes || ''; 

            // --- Photo Review (using fresh references) ---
            const currentPhotoReviewGallery = document.getElementById('sh-photo-review-gallery');
            const currentNoPhotosReviewMsg = document.getElementById('sh-no-photos-for-review');
            const currentPhotoReviewLoading = document.getElementById('sh-photo-review-gallery-loading');

            if(currentPhotoReviewGallery) currentPhotoReviewGallery.innerHTML = ''; 
            if(currentNoPhotosReviewMsg) currentNoPhotosReviewMsg.style.display = 'none';
            if(currentPhotoReviewLoading) currentPhotoReviewLoading.style.display = 'block';

            if (data.locationId && data.serviceDate && data.serviceDate.toDate) {
                const serviceDateObj = data.serviceDate.toDate();
                const startOfDayUTC = new Date(Date.UTC(serviceDateObj.getUTCFullYear(), serviceDateObj.getUTCMonth(), serviceDateObj.getUTCDate(), 0, 0, 0, 0));
                const endOfQueryWindowUTC = new Date(startOfDayUTC);
                endOfQueryWindowUTC.setUTCHours(startOfDayUTC.getUTCHours() + 29);
                const startOfDayTimestamp = firebase.firestore.Timestamp.fromDate(startOfDayUTC);
                const endOfQueryWindowTimestamp = firebase.firestore.Timestamp.fromDate(endOfQueryWindowUTC);
                const photosSnapshot = await db.collection('servicePhotos')
                    .where('locationId', '==', data.locationId)
                    .where('uploadedAt', '>=', startOfDayTimestamp)
                    .where('uploadedAt', '<=', endOfQueryWindowTimestamp)
                    .orderBy('uploadedAt', 'asc') 
                    .get();
                if (currentPhotoReviewLoading) currentPhotoReviewLoading.style.display = 'none';
                if (photosSnapshot.empty) {
                    if (currentNoPhotosReviewMsg) currentNoPhotosReviewMsg.style.display = 'block';
                    console.log(`DEBUG ASH: No photos found for location ${data.locationId} on ${serviceDateObj.toLocaleDateString()} during edit/review (29hr window).`);
                } else {
                    console.log(`DEBUG ASH: Found ${photosSnapshot.size} photos for review (29hr window).`);
                    photosSnapshot.forEach(photoDoc => {
                        if (currentPhotoReviewGallery) currentPhotoReviewGallery.appendChild(renderPhotoForReview(photoDoc.data(), photoDoc.id));
                    });
                }
            } else { 
                console.warn("DEBUG ASH: Cannot fetch photos for review - locationId or serviceDate missing from service history record.");
                if (currentPhotoReviewLoading) currentPhotoReviewLoading.style.display = 'none';
                if (currentNoPhotosReviewMsg) currentNoPhotosReviewMsg.style.display = 'block';
            }

            // --- Time Tracking (using fresh references) ---
            const currentTimeTrackingLoadingRef = document.getElementById('sh-time-tracking-loading');
            const currentNoTimeTrackingMsgRef = document.getElementById('sh-no-time-tracking');
            if (currentTimeTrackingLoadingRef) currentTimeTrackingLoadingRef.style.display = 'block';
            if (data) { 
                await fetchAndDisplayTimeTrackingForService(data, serviceId); 
            } else { 
                if (currentTimeTrackingLoadingRef) currentTimeTrackingLoadingRef.style.display = 'none';
                if (currentNoTimeTrackingMsgRef) currentNoTimeTrackingMsgRef.style.display = 'block';
            }
            
            // --- Apply Role-Based Field Editability ---
            // currentAdminClaims is from the outer scope of this script file
            const isSuperAdmin = currentAdminClaims && currentAdminClaims.super_admin === true;
            console.log(`DEBUG ASH: Role Check for Disabling - Is Super Admin? ${isSuperAdmin}. Claims:`, currentAdminClaims);

            // Get fresh references again for the specific fields to be disabled/enabled
            const finalClientSelect = document.getElementById('sh-client-select');
            const finalLocationSelect = document.getElementById('sh-location-select');
            const finalServiceDateInput = document.getElementById('sh-service-date');
            const finalServiceTypeInput = document.getElementById('sh-service-type');

            if (finalClientSelect) finalClientSelect.disabled = !isSuperAdmin;
            if (finalLocationSelect) finalLocationSelect.disabled = !isSuperAdmin;
            if (finalServiceDateInput) finalServiceDateInput.disabled = !isSuperAdmin;
            if (finalServiceTypeInput) finalServiceTypeInput.disabled = !isSuperAdmin;

            if (!isSuperAdmin) {
                console.log("DEBUG ASH: Standard admin. Client, Location, Date, Service Type fields DISABLED.");
            } else {
                console.log("DEBUG ASH: Super admin. Client, Location, Date, Service Type fields ENABLED.");
            }
            // --- End Role-Based Field Editability ---
            
            const currentAddEditMsgEl = document.getElementById('add-edit-service-history-message');
            if(currentAddEditMsgEl) showGeneralMessage(currentAddEditMsgEl, '', 'info'); 
            
            if (document.body.classList.contains('on-service-history-page')) {
                const currentAddEditSection = document.getElementById('add-edit-service-history-section');
                if (currentAddEditSection) showPageSection(currentAddEditSection);
            } else {
                // For modal, the overall form enabling/disabling is handled by the finally block.
                // Role restrictions are applied above.
                console.log("DEBUG ASH: Edit form populated within modal context. Role restrictions applied.");
            }
                 
        } else { // This 'else' corresponds to 'if (docSnap.exists)'
            console.error("DEBUG ASH: Service record not found for ID:", serviceId);
            const currentAddEditMsgElNotFound = document.getElementById('add-edit-service-history-message');
            if(currentAddEditMsgElNotFound) showGeneralMessage(currentAddEditMsgElNotFound, "Error: Service record not found. It might have been deleted.", "error");
            if (document.body.classList.contains('on-service-history-page')) {
                const freshListView = document.getElementById('service-history-list-view'); // Use fresh reference
                if (freshListView) showPageSection(freshListView); 
            }
        } 
    } catch (error) { 
        console.error("DEBUG ASH: Error in handleEditServiceHistoryClick's try block:", error); 
        const currentAddEditMsgElError = document.getElementById('add-edit-service-history-message');
        if(currentAddEditMsgElError) showGeneralMessage(currentAddEditMsgElError, `Error loading service details: ${error.message}`, "error");
        
        const errorPhotoLoading = document.getElementById('sh-photo-review-gallery-loading');
        if (errorPhotoLoading) errorPhotoLoading.style.display = 'none';
        const errorTimeLoading = document.getElementById('sh-time-tracking-loading');
        if (errorTimeLoading) errorTimeLoading.style.display = 'none';
    } finally { 
        const finalFormRef = document.getElementById('add-edit-service-history-form');
        if(finalFormRef) {
            setFormDisabledState(finalFormRef, false); 
            
            // Re-apply specific disabling if not super admin AFTER enabling the whole form
            // Ensure currentAdminClaims is available here from the script's outer scope
            if (currentAdminClaims && !currentAdminClaims.super_admin) {
                const recheckClientSelect = document.getElementById('sh-client-select');
                const recheckLocationSelect = document.getElementById('sh-location-select');
                const recheckServiceDateInput = document.getElementById('sh-service-date');
                const recheckServiceTypeInput = document.getElementById('sh-service-type');

                if (recheckClientSelect) recheckClientSelect.disabled = true;
                if (recheckLocationSelect) recheckLocationSelect.disabled = true;
                if (recheckServiceDateInput) recheckServiceDateInput.disabled = true;
                if (recheckServiceTypeInput) recheckServiceTypeInput.disabled = true;
                console.log("DEBUG ASH (finally): Re-applied field disabling for standard admin.");
            } else if (currentAdminClaims && currentAdminClaims.super_admin) {
                 console.log("DEBUG ASH (finally): Super admin, all relevant fields remain enabled after form re-enable.");
            } else {
                // This case could happen if currentAdminClaims is null/undefined when finally runs.
                // For safety, assume restricted if claims are uncertain, or decide on a default.
                console.warn("DEBUG ASH (finally): currentAdminClaims not fully available. Defaulting to restricted fields if they exist.");
                const recheckClientSelect = document.getElementById('sh-client-select');
                if (recheckClientSelect) recheckClientSelect.disabled = true; // Default to disabled if unsure
                // ... and so on for other fields if you want a "secure default"
            }
        }
    }
}
    
    async function handleSaveServiceHistorySubmit(event) { 
     // event might be undefined if called directly, but usually it's from form submit
     if(event) event.preventDefault(); 
     console.log("DEBUG ASH: handleSaveServiceHistorySubmit called.");

     // Get local references to form elements
     const localForm = addEditServiceHistoryForm || document.getElementById('add-edit-service-history-form');
     const localEditIdInput = editServiceHistoryDocIdInput || document.getElementById('edit-service-history-doc-id');
     const localSaveButton = saveServiceHistoryButton || document.getElementById('save-service-history-button');
     const localClientSelect = shClientSelect || document.getElementById('sh-client-select');
     const localLocationSelect = shLocationSelect || document.getElementById('sh-location-select');
     const localServiceDateInput = shServiceDateInput || document.getElementById('sh-service-date');
     const localServiceTypeInput = shServiceTypeInput || document.getElementById('sh-service-type');
     const localNotesTextarea = shServiceNotesTextarea || document.getElementById('sh-service-notes');
     const localAdminNotesTextarea = shAdminNotesTextarea || document.getElementById('sh-admin-notes');
     const localStatusSelect = shStatusSelect || document.getElementById('sh-status');
     const localEmployeeListContainer = shEmployeeCheckboxList || document.getElementById('sh-employee-checkbox-list'); // container
     const localPhotoReviewGallery = shPhotoReviewGallery || document.getElementById('sh-photo-review-gallery');
     const localAddEditMsgEl = addEditServiceHistoryMessageEl || document.getElementById('add-edit-service-history-message');

     if (!db || !serverTimestamp || !currentAdminUser) { 
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, 'System error or not logged in. Please refresh.', 'error');
         return;
     }
     
     const editId = localEditIdInput ? localEditIdInput.value : '';
     const isEditMode = !!editId;

     if(localForm) setFormDisabledState(localForm, true);
     const saveButtonActionText = isEditMode ? "Updating & Finalizing Record" : "Saving Service Record";
     if(localSaveButton) localSaveButton.textContent = saveButtonActionText.includes("Finalizing") ? "Finalizing..." : (isEditMode ? 'Updating...' : 'Adding...');
     if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, isEditMode ? 'Updating service record...' : 'Adding new service record...', 'info');
     
     const clientId = localClientSelect ? localClientSelect.value : '';
     const locationId = localLocationSelect ? localLocationSelect.value : '';
     const serviceDateStr = localServiceDateInput ? localServiceDateInput.value : '';
     const serviceType = localServiceTypeInput ? localServiceTypeInput.value.trim() : '';
     const originalServiceNotes = localNotesTextarea ? localNotesTextarea.value.trim() : ''; 
     const adminNotes = localAdminNotesTextarea ? localAdminNotesTextarea.value.trim() : '';
     const statusVal = localStatusSelect ? localStatusSelect.value : '';

     const employeeAssignments = [];
     if (localEmployeeListContainer) {
         localEmployeeListContainer.querySelectorAll('input[name="sh_employee"]:checked').forEach(cb => {
             employeeAssignments.push({
                 employeeId: cb.value,
                 employeeName: cb.getAttribute('data-name') || 'Unknown Name'
             });
         });
     }

     if (!clientId || !locationId || !serviceDateStr || !statusVal ) {
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "Client, Location, Date, and Status are required.", 'error');
         if(localForm) setFormDisabledState(localForm, false);
         if(localSaveButton) localSaveButton.textContent = saveButtonActionText;
         return;
     }
     if (statusVal === 'Completed' && employeeAssignments.length === 0) {
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, "At least one employee must be assigned for a 'Completed' service.", 'error');
         if(localForm) setFormDisabledState(localForm, false);
         if(localSaveButton) localSaveButton.textContent = saveButtonActionText;
         return;
     }

     let serviceDateTimestamp;
     try {
         const dateParts = serviceDateStr.split('-'); 
         const year = parseInt(dateParts[0]);
         const month = parseInt(dateParts[1]) - 1; 
         const day = parseInt(dateParts[2]);
         const jsUTCDate = new Date(Date.UTC(year, month, day)); 
         if (isNaN(jsUTCDate.getTime())) throw new Error("Invalid date format entered.");
         serviceDateTimestamp = firebase.firestore.Timestamp.fromDate(jsUTCDate);
     } catch (dateError) {
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, `Invalid Service Date: ${dateError.message}`, 'error');
         if(localForm) setFormDisabledState(localForm, false);
         if(localSaveButton) localSaveButton.textContent = saveButtonActionText;
         return;
     }

     const clientName = localClientSelect && localClientSelect.options[localClientSelect.selectedIndex] ? localClientSelect.options[localClientSelect.selectedIndex]?.textContent?.split('(')[0].trim() : null;
     const locationName = localLocationSelect && localLocationSelect.options[localLocationSelect.selectedIndex] ? localLocationSelect.options[localLocationSelect.selectedIndex]?.textContent?.split('(')[0].trim() : null;
     
     const serviceHistoryData = {
         clientProfileId: clientId, 
         clientName: clientName, 
         locationId: locationId, 
         locationName: locationName,
         employeeAssignments: employeeAssignments, 
         serviceDate: serviceDateTimestamp, 
         serviceType: serviceType || "General Cleaning", 
         serviceNotes: originalServiceNotes || null, 
         adminNotes: adminNotes || null,
         status: statusVal, 
         updatedAt: serverTimestamp() 
     };

     if (!isEditMode) {
         serviceHistoryData.createdAt = serverTimestamp();
         serviceHistoryData.payrollProcessed = false; 
     } else { 
         if (serviceHistoryData.status === 'Completed') {
              serviceHistoryData.payrollProcessed = false; 
         }
     }

     const historyCollectionRef = db.collection('serviceHistory');
     const photoUpdatesBatch = db.batch();
     let photoUpdatesCount = 0;

     if (localPhotoReviewGallery && isEditMode) { 
         localPhotoReviewGallery.querySelectorAll('input[type="checkbox"][data-photo-id]').forEach(checkbox => {
             const photoId = checkbox.dataset.photoId;
             const isClientVisible = checkbox.checked;
             if (photoId) { 
                 const photoDocRef = db.collection('servicePhotos').doc(photoId);
                 photoUpdatesBatch.update(photoDocRef, { isClientVisible: isClientVisible, updatedAt: serverTimestamp() });
                 photoUpdatesCount++;
             }
         });
     }

     try {
         if (isEditMode) {
             await historyCollectionRef.doc(editId).update(serviceHistoryData);
         } else {
             const newDocRef = await historyCollectionRef.add(serviceHistoryData);
             // If creating, update the editIdInput in case it's needed by subsequent logic (though unlikely in modal)
             if (localEditIdInput && !isEditMode) localEditIdInput.value = newDocRef.id;
         }
         
         if (photoUpdatesCount > 0) {
             await photoUpdatesBatch.commit();
             console.log(`DEBUG ASH: Updated visibility for ${photoUpdatesCount} photos.`);
         }

         const successMsg = isEditMode ? "Service record updated successfully!" : "New service record added successfully!";
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, successMsg, 'success');

         if (serviceHistoryData.status === 'Completed' && locationId && serviceDateTimestamp) {
             try { 
                 await db.collection('locations').doc(locationId).update({ lastServiceDate: serviceDateTimestamp }); 
                 console.log("DEBUG ASH: Updated lastServiceDate for location:", locationId);
             } catch (locErr) { 
                 console.warn("DEBUG ASH: Failed to update lastServiceDate for location:", locErr);
                 if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, `${successMsg} (Warning: Could not update location's last service date.)`, 'warning'); 
             }
         }
         
         // Reset form elements if they exist
         if (localForm) localForm.reset();
         if (localAdminNotesTextarea) localAdminNotesTextarea.value = '';
         if (localPhotoReviewGallery) localPhotoReviewGallery.innerHTML = '';
         const currentLocalNoPhotosReviewMsg = document.getElementById('sh-no-photos-for-review');
         const currentLocalPhotoReviewLoading = document.getElementById('sh-photo-review-gallery-loading');
         if(currentLocalNoPhotosReviewMsg) currentLocalNoPhotosReviewMsg.style.display = 'block';
         if(currentLocalPhotoReviewLoading) currentLocalPhotoReviewLoading.style.display = 'none';


         // Only call loadServiceHistory and showPageSection if on the dedicated service history page
         if (document.body.classList.contains('on-service-history-page')) {
             loadServiceHistory(); 
             setTimeout(() => { 
                 const localListView = serviceHistoryListView || document.getElementById('service-history-list-view');
                 if (localListView) showPageSection(localListView); 
                 if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, '', 'info'); 
             }, 1500);
         } else {
             // On dashboard, the admin-portal.js will handle modal closing and list refreshing
             console.log("DEBUG ASH: Save successful in modal context. Dashboard script will handle UI updates.");
         }

     } catch (error) {
         console.error("DEBUG ASH: Error saving service history record:", error);
         if(localAddEditMsgEl) showGeneralMessage(localAddEditMsgEl, `Error saving record: ${error.message}`, 'error');
     } finally {
         if(localForm) setFormDisabledState(localForm, false);
         if(localSaveButton) localSaveButton.textContent = saveButtonActionText;
     }
 }
    
    async function handleDeleteServiceHistoryClick(serviceId, clientName, locationName, serviceDateDisplay) {
        console.log("DEBUG ASH: handleDeleteServiceHistoryClick called for ID:", serviceId);
        if (!db || !serviceId ) {
            alert("Error: Cannot delete service. Missing ID or DB connection.");
            return;
        }
        if (!currentAdminClaims) { 
             console.warn("DEBUG ASH: Admin claims not available for delete operation. Attempting to refresh.");
             if (currentAdminUser) {
                 try {
                    const idTokenResult = await currentAdminUser.getIdTokenResult(true);
                    currentAdminClaims = idTokenResult.claims;
                    console.log("DEBUG ASH: Claims refreshed for delete operation.");
                 } catch (claimsError) {
                     console.error("DEBUG ASH: Error refreshing claims for delete operation:", claimsError);
                     alert("Error: Could not verify admin permissions. Please try again.");
                     return;
                 }
             } else { 
                 alert("Error: Admin user not authenticated. Cannot delete.");
                 return;
             }
        }
        
        if (!(currentAdminClaims && currentAdminClaims.super_admin === true)) { 
            alert("Error: You do not have permission to delete service records.");
            return;
        }

        const confirmationMessage = `Are you absolutely sure you want to delete the service record for:
Client: ${escapeHtml(clientName)}
Location: ${escapeHtml(locationName)}
Date: ${escapeHtml(serviceDateDisplay)}
ID: ${escapeHtml(serviceId)}

This action cannot be undone!`;

        if (confirm(confirmationMessage)) {
            console.log(`DEBUG ASH: Attempting to delete serviceHistory/${serviceId}`);
            try {
                await db.collection('serviceHistory').doc(serviceId).delete();
                // TODO: Optionally, delete related photos from servicePhotos and Firebase Storage
                // This requires querying servicePhotos where serviceHistoryId === serviceId, then iterating
                // to delete each photo from Storage and then its Firestore document.
                alert("Service record deleted successfully."); 
                console.log(`DEBUG ASH: Successfully deleted serviceHistory/${serviceId}`);
                loadServiceHistory(); 
                showPageSection(serviceHistoryListView); 
            } catch (error) {
                console.error("DEBUG ASH: Error deleting service record:", error);
                alert(`Error deleting record: ${error.message}`);
            }
        } else {
            console.log("DEBUG ASH: Deletion cancelled by user for service ID:", serviceId);
        }
    }

    console.log("DEBUG ASH: Admin Service History script (V5.3) fully initialized."); // Keep version consistent with file top

    // Expose functions needed by the dashboard modal
window.ashFormHandler = {
    handleEditServiceHistoryClick, // Will be modified to accept params
    handleSaveServiceHistorySubmit, // Will be modified to accept params
    populateClientDropdownForServiceHistory, // Relies on db from its own scope (can also be modified if needed)
    populateLocationDropdownForClient,   // Relies on db from its own scope
    populateEmployeeCheckboxes,          // Relies on db from its own scope
    renderPhotoForReview,
    fetchAndDisplayTimeTrackingForService, // Relies on db from its own scope
    setFormDisabledState,
    showGeneralMessage,
    escapeHtml
    // NOTE: populate..., render..., fetchAndDisplay... still use the 'db' from admin-service-history.js scope.
    // This is usually fine as db is initialized once. If issues persist, they'd also need 'db' passed.
};
console.log("DEBUG ASH: Service History form handler functions exposed to window.ashFormHandler (modified for params).");
});
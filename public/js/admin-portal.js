// public/js/admin-portal.js
// v10.4 - Dashboard: Modal integration for service history editor.

// Global variables
let db, auth, serverTimestampFunction;
let currentUser = null;
const triggerUrlProcessPayroll =
  "https://us-central1-cleveland-clean-portal.cloudfunctions.net/processCompletedJobsPayroll";
const triggerUrlCreate =
  "https://us-central1-cleveland-clean-portal.cloudfunctions.net/createNewUser_v1";

// Global dropdown population functions
async function populateQASClientDropdown() {
  const qasClientSelect = document.getElementById("qas-client-select");
  if (!db || !qasClientSelect) {
    console.error(
      "DEBUG AP: DB or qasClientSelect missing for Quick Add Service form."
    );
    if (qasClientSelect)
      qasClientSelect.innerHTML = '<option value="">Error loading</option>';
    return;
  }
  qasClientSelect.disabled = true;
  qasClientSelect.innerHTML = '<option value="">-- Loading Clients --</option>';
  try {
    const snapshot = await db
      .collection("clientMasterList")
      .where("status", "==", true)
      .orderBy("companyName", "asc")
      .get();
    let optionsHtml = '<option value="">-- Select Client --</option>';
    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        optionsHtml += `<option value="${
          doc.id
        }" data-client-name="${escapeHtml(
          doc.data().companyName
        )}">${escapeHtml(doc.data().companyName)}</option>`;
      });
    } else {
      optionsHtml = '<option value="">-- No Active Clients --</option>';
    }
    qasClientSelect.innerHTML = optionsHtml;
  } catch (error) {
    console.error("DEBUG AP: Error populating QAS client dropdown:", error);
    qasClientSelect.innerHTML = '<option value="">-- Error Loading --</option>';
    const qasMessageEl = document.getElementById("qas-message");
    if (qasMessageEl)
      showFormMessage(qasMessageEl, "Error loading clients.", "error");
  } finally {
    qasClientSelect.disabled = false;
  }
}

async function populateQASLocationDropdown(clientId) {
  const qasLocationSelect = document.getElementById("qas-location-select");
  if (!db || !qasLocationSelect) {
    console.error(
      "DEBUG AP: DB or qasLocationSelect missing for Quick Add Service form."
    );
    if (qasLocationSelect)
      qasLocationSelect.innerHTML = '<option value="">Error loading</option>';
    return;
  }
  qasLocationSelect.disabled = true;
  qasLocationSelect.innerHTML =
    '<option value="">-- Loading Locations --</option>';

  if (!clientId) {
    qasLocationSelect.innerHTML =
      '<option value="">-- Select Client First --</option>';
    return;
  }
  try {
    const snapshot = await db
      .collection("locations")
      .where("clientProfileId", "==", clientId)
      .where("status", "==", true)
      .orderBy("locationName", "asc")
      .get();
    let optionsHtml = '<option value="">-- Select Location --</option>';
    if (!snapshot.empty) {
      snapshot.forEach((doc) => {
        optionsHtml += `<option value="${
          doc.id
        }" data-location-name="${escapeHtml(
          doc.data().locationName
        )}">${escapeHtml(
          doc.data().locationName || "Unnamed Location"
        )}</option>`;
      });
    } else {
      optionsHtml =
        '<option value="">-- No Active Locations for this Client --</option>';
    }
    qasLocationSelect.innerHTML = optionsHtml;
  } catch (error) {
    console.error("DEBUG AP: Error populating QAS location dropdown:", error);
    qasLocationSelect.innerHTML =
      '<option value="">-- Error Loading --</option>';
    const qasMessageEl = document.getElementById("qas-message");
    if (qasMessageEl)
      showFormMessage(qasMessageEl, "Error loading locations.", "error");
  } finally {
    qasLocationSelect.disabled = false;
  }
}

// Global utility functions
function escapeHtml(unsafe) {
  if (unsafe === null || typeof unsafe === "undefined") return "";
  if (typeof unsafe !== "string") {
    if (typeof unsafe === "number" || typeof unsafe === "boolean") {
      return String(unsafe);
    }
    return "[Invalid Data]";
  }
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showFormMessage(el, message, type = "info") {
  if (el) {
    el.textContent = message;
    el.className = `form-message ${type}`;
    el.style.display = message ? "block" : "none";
  }
}

function setFormDisabled(form, disabled) {
  if (!form) return;
  const elements = form.querySelectorAll("input, select, textarea, button");
  elements.forEach((el) => (el.disabled = disabled));
}

// Global Quick Add handler functions
async function handleQuickAddClientSubmit(event) {
  event.preventDefault();
  if (!auth.currentUser) {
    showFormMessage(
      document.getElementById("qas-client-message"),
      "Error: No authenticated admin user found. Please re-login.",
      "error"
    );
    return;
  }

  const form = document.getElementById("quick-add-client-form");
  const messageEl = document.getElementById("qas-client-message");
  setFormDisabled(form, true);
  showFormMessage(messageEl, "Creating client login and profile...", "info");

  const companyName = document
    .getElementById("qas-client-company-name")
    .value.trim();
  const contactName = document
    .getElementById("qas-client-contact-name")
    .value.trim();
  const clientIdString = document
    .getElementById("qas-client-id-string")
    .value.trim();
  const email = document.getElementById("qas-client-email").value.trim();
  const phone = document.getElementById("qas-client-phone").value.trim();
  const password = document.getElementById("qas-client-initial-password").value;

  if (!clientIdString || !companyName || !contactName || !email || !password) {
    showFormMessage(
      messageEl,
      "Client ID String, Company, Contact Name, Email, and Initial Password are required.",
      "error"
    );
    setFormDisabled(form, false);
    return;
  }
  if (password.length < 6) {
    showFormMessage(
      messageEl,
      "Password must be at least 6 characters.",
      "error"
    );
    setFormDisabled(form, false);
    return;
  }

  const userData = {
    email: email,
    password: password,
    role: "client",
    clientIdString: clientIdString,
    companyName: companyName,
    contactName: contactName,
    phone: phone,
  };

  try {
    const idToken = await auth.currentUser.getIdToken(true);
    console.log(
      `DEBUG: Calling createNewUser_v1 Cloud Function for client: ${email}`
    );
    const response = await fetch(triggerUrlCreate, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });
    const resultData = await response.json();

    if (!response.ok) {
      console.error(
        `DEBUG: createNewUser_v1 failed. Status: ${response.status}`,
        resultData
      );
      let specificError =
        resultData.error?.message ||
        resultData.message ||
        `HTTP error! status: ${response.status}.`;
      if (
        resultData.error?.code === "already-exists" ||
        resultData.error?.code === "functions/already-exists"
      ) {
        specificError = `Error: ${specificError}`;
      }
      showFormMessage(messageEl, specificError, "error");
    } else if (resultData && resultData.success) {
      console.log(
        `DEBUG: Client created successfully via Cloud Function:`,
        resultData
      );
      showFormMessage(
        messageEl,
        resultData.message || `Client ${contactName} created successfully!`,
        "success"
      );
      form.reset();
      if (typeof refreshDashboardLists === "function") {
        await refreshDashboardLists();
      }
      setTimeout(() => {
        showFormMessage(messageEl, "", "info");
      }, 2000);
    } else {
      throw new Error(
        resultData.message ||
          "Cloud Function call for client creation reported an unspecified failure."
      );
    }
  } catch (error) {
    console.error("DEBUG: Error during client creation process:", error);
    if (!messageEl.textContent.toLowerCase().includes("error")) {
      showFormMessage(
        messageEl,
        `Error creating client: ${error.message}`,
        "error"
      );
    }
  } finally {
    setFormDisabled(form, false);
  }
}

async function handleQuickAddLocationSubmit(event) {
  event.preventDefault();
  if (!auth.currentUser) {
    showFormMessage(
      document.getElementById("qas-location-message"),
      "Error: No authenticated admin user found. Please re-login.",
      "error"
    );
    return;
  }

  const form = document.getElementById("quick-add-location-form");
  const messageEl = document.getElementById("qas-location-message");
  setFormDisabled(form, true);
  showFormMessage(messageEl, "Creating location...", "info");

  const clientId = document.getElementById("qas-location-client-select").value;
  const locationName = document
    .getElementById("qas-location-name")
    .value.trim();
  const locationIdString = document
    .getElementById("qas-location-id-string")
    .value.trim();
  const addressStreet = document
    .getElementById("qas-location-address-street")
    .value.trim();
  const addressCity = document
    .getElementById("qas-location-address-city")
    .value.trim();
  const addressState = document
    .getElementById("qas-location-address-state")
    .value.trim();
  const addressZip = document
    .getElementById("qas-location-address-zip")
    .value.trim();
  const contactName = document
    .getElementById("qas-location-contact-name")
    .value.trim();
  const contactPhone = document
    .getElementById("qas-location-contact-phone")
    .value.trim();
  const serviceFrequency = document.getElementById(
    "qas-location-service-frequency"
  ).value;
  const status =
    document.getElementById("qas-location-status").value === "true";

  if (
    !clientId ||
    !locationName ||
    !locationIdString ||
    !addressStreet ||
    !addressCity ||
    !addressState ||
    !addressZip
  ) {
    showFormMessage(
      messageEl,
      "Client, Location Name, Location ID, and Address fields are required.",
      "error"
    );
    setFormDisabled(form, false);
    return;
  }

  const locationData = {
    clientProfileId: clientId,
    locationName: locationName,
    locationIdString: locationIdString,
    address: {
      street: addressStreet,
      city: addressCity,
      state: addressState,
      zip: addressZip,
    },
    contactName: contactName,
    contactPhone: contactPhone,
    serviceFrequency: serviceFrequency,
    status: status,
    createdAt: serverTimestampFunction(),
    updatedAt: serverTimestampFunction(),
  };

  try {
    await db.collection("locations").add(locationData);
    showFormMessage(
      messageEl,
      `Location ${locationName} created successfully!`,
      "success"
    );
    form.reset();
    if (typeof refreshDashboardLists === "function") {
      await refreshDashboardLists();
    }
    setTimeout(() => {
      showFormMessage(messageEl, "", "info");
    }, 2000);
  } catch (error) {
    console.error("DEBUG: Error creating location:", error);
    showFormMessage(
      messageEl,
      `Error creating location: ${error.message}`,
      "error"
    );
  } finally {
    setFormDisabled(form, false);
  }
}

async function handleQuickAddEmployeeSubmit(event) {
  event.preventDefault();
  if (!auth.currentUser) {
    showFormMessage(
      document.getElementById("qas-employee-message"),
      "Error: No authenticated admin user found. Please re-login.",
      "error"
    );
    return;
  }

  const form = document.getElementById("quick-add-employee-form");
  const messageEl = document.getElementById("qas-employee-message");
  setFormDisabled(form, true);
  showFormMessage(messageEl, "Creating employee...", "info");

  const firstName = document
    .getElementById("qas-employee-first-name")
    .value.trim();
  const lastName = document
    .getElementById("qas-employee-last-name")
    .value.trim();
  const employeeIdString = document
    .getElementById("qas-employee-id-string")
    .value.trim();
  const email = document
    .getElementById("qas-employee-email")
    .value.trim()
    .toLowerCase();
  const phone = document.getElementById("qas-employee-phone").value.trim();
  const jobTitle = document
    .getElementById("qas-employee-job-title")
    .value.trim();
  const password = document.getElementById(
    "qas-employee-initial-password"
  ).value;

  if (!employeeIdString || !firstName || !lastName || !email || !password) {
    showFormMessage(
      messageEl,
      "ID, Name, Email, and Password are required.",
      "error"
    );
    setFormDisabled(form, false);
    return;
  }

  const employeeData = {
    firstName: firstName,
    lastName: lastName,
    employeeIdString: employeeIdString,
    email: email,
    phone: phone,
    jobTitle: jobTitle,
    status: true,
    role: "employee",
  };

  try {
    const idToken = await auth.currentUser.getIdToken(true);
    const cloudFunctionData = { ...employeeData, password: password };
    const response = await fetch(triggerUrlCreate, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(cloudFunctionData),
    });
    const resultData = await response.json();

    if (!response.ok)
      throw new Error(
        resultData.error?.message ||
          resultData.message ||
          `Server error: ${response.status}`
      );
    if (resultData.success) {
      showFormMessage(
        messageEl,
        resultData.message || "Employee created!",
        "success"
      );
      form.reset();
      if (typeof refreshDashboardLists === "function") {
        await refreshDashboardLists();
      }
      setTimeout(() => {
        showFormMessage(messageEl, "", "info");
      }, 2000);
    } else {
      throw new Error(resultData.message || "Cloud function failed.");
    }
  } catch (error) {
    console.error("DEBUG: Error creating employee:", error);
    showFormMessage(messageEl, `Error: ${error.message}`, "error");
  } finally {
    setFormDisabled(form, false);
  }
}

async function handleQuickAddServiceSubmit(event) {
  event.preventDefault();
  if (!db || !currentUser || !serverTimestampFunction) {
    showFormMessage(
      document.getElementById("qas-message"),
      "System error or not logged in. Please refresh.",
      "error"
    );
    return;
  }
  const quickAddServiceForm = document.getElementById("quick-add-service-form");
  if (quickAddServiceForm) setFormDisabled(quickAddServiceForm, true);
  showFormMessage(
    document.getElementById("qas-message"),
    "Scheduling new service...",
    "info"
  );

  const serviceMode = document.querySelector(
    'input[name="qas-service-mode"]:checked'
  ).value;
  const serviceDateStr = document.getElementById("qas-service-date").value;
  const serviceTimeStr = document.getElementById("qas-service-time").value;
  let serviceTypeNotes = document
    .getElementById("qas-service-type")
    .value.trim();

  let clientId,
    locationId,
    clientName,
    locationName,
    customPrice = null;

  if (serviceMode === "regular") {
    // Regular service using existing client/location
    const qasClientSelect = document.getElementById("qas-client-select");
    const qasLocationSelect = document.getElementById("qas-location-select");
    clientId = qasClientSelect.value;
    locationId = qasLocationSelect.value;
    clientName =
      qasClientSelect.options[qasClientSelect.selectedIndex]?.dataset
        .clientName || "Unknown Client";
    locationName =
      qasLocationSelect.options[qasLocationSelect.selectedIndex]?.dataset
        .locationName || "Unknown Location";

    if (!clientId || !locationId || !serviceDateStr) {
      showFormMessage(
        document.getElementById("qas-message"),
        "Client, Location, and Service Date are required.",
        "error"
      );
      if (quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
      return;
    }
  } else {
    // Custom service with manual input
    clientName = document.getElementById("qas-custom-client").value.trim();
    locationName = document.getElementById("qas-custom-location").value.trim();
    const customContact = document
      .getElementById("qas-custom-contact")
      .value.trim();
    const customPriceValue = document.getElementById("qas-custom-price").value;

    if (!clientName || !locationName || !serviceDateStr) {
      showFormMessage(
        document.getElementById("qas-message"),
        "Client Name, Location, and Service Date are required for custom jobs.",
        "error"
      );
      if (quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
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
    const dateParts = serviceDateStr.split("-");
    let year = parseInt(dateParts[0]);
    let month = parseInt(dateParts[1]) - 1;
    let day = parseInt(dateParts[2]);
    let hours = 9;
    let minutes = 0;

    if (serviceTimeStr) {
      const timeParts = serviceTimeStr.split(":");
      hours = parseInt(timeParts[0]);
      minutes = parseInt(timeParts[1]);
    }

    // Create date in local timezone (Cleveland/Eastern Time) instead of UTC
    const serviceDate = new Date(year, month, day, hours, minutes);

    if (isNaN(serviceDate.getTime()))
      throw new Error("Invalid date or time format.");

    console.log(
      `DEBUG AP: Service scheduled for: ${serviceDate.toLocaleString()} (Local: ${serviceDate.toLocaleDateString()} ${serviceDate.toLocaleTimeString()})`
    );
    serviceDateTimestamp = firebase.firestore.Timestamp.fromDate(serviceDate);
  } catch (dateError) {
    showFormMessage(
      document.getElementById("qas-message"),
      `Invalid Service Date/Time: ${dateError.message}`,
      "error"
    );
    if (quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
    return;
  }

  const newServiceRecord = {
    clientProfileId: clientId,
    clientName: clientName,
    locationId: locationId,
    locationName: locationName,
    serviceDate: serviceDateTimestamp,
    serviceType:
      serviceTypeNotes ||
      (serviceMode === "custom" ? "Custom Service" : "Scheduled Service"),
    serviceNotes: null,
    adminNotes: null,
    employeeAssignments: [],
    status: "Scheduled",
    payrollProcessed: false,
    isCustomJob: serviceMode === "custom",
    customPrice: customPrice,
    createdAt: serverTimestampFunction(),
    updatedAt: serverTimestampFunction(),
  };

  try {
    await db.collection("serviceHistory").add(newServiceRecord);
    showFormMessage(
      document.getElementById("qas-message"),
      "New service scheduled successfully!",
      "success"
    );
    if (quickAddServiceForm) quickAddServiceForm.reset();

    // Reset service mode to regular
    document.getElementById("qas-regular-service").checked = true;
    document.getElementById("qas-regular-fields").classList.remove("hidden");
    document.getElementById("qas-custom-fields").classList.add("hidden");

    const qasLocationSelect = document.getElementById("qas-location-select");
    if (qasLocationSelect) {
      qasLocationSelect.innerHTML =
        '<option value="">Select Client First</option>';
      qasLocationSelect.disabled = true;
    }
    const qasClientSelect = document.getElementById("qas-client-select");
    if (qasClientSelect) qasClientSelect.value = "";

    if (typeof refreshDashboardLists === "function") {
      await refreshDashboardLists(); // Use the refresh function
    }

    setTimeout(() => {
      const quickAddServiceFormContainer = document.getElementById(
        "quick-add-service-form-container"
      );
      if (quickAddServiceFormContainer)
        quickAddServiceFormContainer.style.display = "none";
      showFormMessage(document.getElementById("qas-message"), "", "info");
    }, 2000);
  } catch (error) {
    console.error("DEBUG AP: Error quick adding service record:", error);
    showFormMessage(
      document.getElementById("qas-message"),
      `Error scheduling service: ${error.message}`,
      "error"
    );
  } finally {
    if (quickAddServiceForm) setFormDisabled(quickAddServiceForm, false);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("DEBUG: Admin Dashboard script running (v10.4 - Modal Editor).");

  // --- Editor Check ---
  if (window.self !== window.top) {
    console.log("DEBUG: Running inside editor iframe. Skipping auth checks.");
    const d = document.getElementById("admin-dashboard-content");
    const loadingMsg = document.getElementById("admin-loading-message");
    if (loadingMsg) loadingMsg.style.display = "none";
    if (d) d.style.display = "block";
    const w = document.getElementById("welcome-message");
    if (w) w.textContent = "Editing Admin Dashboard (Auth Disabled)";
    document
      .querySelectorAll(
        "#admin-dashboard-content button:not(.reveal-password-btn)"
      )
      .forEach((btn) => (btn.disabled = true));
    return;
  }

  // --- Get references for elements ---
  const welcomeMessageEl = document.getElementById("welcome-message");
  const logoutButton = document.getElementById("logout-button");
  const dashboardContentEl = document.getElementById("admin-dashboard-content");
  const adminLoadingMessageEl = document.getElementById(
    "admin-loading-message"
  );

  const goToEmployeePortalLink = document.getElementById(
    "go-to-employee-portal-link"
  );

  const triggerPayrollButton = document.getElementById(
    "trigger-payroll-button"
  );
  const payrollProcessingMessageEl = document.getElementById(
    "payroll-processing-message"
  );

  const adminSecuritySection = document.getElementById(
    "admin-security-section"
  );
  const showPasswordButtonContainer = document.getElementById(
    "show-password-button-container"
  );
  const showAdminPasswordFormBtn = document.getElementById(
    "show-admin-password-form-btn"
  );
  const changePasswordSection = document.getElementById(
    "change-password-section"
  );
  const changePasswordForm = document.getElementById("change-password-form");
  const currentPasswordInput = document.getElementById("current-password");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const passwordMessageEl = document.getElementById("password-message");

  const todayServicesListEl = document.getElementById("today-services-list"); // Added for consistency
  const tomorrowServicesListEl = document.getElementById(
    "tomorrow-services-list"
  ); // Added for consistency
  const pendingPayrollListEl = document.getElementById("pending-payroll-list");

  const quickStatsTodayCountEl = document.getElementById("stats-today-count");
  const quickStatsTomorrowCountEl = document.getElementById(
    "stats-tomorrow-count"
  );

  const quickStatsPendingPayrollEl = document.getElementById(
    "stats-pending-payroll-count"
  );

  const quickStatsActiveClientsEl = document.getElementById(
    "stats-active-clients-count"
  );
  const quickStatsActiveEmployeesEl = document.getElementById(
    "stats-active-employees-count"
  );

  const quickAddServiceButton = document.getElementById(
    "quick-add-service-button"
  );
  const quickAddServiceFormContainer = document.getElementById(
    "quick-add-service-form-container"
  );
  const quickAddServiceForm = document.getElementById("quick-add-service-form");
  const qasClientSelect = document.getElementById("qas-client-select");
  const qasLocationSelect = document.getElementById("qas-location-select");
  const qasCancelButton = document.getElementById("qas-cancel-button");
  const qasMessageEl = document.getElementById("qas-message");

  const listSectionsContainer = document.getElementById(
    "list-sections-container"
  ); // This might be null if not on page

  // --- NEW MODAL ELEMENT REFERENCES ---
  const serviceHistoryEditorModal = document.getElementById(
    "service-history-editor-modal"
  );
  const closeSHEditorModalButton = document.getElementById(
    "close-sh-editor-modal-button"
  );
  const shEditorContentTarget = document.getElementById(
    "sh-editor-content-target"
  );
  let serviceHistoryFormHTML = ""; // Cache for the form HTML

  // Function to close modal properly - available globally
  function closeModal() {
    if (serviceHistoryEditorModal)
      serviceHistoryEditorModal.style.display = "none";
    if (shEditorContentTarget) shEditorContentTarget.innerHTML = "";
    // Restore body scrolling
    document.body.style.overflow = "";
    console.log("DEBUG AP: Modal closed and body scroll restored");
  }

  console.log("DEBUG: Element references obtained for admin.html.");

  if (dashboardContentEl) dashboardContentEl.style.display = "none";
  else console.error("CRITICAL ERROR: dashboardContentEl is null.");
  if (adminLoadingMessageEl) adminLoadingMessageEl.style.display = "block";

  // --- UTILITY FUNCTIONS (Keep existing ones) ---
  function redirectToLogin(message) {
    /* ... no change ... */ console.warn(
      "DEBUG: Admin portal - Redirecting to login page:",
      message
    );
    if (adminLoadingMessageEl) adminLoadingMessageEl.style.display = "none";
    if (dashboardContentEl) dashboardContentEl.style.display = "none";
    if (
      window.location.pathname !== "/" &&
      window.location.pathname !== "/index.html"
    ) {
      try {
        window.location.assign("/");
      } catch (e) {
        console.error("Redirect to login page failed:", e);
      }
    } else {
      const loginErrorDisplay = document.getElementById("login-error-message");
      if (loginErrorDisplay && message) {
        loginErrorDisplay.textContent = message;
        loginErrorDisplay.style.display = "block";
      }
    }
  }
  function showPasswordMessage(message, type = "error") {
    /* ... no change ... */ if (passwordMessageEl) {
      passwordMessageEl.textContent = message;
      passwordMessageEl.className = `form-message ${type}`;
      passwordMessageEl.style.display = message ? "block" : "none";
    }
  }

  function formatServiceDisplayTime(firestoreTimestamp) {
    /* ... no change ... */ if (
      !firestoreTimestamp ||
      typeof firestoreTimestamp.toDate !== "function"
    ) {
      return "Time N/A";
    }
    const jsDate = firestoreTimestamp.toDate();
    return jsDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  async function fetchActiveClientCount() {
    /* ... no change ... */ if (!db) {
      console.error(
        "DEBUG AP: Firestore db not initialized for fetchActiveClientCount."
      );
      return 0;
    }
    try {
      const snapshot = await db
        .collection("clientMasterList")
        .where("status", "==", true)
        .get();
      return snapshot.size;
    } catch (error) {
      console.error("DEBUG AP: Error fetching active client count:", error);
      return 0;
    }
  }
  async function fetchActiveEmployeeCount() {
    /* ... no change ... */ if (!db) {
      console.error(
        "DEBUG AP: Firestore db not initialized for fetchActiveEmployeeCount."
      );
      return 0;
    }
    try {
      const snapshot = await db
        .collection("employeeMasterList")
        .where("status", "==", true)
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
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );

      // Count jobs by status
      const pendingSnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "Scheduled")
        .where(
          "serviceDate",
          ">=",
          firebase.firestore.Timestamp.fromDate(startOfToday)
        )
        .get();

      const inProgressSnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "In Progress")
        .get();

      const completedSnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "Complete")
        .where(
          "serviceDate",
          ">=",
          firebase.firestore.Timestamp.fromDate(startOfToday)
        )
        .get();

      const scheduledSnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "Scheduled")
        .get();

      // Update the counts
      document.getElementById("pending-jobs-count").textContent =
        pendingSnapshot.size;
      document.getElementById("in-progress-jobs-count").textContent =
        inProgressSnapshot.size;
      document.getElementById("completed-jobs-count").textContent =
        completedSnapshot.size;
      document.getElementById("scheduled-jobs-count").textContent =
        scheduledSnapshot.size;
    } catch (error) {
      console.error("Error loading job status counts:", error);
    }
  }

  // Load employee activity and clock-in/out data
  async function loadEmployeeActivity() {
    const timeTrackingDisplay = document.getElementById(
      "time-tracking-display"
    );
    if (!timeTrackingDisplay || !db) return;

    try {
      timeTrackingDisplay.innerHTML =
        '<p class="text-muted-foreground">Loading employee activity...</p>';

      // Get recent employee clock-in/out events (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Try to fetch time tracking data from different possible collections
      let activityHtml = "";
      let hasData = false;

      try {
        // Check for time tracking in employeeTimeTracking collection
        const timeTrackingSnapshot = await db
          .collection("employeeTimeTracking")
          .where(
            "timestamp",
            ">=",
            firebase.firestore.Timestamp.fromDate(oneDayAgo)
          )
          .orderBy("timestamp", "desc")
          .limit(10)
          .get();

        if (!timeTrackingSnapshot.empty) {
          hasData = true;
          activityHtml +=
            '<div class="space-y-2"><h4 class="font-medium text-sm">Recent Clock Events (24h)</h4>';

          timeTrackingSnapshot.forEach((doc) => {
            const data = doc.data();
            const time = data.timestamp
              ? data.timestamp.toDate().toLocaleString()
              : "Unknown time";
            const employee = data.employeeName || "Unknown employee";
            const action = data.action || "activity";
            const location = data.locationName || "Unknown location";

            const actionColor = action.toLowerCase().includes("in")
              ? "text-green-600"
              : "text-red-600";

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

          activityHtml += "</div>";
        }
      } catch (timeTrackingError) {
        console.log(
          "No time tracking collection or access limited:",
          timeTrackingError
        );
      }

      // If no time tracking data, try to get recent service assignments as activity indicator
      if (!hasData) {
        try {
          const recentServicesSnapshot = await db
            .collection("serviceHistory")
            .where(
              "serviceDate",
              ">=",
              firebase.firestore.Timestamp.fromDate(oneDayAgo)
            )
            .orderBy("serviceDate", "desc")
            .limit(5)
            .get();

          if (!recentServicesSnapshot.empty) {
            hasData = true;
            activityHtml +=
              '<div class="space-y-2"><h4 class="font-medium text-sm">Recent Service Activity (24h)</h4>';

            recentServicesSnapshot.forEach((doc) => {
              const data = doc.data();
              const time = data.serviceDate
                ? data.serviceDate.toDate().toLocaleString()
                : "Unknown time";
              const location = data.locationName || "Unknown location";
              const employees =
                data.employeeAssignments && data.employeeAssignments.length > 0
                  ? data.employeeAssignments
                      .map((emp) => emp.employeeName || "Unknown")
                      .join(", ")
                  : "No assignments";
              const status = data.status || "Unknown";

              const statusColor =
                {
                  Complete: "text-green-600",
                  "In Progress": "text-blue-600",
                  Scheduled: "text-purple-600",
                }[status] || "text-gray-600";

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

            activityHtml += "</div>";
          }
        } catch (serviceError) {
          console.log(
            "Error fetching recent services for activity:",
            serviceError
          );
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
      console.error("Error loading employee activity:", error);
      timeTrackingDisplay.innerHTML = `
                <div class="text-red-500 text-sm">
                    Error loading employee activity: ${error.message}
                </div>
            `;
    }
  }

  // --- MODIFIED LIST DISPLAY FUNCTIONS ---
  async function fetchAndDisplayServicesForDay(
    targetDate,
    listElementId,
    loadingMessageText = "Loading services..."
  ) {
    const listEl = document.getElementById(listElementId);
    if (!listEl) {
      console.error(
        `DEBUG: Element with ID ${listElementId} not found for displaying services.`
      );
      return 0;
    }
    // Simplified loading message handling
    listEl.innerHTML = `<p class="loading-text">${loadingMessageText}</p>`;

    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      0,
      0,
      0,
      0
    );
    const endOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      23,
      59,
      59,
      999
    );
    const startTimestamp = firebase.firestore.Timestamp.fromDate(startOfDay);
    const endTimestamp = firebase.firestore.Timestamp.fromDate(endOfDay);
    try {
      if (!db) {
        throw new Error("Database not ready.");
      }
      const querySnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "Scheduled")
        .where("serviceDate", ">=", startTimestamp)
        .where("serviceDate", "<=", endTimestamp)
        .orderBy("serviceDate", "asc")
        .get();

      listEl.innerHTML = "";
      if (querySnapshot.empty) {
        listEl.innerHTML = "<p>No services scheduled for this day.</p>";
        return 0;
      }
      const ul = document.createElement("ul");
      ul.className = "service-items-list";
      querySnapshot.forEach((doc) => {
        const service = doc.data();
        const li = document.createElement("li");
        const serviceTime = formatServiceDisplayTime(service.serviceDate);
        // CHANGED: Use button for modal trigger
        li.innerHTML = `
                    <strong>${escapeHtml(
                      service.locationName || "N/A Location"
                    )}</strong>
                    <br>Time: ${escapeHtml(serviceTime)} 
                    ${
                      service.serviceType
                        ? `<br>Type: ${escapeHtml(service.serviceType)}`
                        : ""
                    }
                    <br><button type="button" class="details-link modal-trigger-button" data-service-id="${
                      doc.id
                    }" title="View full details">Details</button>
                `;
        ul.appendChild(li);
      });
      listEl.appendChild(ul);
      return querySnapshot.size;
    } catch (error) {
      console.error(
        `DEBUG: Error fetching services for ${listElementId}:`,
        error
      );
      if (listEl)
        listEl.innerHTML = `<p class="error-message">Error loading services: ${error.message}</p>`;
      return 0;
    }
  }

  async function fetchAndDisplayPendingPayroll() {
    if (!pendingPayrollListEl) {
      console.error("DEBUG: Element with ID pending-payroll-list not found.");
      return 0;
    }
    pendingPayrollListEl.innerHTML =
      '<p class="loading-text">Loading jobs pending payroll...</p>';
    try {
      if (!db) {
        throw new Error("Database not ready.");
      }
      const querySnapshot = await db
        .collection("serviceHistory")
        .where("status", "==", "Completed")
        .where("payrollProcessed", "==", false)
        .orderBy("serviceDate", "desc")
        .limit(20)
        .get();

      pendingPayrollListEl.innerHTML = "";
      if (querySnapshot.empty) {
        pendingPayrollListEl.innerHTML =
          "<p>No completed jobs are currently pending payroll.</p>";
        return 0;
      }
      const ul = document.createElement("ul");
      ul.className = "service-items-list";
      querySnapshot.forEach((doc) => {
        const service = doc.data();
        const li = document.createElement("li");
        const serviceDate = service.serviceDate
          ? service.serviceDate.toDate().toLocaleDateString()
          : "Date N/A";
        // CHANGED: Use button for modal trigger
        li.innerHTML = `
                    <strong>${escapeHtml(
                      service.clientName || "N/A Client"
                    )}</strong> (${escapeHtml(
          service.locationName || "N/A Location"
        )})
                    <br>Completed: ${escapeHtml(serviceDate)}
                    <br><button type="button" class="details-link modal-trigger-button" data-service-id="${
                      doc.id
                    }" title="View details and manage payroll status">View Details / Process Payroll</button>
                `;
        ul.appendChild(li);
      });
      pendingPayrollListEl.appendChild(ul);
      return querySnapshot.size;
    } catch (error) {
      console.error("DEBUG: Error fetching jobs pending payroll:", error);
      if (pendingPayrollListEl)
        pendingPayrollListEl.innerHTML = `<p class="error-message">Error loading jobs for payroll: ${error.message}</p>`;
      return 0;
    }
  }

  // --- QUICK ADD SERVICE FUNCTIONS (Keep existing ones) ---

  // --- PASSWORD CHANGE FUNCTIONS (Keep existing ones) ---
  function handleRevealPasswordToggle(event) {
    /* ... no change ... */ const button = event.target.closest(
      ".reveal-password-btn"
    );
    if (!button) return;
    const targetInputId = button.getAttribute("data-target");
    if (!targetInputId) return;
    const passwordInput = document.getElementById(targetInputId);
    if (!passwordInput) return;
    const currentType = passwordInput.getAttribute("type");
    if (currentType === "password") {
      passwordInput.setAttribute("type", "text");
      button.textContent = "🔒";
    } else {
      passwordInput.setAttribute("type", "password");
      button.textContent = "👁️";
    }
  }
  function setupPasswordRevealListeners() {
    /* ... no change ... */ console.log(
      "DEBUG: Attaching password reveal listeners (admin-portal.js)."
    );
    if (!document.body.passwordRevealListenerAttached) {
      document.body.addEventListener("click", handleRevealPasswordToggle);
      document.body.passwordRevealListenerAttached = true;
    }
  }
  function showSection(sectionToShow) {
    /* ... no change, this is likely for a different feature ... */ console.log(
      "DEBUG: showSection called for:",
      sectionToShow
        ? sectionToShow.id
        : "Default View (dashboard might not use this directly)"
    );
    const allMainSectionsOnThisPage = [
      listSectionsContainer,
      adminSecuritySection,
    ];
    allMainSectionsOnThisPage.forEach((section) => {
      if (section) {
        if (!sectionToShow) {
          section.style.display =
            section === adminSecuritySection ||
            section === listSectionsContainer
              ? "block"
              : "none";
        } else {
          section.style.display = section === sectionToShow ? "block" : "none";
        }
      }
    });
    if (
      payrollProcessingMessageEl &&
      (!sectionToShow ||
        (sectionToShow.id !== "quick-actions-widget" &&
          !sectionToShow.contains(payrollProcessingMessageEl)))
    ) {
      showFormMessage(payrollProcessingMessageEl, "", "info");
    }
    const oldShowListsButton = document.getElementById("show-lists-button");
    if (oldShowListsButton) oldShowListsButton.style.display = "none";

    if (changePasswordSection && sectionToShow !== adminSecuritySection) {
      changePasswordSection.style.display = "none";
    }
    if (showPasswordButtonContainer && sectionToShow === adminSecuritySection) {
      if (
        !changePasswordSection ||
        changePasswordSection.style.display === "none"
      ) {
        showPasswordButtonContainer.style.display = "block";
      } else {
        showPasswordButtonContainer.style.display = "none";
      }
    } else if (showPasswordButtonContainer) {
      showPasswordButtonContainer.style.display = "none";
    }
  }
  function handleChangePasswordSubmit(e) {
    /* ... no change ... */ e.preventDefault();
    const cP = currentPasswordInput ? currentPasswordInput.value : "";
    const nP = newPasswordInput ? newPasswordInput.value : "";
    const confP = confirmPasswordInput ? confirmPasswordInput.value : "";
    if (!cP || !nP || !confP) {
      showPasswordMessage("All password fields are required.", "error");
      return;
    }
    if (nP.length < 6) {
      showPasswordMessage(
        "New password must be at least 6 characters.",
        "error"
      );
      return;
    }
    if (nP !== confP) {
      showPasswordMessage("New passwords do not match.", "error");
      return;
    }
    if (!currentUser) {
      showPasswordMessage("User session error. Please refresh.", "error");
      return;
    }
    if (changePasswordForm) setFormDisabled(changePasswordForm, true);
    showPasswordMessage("Updating your password...", "info");
    const cred = firebase.auth.EmailAuthProvider.credential(
      currentUser.email,
      cP
    );
    currentUser
      .reauthenticateWithCredential(cred)
      .then(() => {
        return currentUser.updatePassword(nP);
      })
      .then(() => {
        showPasswordMessage("Password updated successfully!", "success");
        if (changePasswordForm) changePasswordForm.reset();
        setTimeout(() => {
          if (changePasswordSection)
            changePasswordSection.style.display = "none";
          if (showPasswordButtonContainer)
            showPasswordButtonContainer.style.display = "block";
          showPasswordMessage("", "info");
        }, 2000);
      })
      .catch((err) => {
        if (err.code === "auth/wrong-password") {
          showPasswordMessage("Incorrect current password.", "error");
        } else if (err.code === "auth/weak-password") {
          showPasswordMessage("New password is too weak.", "error");
        } else {
          console.error("Admin password update error:", err);
          showPasswordMessage(`Error: ${err.message}`, "error");
        }
      })
      .finally(() => {
        if (changePasswordForm) setFormDisabled(changePasswordForm, false);
      });
  }
  async function handleTriggerPayrollProcessing() {
    /* ... no change ... */ console.log(
      "DEBUG: Trigger Payroll Processing button clicked."
    );
    if (!auth || !auth.currentUser) {
      showFormMessage(
        payrollProcessingMessageEl,
        "Error: Admin must be logged in.",
        "error"
      );
      return;
    }
    if (!triggerUrlProcessPayroll) {
      showFormMessage(
        payrollProcessingMessageEl,
        "Error: Payroll function URL not configured.",
        "error"
      );
      return;
    }
    if (triggerPayrollButton) triggerPayrollButton.disabled = true;
    showFormMessage(
      payrollProcessingMessageEl,
      "Requesting payroll processing...",
      "info"
    );
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch(triggerUrlProcessPayroll, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
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
        const errorMessage =
          responseData?.error?.message ||
          responseData?.message ||
          responseText ||
          `HTTP error ${response.status}`;
        throw new Error(errorMessage);
      }
      if (responseData && responseData.message) {
        showFormMessage(
          payrollProcessingMessageEl,
          responseData.message,
          "success"
        );
      } else {
        showFormMessage(
          payrollProcessingMessageEl,
          "Processing request sent (check Cloud Function logs for details).",
          "success"
        );
      }
    } catch (error) {
      console.error("Error triggering payroll processing:", error);
      showFormMessage(
        payrollProcessingMessageEl,
        `Error: ${error.message}`,
        "error"
      );
    } finally {
      if (triggerPayrollButton) triggerPayrollButton.disabled = false;
    }
  }

  // --- NEW MODAL FUNCTIONS ---
  async function loadServiceHistoryFormHTML() {
    if (serviceHistoryFormHTML) {
      if (shEditorContentTarget)
        shEditorContentTarget.innerHTML = serviceHistoryFormHTML;
      return true; // Already loaded
    }
    try {
      const response = await fetch("admin-service-history.html"); // Fetch the page that CONTAINS the form
      if (!response.ok)
        throw new Error(`Failed to fetch form HTML: ${response.statusText}`);
      const pageText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(pageText, "text/html");
      const formSection = doc.getElementById(
        "add-edit-service-history-section"
      ); // Get the specific form section

      if (formSection) {
        serviceHistoryFormHTML = formSection.outerHTML;
        if (shEditorContentTarget) {
          shEditorContentTarget.innerHTML = serviceHistoryFormHTML;
          console.log(
            "DEBUG AP: Service history form HTML loaded into dashboard modal target."
          );
        } else {
          console.error(
            "DEBUG AP: shEditorContentTarget is null when trying to set innerHTML."
          );
        }
        return true;
      } else {
        console.error(
          "DEBUG AP: Could not find #add-edit-service-history-section in fetched HTML."
        );
        if (shEditorContentTarget)
          shEditorContentTarget.innerHTML =
            "<p class='error-message'>Error: Could not load service editor form content.</p>";
        return false;
      }
    } catch (error) {
      console.error(
        "DEBUG AP: Error loading service history form HTML:",
        error
      );
      if (shEditorContentTarget)
        shEditorContentTarget.innerHTML = `<p class='error-message'>Error loading service editor form: ${error.message}</p>`;
      return false;
    }
  }

  async function openServiceEditorInModal(serviceId) {
    if (
      !serviceHistoryEditorModal ||
      !shEditorContentTarget ||
      !closeSHEditorModalButton
    ) {
      console.error(
        "DEBUG AP: Modal elements (serviceHistoryEditorModal, shEditorContentTarget, or closeSHEditorModalButton) not found."
      );
      alert(
        "Error: Service editor UI components are missing. Cannot open editor."
      );
      return;
    }

    if (shEditorContentTarget)
      shEditorContentTarget.innerHTML =
        "<p class='loading-text'>Loading editor components...</p>";

    if (serviceHistoryEditorModal) {
      serviceHistoryEditorModal.style.display = "flex";
      // Scroll to top of page to ensure modal is visible
      window.scrollTo(0, 0);
      // Also ensure modal content starts at top
      const modalContent =
        serviceHistoryEditorModal.querySelector(".modal-content");
      if (modalContent) {
        modalContent.scrollTop = 0;
      }
      // Prevent body scrolling when modal is open
      document.body.style.overflow = "hidden";
      console.log("DEBUG AP: Modal display set to flex and scrolled to top.");
    } else {
      console.error(
        "DEBUG AP: serviceHistoryEditorModal IS NULL before setting display style! Cannot show modal."
      );
      return;
    }

    const formLoaded = await loadServiceHistoryFormHTML();
    if (!formLoaded) {
      return;
    }

    // --- THIS IS THE CORRECTED IF BLOCK ---
    if (
      typeof window.ashFormHandler === "undefined" ||
      typeof window.ashFormHandler.handleEditServiceHistoryClick !==
        "function" ||
      typeof window.ashFormHandler.handleSaveServiceHistorySubmit !== "function"
    ) {
      console.error(
        "DEBUG AP: Service history handler (window.ashFormHandler) or its required functions (handleEditServiceHistoryClick, handleSaveServiceHistorySubmit) are not available. Make sure admin-service-history.js is loaded correctly and exposes these functions."
      );
      alert(
        "Error: Critical service editing functions are not loaded. Please try refreshing the page. If the problem persists, contact support."
      );
      if (shEditorContentTarget)
        shEditorContentTarget.innerHTML =
          "<p class='error-message'>Error: Core editing functions failed to load. Cannot proceed.</p>";
      return;
    }
    // --- END CORRECTED IF BLOCK ---

    console.log(
      `DEBUG AP: Attempting to populate service editor modal for service ID: ${serviceId}`
    );

    try {
      // Wait a moment for DOM to be ready after form load
      await new Promise((resolve) => setTimeout(resolve, 100));

      await window.ashFormHandler.handleEditServiceHistoryClick(serviceId);
      console.log(
        "DEBUG AP: ashFormHandler.handleEditServiceHistoryClick completed for modal."
      );

      // Wait another moment for population to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (shEditorContentTarget) {
        const formSectionInModal = shEditorContentTarget.querySelector(
          "#add-edit-service-history-section"
        );
        if (formSectionInModal) {
          formSectionInModal.style.display = "block";
          console.log(
            "DEBUG AP: Set #add-edit-service-history-section to display:block in modal."
          );

          const actualForm = formSectionInModal.querySelector(
            "#add-edit-service-history-form"
          );
          if (
            actualForm &&
            window.ashFormHandler &&
            typeof window.ashFormHandler.setFormDisabledState === "function"
          ) {
            window.ashFormHandler.setFormDisabledState(actualForm, false);
          }

          // Debug check: Verify if client and location dropdowns are populated and showing correct values
          const clientSelect =
            formSectionInModal.querySelector("#sh-client-select");
          const locationSelect = formSectionInModal.querySelector(
            "#sh-location-select"
          );
          const serviceDateInput =
            formSectionInModal.querySelector("#sh-service-date");

          console.log("DEBUG AP: Modal form element check:");
          console.log(
            "- Client select options:",
            clientSelect ? clientSelect.options.length : "not found"
          );
          console.log(
            "- Client selected value:",
            clientSelect ? clientSelect.value : "not found"
          );
          console.log(
            "- Client selected text:",
            clientSelect
              ? clientSelect.options[clientSelect.selectedIndex]?.text
              : "not found"
          );
          console.log(
            "- Location select options:",
            locationSelect ? locationSelect.options.length : "not found"
          );
          console.log(
            "- Location selected value:",
            locationSelect ? locationSelect.value : "not found"
          );
          console.log(
            "- Location selected text:",
            locationSelect
              ? locationSelect.options[locationSelect.selectedIndex]?.text
              : "not found"
          );
          console.log(
            "- Service date value:",
            serviceDateInput ? serviceDateInput.value : "not found"
          );

          // Force UI refresh for dropdowns
          if (clientSelect && clientSelect.value) {
            // Force the dropdown to display the selected option
            clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("DEBUG AP: Forced client dropdown refresh");
          }

          if (locationSelect && locationSelect.value) {
            // Force the dropdown to display the selected option
            locationSelect.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            console.log("DEBUG AP: Forced location dropdown refresh");
          }
        } else {
          console.error(
            "DEBUG AP: #add-edit-service-history-section not found within modal content after population."
          );
        }
      }

      const modalCancelButton = shEditorContentTarget.querySelector(
        "#cancel-add-edit-service-history-button"
      );
      if (modalCancelButton) {
        const newCancelButton = modalCancelButton.cloneNode(true);
        modalCancelButton.parentNode.replaceChild(
          newCancelButton,
          modalCancelButton
        );
        newCancelButton.addEventListener("click", (e) => {
          e.preventDefault();
          console.log("DEBUG AP: Modal cancel button clicked.");
          closeModal();
        });
      } else {
        console.warn(
          "DEBUG AP: Modal cancel button #cancel-add-edit-service-history-button not found after loading form."
        );
      }

      const modalForm = shEditorContentTarget.querySelector(
        "#add-edit-service-history-form"
      );
      if (modalForm) {
        const newModalForm = modalForm.cloneNode(true);
        modalForm.parentNode.replaceChild(newModalForm, modalForm);

        newModalForm.addEventListener(
          "submit",
          async function handleModalFormSubmit(e) {
            e.preventDefault();
            console.log("DEBUG AP: Modal form submitted.");
            await window.ashFormHandler.handleSaveServiceHistorySubmit(e);

            const messageEl = this.querySelector(
              "#add-edit-service-history-message"
            );
            if (messageEl && messageEl.classList.contains("success")) {
              console.log("DEBUG AP: Modal form save successful.");
              setTimeout(async () => {
                closeModal();
                await refreshDashboardLists();
              }, 1500);
            } else if (messageEl) {
              console.warn(
                "DEBUG AP: Modal form save resulted in message:",
                messageEl.textContent
              );
            }
          }
        );
      } else {
        console.warn(
          "DEBUG AP: Modal form #add-edit-service-history-form not found after loading form."
        );
      }
    } catch (error) {
      console.error(
        "DEBUG AP: Error during modal form population (handleEditServiceHistoryClick call) or setup:",
        error
      );
      if (shEditorContentTarget)
        shEditorContentTarget.innerHTML = `<p class='error-message'>Error loading service details into editor: ${error.message}</p>`;
    }
  }

  async function refreshDashboardLists() {
    console.log("DEBUG AP: Refreshing dashboard lists after edit/save.");
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Using a try-catch for each to prevent one failure from stopping others
    try {
      if (
        quickStatsTodayCountEl &&
        typeof fetchAndDisplayServicesForDay === "function"
      ) {
        quickStatsTodayCountEl.textContent =
          await fetchAndDisplayServicesForDay(
            today,
            "today-services-list",
            "Refreshing today's services..."
          );
      }
    } catch (e) {
      console.error("Error refreshing today's services:", e);
      if (todayServicesListEl)
        todayServicesListEl.innerHTML =
          "<p class='error-message'>Refresh failed.</p>";
    }

    try {
      if (
        quickStatsTomorrowCountEl &&
        typeof fetchAndDisplayServicesForDay === "function"
      ) {
        quickStatsTomorrowCountEl.textContent =
          await fetchAndDisplayServicesForDay(
            tomorrow,
            "tomorrow-services-list",
            "Refreshing tomorrow's services..."
          );
      }
    } catch (e) {
      console.error("Error refreshing tomorrow's services:", e);
      if (tomorrowServicesListEl)
        tomorrowServicesListEl.innerHTML =
          "<p class='error-message'>Refresh failed.</p>";
    }

    try {
      if (
        quickStatsPendingPayrollEl &&
        typeof fetchAndDisplayPendingPayroll === "function"
      ) {
        quickStatsPendingPayrollEl.textContent =
          await fetchAndDisplayPendingPayroll();
      }
    } catch (e) {
      console.error("Error refreshing pending payroll list:", e);
      if (pendingPayrollListEl)
        pendingPayrollListEl.innerHTML =
          "<p class='error-message'>Refresh failed.</p>";
    }
  }

  // --- Main Firebase Initialization & Auth Logic ---
  (function initializeFirebase() {
    /* ... no change ... */ console.log(
      "DEBUG: Checking Firebase availability for init..."
    );
    if (
      typeof firebase === "undefined" ||
      !firebase.app ||
      !firebase.auth ||
      !firebase.firestore
    ) {
      if (adminLoadingMessageEl)
        adminLoadingMessageEl.textContent =
          "Critical Error: Firebase SDK not loaded. Cannot initialize Admin Portal.";
      return false;
    }
    console.log(
      "DEBUG: Firebase seems available. Initializing services for admin-portal.js..."
    );
    try {
      auth = firebase.auth();
      db = firebase.firestore();
      serverTimestampFunction = firebase.firestore.FieldValue.serverTimestamp;
      console.log(
        "DEBUG: Firebase core services initialized for admin-portal.js."
      );
      return true;
    } catch (error) {
      console.error(
        "DEBUG: Error initializing Firebase services (admin-portal.js):",
        error
      );
      if (adminLoadingMessageEl)
        adminLoadingMessageEl.textContent =
          "Error initializing admin services.";
      if (dashboardContentEl) dashboardContentEl.style.display = "none";
      return false;
    }
  })();

  console.log("DEBUG: Setting up auth listener (admin-portal.js)...");

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      user
        .getIdTokenResult()
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
              const sidebar =
                document.querySelector(".sidebar") ||
                document.querySelector("nav");
              if (sidebar) {
                const toggleButton = document.createElement("a");
                toggleButton.href = "/employee";
                toggleButton.className =
                  "btn-secondary w-full mb-2 flex items-center justify-center";
                toggleButton.innerHTML = `
                                    <i data-lucide="users" class="h-4 w-4 mr-2"></i>
                                    Switch to Employee Portal
                                `;

                // Add the button at the bottom of the sidebar
                const existingButtons =
                  sidebar.querySelector(".admin-footer") ||
                  sidebar.lastElementChild;
                if (existingButtons) {
                  sidebar.insertBefore(toggleButton, existingButtons);
                } else {
                  sidebar.appendChild(toggleButton);
                }

                // Re-initialize icons
                if (typeof lucide !== "undefined") {
                  lucide.createIcons();
                }
              }
            }

            // Initialize admin portal
            console.log(
              "DEBUG AP: Initializing admin portal for user with valid claims."
            );
            if (adminLoadingMessageEl)
              adminLoadingMessageEl.style.display = "none";
            if (dashboardContentEl) dashboardContentEl.style.display = "block";

            // Load dashboard data
            setTimeout(async () => {
              try {
                await Promise.all([
                  loadJobStatusCounts(),
                  loadPayrollStatus(),
                  loadEmployeeActivity(),
                  fetchActiveClientCount().then((count) => {
                    if (quickStatsActiveClientsEl)
                      quickStatsActiveClientsEl.textContent = count;
                  }),
                  fetchActiveEmployeeCount().then((count) => {
                    if (quickStatsActiveEmployeesEl)
                      quickStatsActiveEmployeesEl.textContent = count;
                  }),
                ]);
                console.log("DEBUG AP: Dashboard data loaded successfully.");

                // Initialize Quick Add Panel
                initializeQuickAddPanel();

                // Attach interactive feature listeners (including modal close buttons)
                attachInteractiveFeatureListeners();

                // Set default mode to service and populate dropdowns
                const qasModeSelect = document.getElementById("qas-mode");
                if (qasModeSelect) {
                  qasModeSelect.value = "new-service";
                  qasModeSelect.dispatchEvent(new Event("change"));

                  // Populate client dropdown immediately for "Add New Job" mode
                  populateQASClientDropdown();
                }

                // Attach click handlers for Process Payroll buttons
                const dashboardBtn = document.getElementById(
                  "dashboard-process-payroll-button"
                );
                if (dashboardBtn) {
                  dashboardBtn.addEventListener(
                    "click",
                    triggerPayrollProcessing
                  );
                }
                const payrollPageBtn = document.getElementById(
                  "process-payroll-button"
                );
                if (payrollPageBtn) {
                  payrollPageBtn.addEventListener(
                    "click",
                    triggerPayrollProcessing
                  );
                }
              } catch (error) {
                console.error("DEBUG AP: Error loading dashboard data:", error);
              }
            }, 100);
          } else {
            console.error(
              "DEBUG AP: Access denied. User does not have sufficient admin claims."
            );
            window.location.href = "index.html";
          }
        })
        .catch((error) => {
          console.error("DEBUG AP: Error getting ID token result:", error);
          window.location.href = "index.html";
        });
    } else {
      console.log("DEBUG AP: No user signed in, redirecting to login.");
      window.location.href = "index.html";
    }
  });

  console.log("DEBUG: Initial script setup finished for admin.html.");
});

// =================
// INTERACTIVE FEATURES
// =================

// Show jobs by status in modal
function showJobsByStatus(status) {
  const modal = document.getElementById("job-management-modal");
  const title = document.getElementById("job-modal-title");
  const content = document.getElementById("job-modal-content");

  if (!modal || !title || !content) return;

  title.textContent = `${status} Jobs`;
  content.innerHTML = `
        <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading ${status.toLowerCase()} jobs...</p>
        </div>
    `;

  modal.classList.remove("hidden");

  loadJobsByStatus(status, content);
}

// Load and display jobs by status
async function loadJobsByStatus(status, container) {
  if (!db) throw new Error("Database not ready");

  let query = db.collection("serviceHistory");

  // Custom query: include both Scheduled and In Progress for 'In Progress' view
  if (status === "In Progress") {
    query = query
      .where("status", "in", ["In Progress", "Scheduled"])
      .where("serviceDate", "<=", firebase.firestore.Timestamp.now());
  } else {
    query = query.where("status", "==", status);
  }

  // Remove orderBy to avoid missing-index error
  const snapshot = await query.limit(50).get();

  if (snapshot.empty) {
    container.innerHTML = `<p class="text-center text-gray-500 py-8">No ${status.toLowerCase()} jobs found.</p>`;
    return;
  }

  let html = '<div class="space-y-4">';
  snapshot.forEach((doc) => {
    const job = doc.data();
    const serviceDate = job.serviceDate
      ? job.serviceDate.toDate().toLocaleDateString()
      : "Date N/A";
    const serviceTime = job.serviceDate
      ? job.serviceDate.toDate().toLocaleTimeString()
      : "Time N/A";

    // Each row is now clickable – navigates to service history with anchor
    html += `
      <div class="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer"
           onclick="window.location.href='admin-service-history.html#${
             doc.id
           }'">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <h4 class="font-medium">${escapeHtml(
              job.clientName || "Unknown Client"
            )}</h4>
            <p class="text-sm text-gray-600">${escapeHtml(
              job.locationName || "Unknown Location"
            )}</p>
            <p class="text-sm text-gray-500">${serviceDate} at ${serviceTime}</p>
            ${
              job.adminNotes
                ? `<p class="text-sm text-blue-600 mt-1">Notes: ${escapeHtml(
                    job.adminNotes
                  )}</p>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  });
  html += "</div>";
  container.innerHTML = html;
}

// Update job status
async function updateJobStatus(jobId, newStatus) {
  try {
    if (!db) {
      throw new Error("Database not ready");
    }

    await db.collection("serviceHistory").doc(jobId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Job ${jobId} status updated to ${newStatus}`);

    // Refresh dashboard counts
    if (typeof loadDashboardStats === "function") {
      loadDashboardStats();
    }

    // Show success message
    showNotification(`Job status updated to ${newStatus}`, "success");
  } catch (error) {
    console.error("Error updating job status:", error);
    showNotification(`Failed to update job status: ${error.message}`, "error");
  }
}

// Approve job photos
async function approveJobPhotos(jobId) {
  try {
    if (!db) {
      throw new Error("Database not ready");
    }

    // Get job details to find location
    const jobDoc = await db.collection("serviceHistory").doc(jobId).get();
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

    const photosSnapshot = await db
      .collection("servicePhotos")
      .where("locationId", "==", job.locationId)
      .where(
        "uploadedAt",
        ">=",
        firebase.firestore.Timestamp.fromDate(startDate)
      )
      .where("uploadedAt", "<=", firebase.firestore.Timestamp.fromDate(endDate))
      .get();

    const batch = db.batch();
    let photoCount = 0;

    photosSnapshot.forEach((photoDoc) => {
      batch.update(photoDoc.ref, {
        isClientVisible: true,
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: firebase.auth().currentUser.uid,
      });
      photoCount++;
    });

    if (photoCount > 0) {
      await batch.commit();

      // After approving photos, mark job as completed and not yet processed for payroll
      await db.collection("serviceHistory").doc(jobId).update({
        status: "Completed",
        payrollProcessed: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      showNotification("Job approved and marked Completed.", "success");
    } else {
      showNotification("No photos found for this job date", "info");
    }
  } catch (error) {
    console.error("Error approving photos:", error);
    showNotification(`Failed to approve photos: ${error.message}`, "error");
  }
}

// Edit job notes
function editJobNotes(jobId) {
  const notes = prompt("Enter admin notes for this job:");
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

    await db.collection("serviceHistory").doc(jobId).update({
      adminNotes: notes,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    showNotification("Job notes updated successfully", "success");
  } catch (error) {
    console.error("Error updating job notes:", error);
    showNotification(`Failed to update notes: ${error.message}`, "error");
  }
}

// Show notification
function showNotification(message, type = "info") {
  // Create a simple notification system
  const notification = document.createElement("div");
  notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
    type === "success"
      ? "bg-green-100 text-green-800 border border-green-200"
      : type === "error"
      ? "bg-red-100 text-red-800 border border-red-200"
      : "bg-blue-100 text-blue-800 border border-blue-200"
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
function openServiceAgreementModal(clientId = "") {
  const modal = document.getElementById("service-agreement-modal");
  const clientSelect = document.getElementById("agreement-client-select");

  if (!modal || !clientSelect) return;

  // Populate client dropdown
  populateAgreementClientDropdown();

  if (clientId) {
    clientSelect.value = clientId;
  }

  modal.classList.remove("hidden");
}

// Populate client dropdown for agreements
async function populateAgreementClientDropdown() {
  const select = document.getElementById("agreement-client-select");
  if (!select || !db) return;

  try {
    const snapshot = await db
      .collection("clientMasterList")
      .where("status", "==", true)
      .orderBy("companyName", "asc")
      .get();

    let html = '<option value="">Select Client</option>';
    snapshot.forEach((doc) => {
      const client = doc.data();
      html += `<option value="${doc.id}">${escapeHtml(
        client.companyName
      )}</option>`;
    });

    select.innerHTML = html;
  } catch (error) {
    console.error("Error loading clients for agreement:", error);
    select.innerHTML = '<option value="">Error loading clients</option>';
  }
}

// Populate client dropdown for location form
async function populateQASLocationClientDropdown() {
  try {
    const select = document.getElementById("qas-location-client-select");
    if (!select) return;

    const snapshot = await db
      .collection("clientMasterList")
      .where("status", "==", true)
      .orderBy("companyName")
      .get();

    let html = '<option value="">-- Select Client --</option>';
    snapshot.forEach((doc) => {
      const client = doc.data();
      html += `<option value="${doc.id}" data-client-name="${escapeHtml(
        client.companyName
      )}">${escapeHtml(client.companyName)}</option>`;
    });
    select.innerHTML = html;
  } catch (error) {
    console.error("Error loading clients for location form:", error);
    const select = document.getElementById("qas-location-client-select");
    if (select) {
      select.innerHTML = '<option value="">Error loading clients</option>';
    }
  }
}

// Quick Add Panel Form Handlers

// Initialize Quick Add Panel functionality
function initializeQuickAddPanel() {
  // Quick Add Panel Mode Selector
  const qasModeSelect = document.getElementById("qas-mode");
  if (qasModeSelect) {
    qasModeSelect.addEventListener("change", function () {
      const selectedMode = this.value;

      // Hide all sections
      document.querySelectorAll(".qas-section").forEach((section) => {
        section.style.display = "none";
        section.classList.remove("active");
      });

      // Show selected section
      const targetSection = document.getElementById(
        `qas-form-${selectedMode.replace("new-", "")}`
      );
      if (targetSection) {
        targetSection.style.display = "block";
        targetSection.classList.add("active");

        // Populate dropdowns based on mode
        if (selectedMode === "new-location") {
          populateQASLocationClientDropdown();
        } else if (selectedMode === "new-service") {
          populateQASClientDropdown();
        }
      }
    });
  }

  // Quick Add Client Form
  const quickAddClientForm = document.getElementById("quick-add-client-form");
  if (quickAddClientForm) {
    quickAddClientForm.addEventListener("submit", handleQuickAddClientSubmit);
  }

  // Add client change event listener for location dropdown population
  const qasClientSelect = document.getElementById("qas-client-select");
  if (qasClientSelect) {
    qasClientSelect.addEventListener("change", function () {
      const selectedClientId = this.value;
      populateQASLocationDropdown(selectedClientId);
    });
  }

  // Quick Add Location Form
  const quickAddLocationForm = document.getElementById(
    "quick-add-location-form"
  );
  if (quickAddLocationForm) {
    quickAddLocationForm.addEventListener(
      "submit",
      handleQuickAddLocationSubmit
    );
  }

  // Quick Add Employee Form
  const quickAddEmployeeForm = document.getElementById(
    "quick-add-employee-form"
  );
  if (quickAddEmployeeForm) {
    quickAddEmployeeForm.addEventListener(
      "submit",
      handleQuickAddEmployeeSubmit
    );
  }

  // Quick Add Service Form
  const quickAddServiceForm = document.getElementById("quick-add-service-form");
  if (quickAddServiceForm) {
    quickAddServiceForm.addEventListener("submit", handleQuickAddServiceSubmit);
  }

  // Cancel buttons for each form
  const qasClientCancelButton = document.getElementById(
    "qas-client-cancel-button"
  );
  if (qasClientCancelButton) {
    qasClientCancelButton.addEventListener("click", () => {
      quickAddClientForm.reset();
      showFormMessage(
        document.getElementById("qas-client-message"),
        "",
        "info"
      );
    });
  }

  const qasLocationCancelButton = document.getElementById(
    "qas-location-cancel-button"
  );
  if (qasLocationCancelButton) {
    qasLocationCancelButton.addEventListener("click", () => {
      quickAddLocationForm.reset();
      showFormMessage(
        document.getElementById("qas-location-message"),
        "",
        "info"
      );
    });
  }

  const qasEmployeeCancelButton = document.getElementById(
    "qas-employee-cancel-button"
  );
  if (qasEmployeeCancelButton) {
    qasEmployeeCancelButton.addEventListener("click", () => {
      quickAddEmployeeForm.reset();
      showFormMessage(
        document.getElementById("qas-employee-message"),
        "",
        "info"
      );
    });
  }

  const qasServiceCancelButton = document.getElementById("qas-cancel-button");
  if (qasServiceCancelButton) {
    qasServiceCancelButton.addEventListener("click", () => {
      if (quickAddServiceForm) quickAddServiceForm.reset();
      showFormMessage(document.getElementById("qas-message"), "", "info");
    });
  }
}

// Attach event listeners for interactive features
function attachInteractiveFeatureListeners() {
  // Job management modal close buttons
  const closeJobModal = document.getElementById("close-job-modal");
  const jobModal = document.getElementById("job-management-modal");

  if (closeJobModal && jobModal) {
    console.log("DEBUG: Setting up job modal close listener");
    closeJobModal.addEventListener("click", () => {
      console.log("DEBUG: Job modal close button clicked");
      jobModal.classList.add("hidden");
    });

    jobModal.addEventListener("click", (e) => {
      if (e.target === jobModal) {
        jobModal.classList.add("hidden");
      }
    });
  }

  // Service agreement modal close buttons
  const closeAgreementModal = document.getElementById("close-agreement-modal");
  const agreementModal = document.getElementById("service-agreement-modal");
  const cancelAgreement = document.getElementById("cancel-agreement");

  if (closeAgreementModal && agreementModal) {
    closeAgreementModal.addEventListener("click", () => {
      agreementModal.classList.add("hidden");
    });

    agreementModal.addEventListener("click", (e) => {
      if (e.target === agreementModal) {
        agreementModal.classList.add("hidden");
      }
    });
  }

  if (cancelAgreement && agreementModal) {
    cancelAgreement.addEventListener("click", () => {
      agreementModal.classList.add("hidden");
    });
  }

  // Service agreement form submission
  const agreementForm = document.getElementById("service-agreement-form");
  if (agreementForm) {
    agreementForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const clientId = document.getElementById("agreement-client-select").value;
      const frequency = document.getElementById("agreement-frequency").value;
      const instructions = document.getElementById(
        "agreement-instructions"
      ).value;

      const includedServices = [];
      document
        .querySelectorAll("#included-services-checkboxes input:checked")
        .forEach((cb) => {
          includedServices.push(cb.value);
        });

      if (!clientId) {
        showNotification("Please select a client", "error");
        return;
      }

      try {
        await db.collection("serviceAgreements").add({
          clientId: clientId,
          frequency: frequency,
          includedServices: includedServices,
          specialInstructions: instructions,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          isActive: true,
        });

        showNotification("Service agreement saved successfully", "success");
        agreementModal.classList.add("hidden");
        agreementForm.reset();
      } catch (error) {
        console.error("Error saving service agreement:", error);
        showNotification(`Failed to save agreement: ${error.message}`, "error");
      }
    });
  }

  // Initialize Quick Add Panel
  initializeQuickAddPanel();
}

// Check and update in-progress jobs based on time and employee clock-ins
async function updateInProgressJobs() {
  try {
    if (!db) return;

    const now = new Date();
    const nowTimestamp = firebase.firestore.Timestamp.fromDate(now);

    // Find scheduled jobs that should be in progress based on time
    const scheduledJobsSnapshot = await db
      .collection("serviceHistory")
      .where("status", "==", "Scheduled")
      .where("serviceDate", "<=", nowTimestamp)
      .get();

    const batch = db.batch();
    let updatedCount = 0;

    for (const doc of scheduledJobsSnapshot.docs) {
      const job = doc.data();
      const serviceDate = job.serviceDate.toDate();

      // Check if current time is within service window (assuming 4-hour window)
      const serviceEndTime = new Date(
        serviceDate.getTime() + 4 * 60 * 60 * 1000
      );

      if (now >= serviceDate && now <= serviceEndTime) {
        // Check if any employee is clocked in at this location
        const timeTrackingSnapshot = await db
          .collection("employeeTimeTracking")
          .where("locationId", "==", job.locationId)
          .where("status", "==", "Clocked In")
          .where(
            "clockInTime",
            ">=",
            firebase.firestore.Timestamp.fromDate(
              new Date(serviceDate.getTime() - 60 * 60 * 1000)
            )
          ) // 1 hour before
          .get();

        if (!timeTrackingSnapshot.empty || now >= serviceDate) {
          batch.update(doc.ref, {
            status: "In Progress",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      await batch.commit();
      console.log(`Updated ${updatedCount} jobs to "In Progress" status`);

      // Refresh dashboard if function exists
      if (typeof loadDashboardStats === "function") {
        loadDashboardStats();
      }
    }
  } catch (error) {
    console.error("Error updating in-progress jobs:", error);
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
window.populateQASClientDropdown = populateQASClientDropdown;
window.populateQASLocationDropdown = populateQASLocationDropdown;
window.populateQASLocationClientDropdown = populateQASLocationClientDropdown;
window.triggerPayrollProcessing = triggerPayrollProcessing;
window.loadPayrollStatus = loadPayrollStatus;

// Global payroll status function
async function loadPayrollStatus() {
  if (!db) return;

  try {
    // Try to estimate payroll from completed services (fallback approach)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get completed services in the last 30 days to estimate pending payroll
    const completedServicesSnapshot = await db
      .collection("serviceHistory")
      .where("status", "==", "Complete")
      .where(
        "serviceDate",
        ">=",
        firebase.firestore.Timestamp.fromDate(thirtyDaysAgo)
      )
      .get();

    let estimatedPendingAmount = 0;
    let completedJobs = 0;

    completedServicesSnapshot.forEach((doc) => {
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
      const payrollSnapshot = await db
        .collection("payrollRecords")
        .where("status", "==", "Pending")
        .get();

      actualPendingAmount = 0;
      payrollSnapshot.forEach((doc) => {
        const data = doc.data();
        actualPendingAmount += data.totalAmount || 0;
      });

      const processedSnapshot = await db
        .collection("payrollRecords")
        .where("status", "==", "Paid")
        .get();

      processedCount = processedSnapshot.size;
      statusMessage = `${
        payrollSnapshot.size
      } pending records • Last updated: ${new Date().toLocaleTimeString()}`;
    } catch (payrollError) {
      // Silent handling - this is expected for users without payroll access
      statusMessage = `Estimated: ${completedJobs} jobs completed • Limited access mode`;
      pendingCount = 0;
      processedCount = 0;
    }

    // Update the display
    document.getElementById(
      "pending-payroll-amount"
    ).textContent = `$${actualPendingAmount.toFixed(2)}`;
    document.getElementById("processed-payroll-count").textContent =
      processedCount;
    document.getElementById("payroll-status-message").textContent =
      statusMessage;
  } catch (error) {
    console.error("Error loading payroll status:", error);
    document.getElementById("payroll-status-message").textContent =
      "Unable to load payroll status";
    document.getElementById("pending-payroll-amount").textContent = "$0.00";
    document.getElementById("processed-payroll-count").textContent = "0";
  }
}

// Helper function for payroll processing
async function triggerPayrollProcessing() {
  try {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert("You must be logged in to process payroll.");
      return;
    }
    const idToken = await user.getIdToken();
    const response = await fetch(
      "https://us-central1-cleveland-clean-portal.cloudfunctions.net/processCompletedJobsPayroll",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );
    const result = await response.json();
    alert(result.message || "Payroll processing complete!");
    // Refresh dashboard payroll status and payroll table
    if (typeof loadPayrollStatus === "function") {
      loadPayrollStatus();
    }
    if (typeof fetchAndDisplayPayrollRecords === "function") {
      fetchAndDisplayPayrollRecords();
    }
  } catch (err) {
    console.error("Payroll processing failed:", err);
    alert("Error processing payroll: " + (err.message || err));
  }
}

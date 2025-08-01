// public/js/admin-employees.js
// V2 - Integrated Employee-Specific Rate Management - May 19, 2025

document.addEventListener("DOMContentLoaded", function () {
  console.log(
    "DEBUG AEMP: Admin Employee Management script (V2 - Integrated Rates - May 19, 2025)"
  );

  // --- Firebase App Initialization ---
  if (
    typeof firebase === "undefined" ||
    !firebase.app ||
    !firebase.auth ||
    !firebase.firestore ||
    !firebase.functions
  ) {
    console.error("CRITICAL AEMP: Firebase services not available.");
    document.body.innerHTML =
      "<p style='color:red;text-align:center;font-size:1.2em;'>Error: Firebase services not available.</p>";
    return;
  }
  const auth = firebase.auth();
  const db = firebase.firestore();
  const functions = firebase.functions();
  const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

  // --- Cloud Function URLs ---
  const triggerUrlCreate =
    "https://us-central1-cleveland-clean-portal.cloudfunctions.net/createNewUser_v1";
  const triggerUrlDelete =
    "https://us-central1-cleveland-clean-portal.cloudfunctions.net/deleteAuthUser_v1";
  const triggerUrlUpdatePassword =
    "https://us-central1-cleveland-clean-portal.cloudfunctions.net/updateUserPassword_v1";

  // --- Element References from admin-employees.html ---
  const employeeMainView = document.getElementById("employee-main-view");
  const showAddEmployeeFormBtn = document.getElementById(
    "show-add-employee-form-button"
  );

  const employeeListSection = document.getElementById("employee-list-section");
  const employeeLoadingMessage = document.getElementById(
    "employee-loading-message"
  );
  const employeeCardsContainer = document.getElementById(
    "employee-cards-container"
  );
  const noEmployeesMessage = document.getElementById("no-employees-message");

  // Add Employee Form
  const addEmployeeFormSection = document.getElementById(
    "add-employee-form-section"
  );
  const addEmployeeForm = document.getElementById("add-employee-form");
  const addEmployeeMessageEl = document.getElementById("add-employee-message");
  const cancelAddEmployeeBtn = document.getElementById(
    "cancel-add-employee-button"
  );

  // Edit Employee Form
  const editEmployeeFormSection = document.getElementById(
    "edit-employee-form-section"
  );
  const editEmployeeForm = document.getElementById("edit-employee-form");
  const editEmployeeUidInput = document.getElementById("edit-employee-uid"); // Firestore Doc ID of employeeMasterList
  const editEmployeeAuthUidInput = document.getElementById(
    "edit-employee-auth-uid"
  ); // Firebase Auth UID
  const editEmployeeMessageEl = document.getElementById(
    "edit-employee-message"
  );
  const cancelEditEmployeeBtn = document.getElementById(
    "cancel-edit-employee-button"
  );
  const setEmployeeNewPasswordBtn = document.getElementById(
    "set-employee-new-password-button"
  );
  const setEmployeePasswordMessageEl = document.getElementById(
    "set-employee-password-message"
  );
  const currentEmployeeNameForRatesSpan = document.getElementById(
    "current-employee-name-for-rates"
  );
  // --- User Role Management (within Edit Employee Section) ---
  // Role management section removed - now handled in main form

  // --- Employee Rate Management (within Edit Employee Section) ---
  const employeeRateManagementSection = document.getElementById(
    "employee-rate-management-section"
  );
  const showAddEmployeeRateFormButton = document.getElementById(
    "show-add-employee-rate-form-button"
  );
  const addEditEmployeeRateFormSection = document.getElementById(
    "add-edit-employee-rate-form-section"
  );
  const employeeRateFormTitle = document.getElementById(
    "employee-rate-form-title"
  );
  const addEditEmployeeRateForm = document.getElementById(
    "add-edit-employee-rate-form"
  );
  const editEmployeeRateDocIdInput = document.getElementById(
    "edit-employee-rate-doc-id"
  ); // For editing an existing rate
  const employeeRateLocationSelect = document.getElementById(
    "employee-rate-location-select"
  );
  const employeeRateAmountInput = document.getElementById(
    "employee-rate-amount"
  );
  const saveEmployeeRateButton = document.getElementById(
    "save-employee-rate-button"
  );
  const cancelAddEditEmployeeRateButton = document.getElementById(
    "cancel-add-edit-employee-rate-button"
  );
  const addEditEmployeeRateMessage = document.getElementById(
    "add-edit-employee-rate-message"
  );
  const employeeRatesLoadingMessage = document.getElementById(
    "employee-rates-loading-message"
  );
  const employeeRatesTable = document.getElementById("employee-rates-table");
  const employeeRatesTableBody = document.getElementById(
    "employee-rates-table-body"
  );
  const noEmployeeRatesMessage = document.getElementById(
    "no-employee-rates-message"
  );

  // --- Global Variables ---
  let currentAdminUser = null;
  let currentEditingEmployeeId = null; // To store the ID of the employee being edited (for rate management)
  let currentEditingEmployeeName = null; // To store the name for display purposes

  // --- Helper Functions ---
  function showGeneralMessage(el, message, type = "info") {
    if (el) {
      el.textContent = message;
      el.className = `form-message ${type}`;
      el.style.display = message ? "block" : "none";
    }
    if (type === "error") console.error("AEMP Message:", message);
    else console.log("AEMP Message (" + type + "):", message);
  }

  function setFormDisabledState(formElement, disabled) {
    if (!formElement) return;
    const elements = formElement.querySelectorAll(
      "input, select, textarea, button"
    );
    elements.forEach((el) => (el.disabled = disabled));
  }

  function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === "undefined") return "";
    if (typeof unsafe !== "string") {
      if (typeof unsafe === "number" || typeof unsafe === "boolean") {
        unsafe = String(unsafe);
      } else {
        return "[Invalid Data]";
      }
    }
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Section Visibility Management ---
  function showPageSection(sectionToShow) {
    console.log(
      "DEBUG AEMP: showPageSection called for:",
      sectionToShow ? sectionToShow.id : "Default (Main View)"
    );

    // Define allPageSections locally to avoid hoisting issues
    const allPageSections = [
      employeeMainView,
      addEmployeeFormSection,
      editEmployeeFormSection,
    ];

    allPageSections.forEach((section) => {
      if (section) {
        section.style.display = section === sectionToShow ? "block" : "none";
      }
    });
    // If returning to main view, ensure rate form is hidden
    if (sectionToShow === employeeMainView && addEditEmployeeRateFormSection) {
      addEditEmployeeRateFormSection.style.display = "none";
    }
  }

  // --- Auth State Observer ---
  auth.onAuthStateChanged((user) => {
    currentAdminUser = user;
    if (user) {
      user
        .getIdTokenResult()
        .then((idTokenResult) => {
          const claims = idTokenResult.claims;
          console.log("DEBUG AEMP: User claims:", claims);

          // Attempt to get Firestore user document for role verification, but proceed if claims are sufficient
          db.collection("users")
            .doc(user.uid)
            .get()
            .then((docSnapshot) => {
              let userData = null;
              if (docSnapshot.exists) {
                userData = docSnapshot.data();
                console.log(
                  "DEBUG AEMP: User document data from Firestore:",
                  userData
                );
              } else {
                console.warn(
                  "DEBUG AEMP: User document not found in Firestore for UID:",
                  user.uid
                );
              }

              // Check for admin privileges based on claims OR Firestore role
              const isAdminByClaims =
                claims &&
                (claims.admin === true || claims.super_admin === true);
              const isAdminByRole =
                userData &&
                (userData.role === "admin" || userData.role === "super_admin");

              if (isAdminByClaims || isAdminByRole) {
                console.log(
                  "DEBUG AEMP: Admin access confirmed for Employee Management Page."
                );

                // Store claims on currentAdminUser for later use
                currentAdminUser.claims = claims;

                // Role management is now handled in the main form - no separate section needed

                setupEventListeners();
                fetchAndDisplayEmployees();
                showPageSection(employeeMainView);
              } else {
                console.error(
                  "DEBUG AEMP: Access denied. User does not have sufficient admin claims or role. Redirecting."
                );
                window.location.href = "index.html";
              }
            })
            .catch((error) => {
              console.error(
                "DEBUG AEMP: Error fetching user data from Firestore:",
                error
              );
              // Allow access if claims are sufficient, even if Firestore doc fails, but log error
              const isAdminByClaimsOnly =
                claims &&
                (claims.admin === true || claims.super_admin === true);
              if (isAdminByClaimsOnly) {
                console.warn(
                  "DEBUG AEMP: Proceeding with admin access based on claims despite Firestore user doc error."
                );

                // Store claims on currentAdminUser for later use
                currentAdminUser.claims = claims;

                // Role management is now handled in the main form - no separate section needed

                setupEventListeners();
                fetchAndDisplayEmployees();
                showPageSection(employeeMainView);
              } else {
                window.location.href = "index.html";
              }
            });
        })
        .catch((error) => {
          console.error("DEBUG AEMP: Error fetching ID token result:", error);
          window.location.href = "index.html";
        });
    } else {
      console.log("DEBUG AEMP: No user authenticated. Redirecting.");
      window.location.href = "index.html";
    }
  });

  // --- Event Listener Setup ---
  function setupEventListeners() {
    console.log("DEBUG AEMP: Setting up event listeners.");

    // Hide the rate management section initially (no employee selected)
    if (employeeRateManagementSection) {
      employeeRateManagementSection.style.display = "none";
    }

    if (showAddEmployeeFormBtn) {
      showAddEmployeeFormBtn.addEventListener("click", () => {
        console.log("DEBUG AEMP: 'Add New Employee' button clicked.");
        if (addEmployeeForm) addEmployeeForm.reset();
        showGeneralMessage(addEmployeeMessageEl, "", "info");
        // Hide the rate management section when adding a new employee
        if (employeeRateManagementSection) {
          employeeRateManagementSection.style.display = "none";
        }
        showPageSection(addEmployeeFormSection);
      });
    }

    if (cancelAddEmployeeBtn) {
      cancelAddEmployeeBtn.addEventListener("click", () => {
        // Hide the rate management section when canceling add employee
        if (employeeRateManagementSection) {
          employeeRateManagementSection.style.display = "none";
        }
        showPageSection(employeeMainView);
      });
    }

    if (cancelEditEmployeeBtn) {
      cancelEditEmployeeBtn.addEventListener("click", () => {
        currentEditingEmployeeId = null; // Clear context
        currentEditingEmployeeName = null;
        if (addEditEmployeeRateFormSection)
          addEditEmployeeRateFormSection.style.display = "none"; // Hide rate form
        // Hide the rate management section when no employee is selected
        if (employeeRateManagementSection)
          employeeRateManagementSection.style.display = "none";
        showPageSection(employeeMainView);
      });
    }

    if (addEmployeeForm)
      addEmployeeForm.addEventListener("submit", handleAddEmployeeSubmit);
    if (editEmployeeForm)
      editEmployeeForm.addEventListener("submit", handleEditEmployeeSubmit);
    if (setEmployeeNewPasswordBtn)
      setEmployeeNewPasswordBtn.addEventListener(
        "click",
        handleSetEmployeePassword
      );

    // Rate Management Listeners
    if (showAddEmployeeRateFormButton) {
      showAddEmployeeRateFormButton.addEventListener(
        "click",
        handleShowAddEmployeeRateForm
      );
    }
    if (addEditEmployeeRateForm) {
      addEditEmployeeRateForm.addEventListener(
        "submit",
        handleSaveEmployeeRateSubmit
      );
    }
    if (cancelAddEditEmployeeRateButton) {
      cancelAddEditEmployeeRateButton.addEventListener("click", () => {
        if (addEditEmployeeRateFormSection)
          addEditEmployeeRateFormSection.style.display = "none";
        if (addEditEmployeeRateForm) addEditEmployeeRateForm.reset();
        showGeneralMessage(addEditEmployeeRateMessage, "", "info");
      });
    }
    // Role management form removed - now handled in main employee form

    // Delegated listener for employee card actions
    if (employeeCardsContainer) {
      employeeCardsContainer.addEventListener("click", (event) => {
        const target = event.target;
        const editButton = target.closest(".edit-employee-button");
        const deleteButton = target.closest(".delete-employee-button");

        if (editButton) {
          const employeeId = editButton.dataset.employeeId;
          if (employeeId) handleEditEmployeeClick(employeeId);
        } else if (deleteButton) {
          const employeeId = deleteButton.dataset.employeeId;
          const employeeName = deleteButton.dataset.employeeName;
          if (employeeId)
            handleDeleteEmployeeClick(deleteButton, employeeId, employeeName);
        }
      });
    }

    // Delegated listener for employee rates table actions
    if (employeeRatesTableBody) {
      employeeRatesTableBody.addEventListener("click", (event) => {
        const target = event.target;
        const editRateButton = target.closest(".edit-employee-rate-button");
        const deleteRateButton = target.closest(".delete-employee-rate-button");

        if (editRateButton) {
          const rateDocId = editRateButton.dataset.rateId;
          if (rateDocId) handleEditEmployeeRateClick(rateDocId);
        } else if (deleteRateButton) {
          const rateDocId = deleteRateButton.dataset.rateId;
          const locationName = deleteRateButton.dataset.locationName;
          if (rateDocId)
            handleDeleteEmployeeRateClick(
              deleteRateButton,
              rateDocId,
              locationName
            );
        }
      });
    }

    document.body.addEventListener("click", (event) => {
      if (event.target.matches(".reveal-password-btn")) {
        const targetInputId = event.target.dataset.target;
        const passwordInput = document.getElementById(targetInputId);
        if (passwordInput) {
          const type =
            passwordInput.getAttribute("type") === "password"
              ? "text"
              : "password";
          passwordInput.setAttribute("type", type);
          event.target.textContent = type === "password" ? "👁️" : "🔒";
        }
      }
    });
    console.log("DEBUG AEMP: Event listeners setup complete.");
  }

  // --- Employee Data Functions (Add, Edit, Delete, Fetch) ---
  async function fetchAndDisplayEmployees() {
    // ... (same as admin_employees_js_v1, ensure escapeHtml is defined or use the one in this script) ...
    console.log("DEBUG AEMP: Fetching employee list...");
    if (!db) {
      console.error("DEBUG AEMP: Firestore DB not available.");
      return;
    }

    if (employeeLoadingMessage) employeeLoadingMessage.style.display = "block";
    if (employeeCardsContainer) employeeCardsContainer.classList.add("hidden");
    if (noEmployeesMessage) noEmployeesMessage.classList.add("hidden");
    if (employeeCardsContainer) employeeCardsContainer.innerHTML = "";

    try {
      const snapshot = await db
        .collection("employeeMasterList")
        .orderBy("lastName", "asc")
        .orderBy("firstName", "asc")
        .get();
      if (employeeLoadingMessage) employeeLoadingMessage.style.display = "none";
      if (snapshot.empty) {
        if (noEmployeesMessage) noEmployeesMessage.classList.remove("hidden");
        return;
      }
      let employeesHtml = "";
      snapshot.forEach((doc) => {
        const emp = doc.data();
        const employeeId = doc.id;
        const firstName = escapeHtml(emp.firstName || "");
        const lastName = escapeHtml(emp.lastName || "");
        const name = `${firstName} ${lastName}`.trim() || "N/A";
        const email = escapeHtml(emp.email || "N/A");
        const jobTitle = escapeHtml(emp.jobTitle || "N/A");
        const phone = escapeHtml(emp.phone || "N/A");
        const status =
          typeof emp.status === "boolean"
            ? emp.status
              ? "Active"
              : "Inactive"
            : "N/A";
        const statusBadgeClass = emp.status
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800";

        employeesHtml += `
                    <div class="bg-white border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <h4 class="font-semibold text-lg text-foreground">${name}</h4>
                                <p class="text-sm text-muted-foreground">${jobTitle}</p>
                            </div>
                            <div class="flex flex-col gap-1 items-end">
                                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClass}">${status}</span>
                                <span class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800" id="role-badge-${employeeId}">Employee</span>
                            </div>
                        </div>
                        <div class="space-y-2 text-sm">
                            <div class="flex items-center gap-2">
                                <i data-lucide="mail" class="h-4 w-4 text-muted-foreground"></i>
                                <span class="text-muted-foreground">${email}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <i data-lucide="phone" class="h-4 w-4 text-muted-foreground"></i>
                                <span class="text-muted-foreground">${phone}</span>
                            </div>
                        </div>
                        <div class="flex gap-2 mt-4">
                            <button class="edit-employee-button btn-primary text-xs px-3 py-1 flex-1" data-employee-id="${employeeId}">
                                <i data-lucide="edit" class="h-3 w-3 mr-1"></i>
                                Edit & Roles
                            </button>
                            <button class="delete-employee-button btn-destructive text-xs px-3 py-1" data-employee-id="${employeeId}" data-employee-name="${name}">
                                <i data-lucide="trash-2" class="h-3 w-3 mr-1"></i>
                                Delete
                            </button>
                        </div>
                    </div>
                `;
      });
      if (employeeCardsContainer) {
        employeeCardsContainer.innerHTML = employeesHtml;
        employeeCardsContainer.classList.remove("hidden");
        // Re-initialize Lucide icons for the new cards
        if (typeof lucide !== "undefined") lucide.createIcons();

        // Fetch and display roles for each employee
        snapshot.forEach(async (doc) => {
          const emp = doc.data();
          const employeeId = doc.id;
          const authUid = emp.authUid;

          if (authUid) {
            try {
              const userDoc = await db.collection("users").doc(authUid).get();
              if (userDoc.exists && userDoc.data().role) {
                const role = userDoc.data().role;
                const roleBadge = document.getElementById(
                  `role-badge-${employeeId}`
                );
                if (roleBadge) {
                  roleBadge.textContent =
                    role.charAt(0).toUpperCase() + role.slice(1);
                  // Update badge color based on role
                  roleBadge.className = `px-2 py-1 text-xs font-medium rounded-full ${
                    role === "admin"
                      ? "bg-purple-100 text-purple-800"
                      : role === "manager"
                      ? "bg-orange-100 text-orange-800"
                      : "bg-blue-100 text-blue-800"
                  }`;
                }
              }
            } catch (error) {
              console.warn(
                `Could not fetch role for employee ${employeeId}:`,
                error
              );
            }
          }
        });
      }
    } catch (error) {
      console.error("DEBUG AEMP: Error fetching employees:", error);
      if (employeeLoadingMessage) employeeLoadingMessage.style.display = "none";
      if (noEmployeesMessage) {
        noEmployeesMessage.textContent =
          "Error loading employees: " + error.message;
        noEmployeesMessage.classList.remove("hidden");
      }
    }
  }

  async function handleAddEmployeeSubmit(event) {
    // ... (same as admin_employees_js_v1, ensure all input element consts are correct) ...
    event.preventDefault();
    if (!currentAdminUser) {
      showGeneralMessage(addEmployeeMessageEl, "Admin session error.", "error");
      return;
    }
    setFormDisabledState(addEmployeeForm, true);
    showGeneralMessage(addEmployeeMessageEl, "Creating employee...", "info");

    const addEmployeeFirstNameInput = document.getElementById(
      "add-employee-first-name"
    );
    const addEmployeeLastNameInput = document.getElementById(
      "add-employee-last-name"
    );
    const addEmployeeIdStringInput = document.getElementById(
      "add-employee-id-string"
    );
    const addEmployeeEmailInput = document.getElementById("add-employee-email");
    const addEmployeePhoneInput = document.getElementById("add-employee-phone");
    const addEmployeeJobTitleInput = document.getElementById(
      "add-employee-job-title"
    );
    const addEmployeeInitialPasswordInput = document.getElementById(
      "add-employee-initial-password"
    );

    const employeeData = {
      firstName: addEmployeeFirstNameInput.value.trim(),
      lastName: addEmployeeLastNameInput.value.trim(),
      employeeIdString: addEmployeeIdStringInput.value.trim(),
      email: addEmployeeEmailInput.value.trim().toLowerCase(),
      phone: addEmployeePhoneInput.value.trim(),
      jobTitle: addEmployeeJobTitleInput.value.trim(),
      status: true,
      role: "employee",
    };
    const password = addEmployeeInitialPasswordInput.value;

    if (
      !employeeData.employeeIdString ||
      !employeeData.firstName ||
      !employeeData.lastName ||
      !employeeData.email ||
      !password
    ) {
      showGeneralMessage(
        addEmployeeMessageEl,
        "ID, Name, Email, and Password are required.",
        "error"
      );
      setFormDisabledState(addEmployeeForm, false);
      return;
    }
    // ... (rest of the function is the same as V1)
    try {
      const idToken = await currentAdminUser.getIdToken(true);
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
        showGeneralMessage(
          addEmployeeMessageEl,
          resultData.message || "Employee created!",
          "success"
        );
        addEmployeeForm.reset();
        fetchAndDisplayEmployees();
        setTimeout(() => {
          showPageSection(employeeMainView);
          showGeneralMessage(addEmployeeMessageEl, "", "info");
        }, 2000);
      } else {
        throw new Error(resultData.message || "Cloud function failed.");
      }
    } catch (error) {
      console.error("DEBUG AEMP: Error creating employee:", error);
      showGeneralMessage(
        addEmployeeMessageEl,
        `Error: ${error.message}`,
        "error"
      );
    } finally {
      setFormDisabledState(addEmployeeForm, false);
    }
  }

  // PASTE THIS CODE INTO YOUR admin-employees.js, REPLACING THE EXISTING
  // handleEditEmployeeClick AND handleEditEmployeeSubmit FUNCTIONS.

  async function handleEditEmployeeClick(employeeId) {
    console.count("handleEditEmployeeClick execution count"); // For tracking multiple calls
    console.log(
      `DEBUG AEMP: handleEditEmployeeClick for employeeId: ${employeeId}`
    );
    if (!db) {
      console.error("DEBUG AEMP: Firestore DB not available.");
      return;
    }

    showGeneralMessage(
      editEmployeeMessageEl,
      "Loading employee data...",
      "info"
    );
    if (editEmployeeForm) editEmployeeForm.reset();
    if (addEditEmployeeRateFormSection)
      addEditEmployeeRateFormSection.style.display = "none";
    if (addEditEmployeeRateForm) addEditEmployeeRateForm.reset();
    if (employeeRatesTableBody) employeeRatesTableBody.innerHTML = "";
    if (noEmployeeRatesMessage) noEmployeeRatesMessage.style.display = "none";

    // Role management elements removed - now handled in main form

    currentEditingEmployeeId = employeeId;

    // Show the rate management section when an employee is selected
    if (employeeRateManagementSection) {
      employeeRateManagementSection.style.display = "block";
    }

    // This log was already in your "original" and is good:
    console.log(
      `AEMP DEBUG: editEmployeeAuthUidInput value AT START of handleEditEmployeeClick: '${
        editEmployeeAuthUidInput
          ? editEmployeeAuthUidInput.value
          : "INPUT NOT FOUND"
      }'`
    );

    try {
      const docRef = db.collection("employeeMasterList").doc(employeeId);
      const doc = await docRef.get();

      if (doc.exists) {
        const emp = doc.data();
        currentEditingEmployeeName = `${emp.firstName || ""} ${
          emp.lastName || ""
        }`.trim();

        if (currentEmployeeNameForRatesSpan)
          currentEmployeeNameForRatesSpan.textContent = escapeHtml(
            currentEditingEmployeeName
          );

        // Set the employee ID in the hidden input field
        const editEmployeeUidInput =
          document.getElementById("edit-employee-uid");
        if (editEmployeeUidInput) {
          editEmployeeUidInput.value = employeeId;
        } else {
          console.warn(
            "AEMP: edit-employee-uid element not found when populating form"
          );
        }
        document.getElementById("edit-employee-first-name").value =
          emp.firstName || "";
        document.getElementById("edit-employee-last-name").value =
          emp.lastName || "";
        document.getElementById("edit-employee-email").value = emp.email || "";
        document.getElementById("edit-employee-phone").value = emp.phone || "";
        document.getElementById("edit-employee-job-title").value =
          emp.jobTitle || "";
        document.getElementById("edit-employee-id-string").value =
          emp.employeeIdString || "N/A";
        document.getElementById("edit-employee-system-id").value = employeeId;
        document.getElementById("edit-employee-status").value =
          typeof emp.status === "boolean" ? emp.status.toString() : "true";

        // Show/hide role field based on current user's permissions
        // Remove all code that references 'edit-employee-role', roleField, or role management in the edit employee form.
        // This includes population, event listeners, and comments about role management being handled in the main form.
        // No code should reference or attempt to set/get the role field in the edit employee form.

        const usersQuery = db
          .collection("users")
          .where("profileId", "==", employeeId)
          .limit(1);
        const userSnapshot = await usersQuery.get();
        let authUid = null;

        if (!userSnapshot.empty) {
          authUid = userSnapshot.docs[0].id;
          // This log was already in your "original" and is good:
          if (editEmployeeAuthUidInput)
            editEmployeeAuthUidInput.value = authUid;
          console.log(
            `AEMP DEBUG: editEmployeeAuthUidInput.value SET TO: '${editEmployeeAuthUidInput.value}'`
          );

          // Populate role field if user has permission to see it
          // Remove all code that references 'edit-employee-role', roleField, or role management in the edit employee form.
          // This includes population, event listeners, and comments about role management being handled in the main form.
          // No code should reference or attempt to set/get the role field in the edit employee form.

          // --- START NEW DETAILED LOGS for element checks ---
          console.log(
            "AEMP DEBUG: Checking setEmployeeNewPasswordBtn:",
            setEmployeeNewPasswordBtn
          );
          if (setEmployeeNewPasswordBtn) {
            setEmployeeNewPasswordBtn.disabled = false;
            console.log(
              "AEMP DEBUG: setEmployeeNewPasswordBtn.disabled set to false"
            );
          } else {
            console.error(
              "AEMP ERROR: setEmployeeNewPasswordBtn element is null!"
            );
          }

          // Role management elements removed - now handled in main form
          // --- END NEW DETAILED LOGS for element checks ---

          // Role management is now handled in the main form - no separate section needed
        } else {
          // This block for "No Auth UID found" from your original looks good, including its logs.
          console.warn(
            `AEMP WARN: No Auth UID found in 'users' for employeeProfileId: ${employeeId}. Password/Role management will be disabled.`
          );
          if (editEmployeeAuthUidInput) editEmployeeAuthUidInput.value = "";
          console.log(
            `AEMP DEBUG: editEmployeeAuthUidInput.value SET TO EMPTY (Auth UID not found). Current value: '${editEmployeeAuthUidInput.value}'`
          );
          if (setEmployeeNewPasswordBtn)
            setEmployeeNewPasswordBtn.disabled = true;
          showGeneralMessage(
            editEmployeeMessageEl,
            "Warning: Login account (Auth UID) not found for this employee profile. Password or role cannot be managed.",
            "error"
          );

          // Role management elements removed - now handled in main form
          const currentRoleDisplayEl = document.getElementById(
            "currentEmployeeRoleDisplay"
          );
          if (currentRoleDisplayEl)
            currentRoleDisplayEl.textContent = "employee (No Auth account)";
        }

        // --- ADDED LOGS AROUND SHOWPAGESECTION ---
        console.log(
          "AEMP DEBUG: About to call showPageSection(editEmployeeFormSection)"
        );
        showPageSection(editEmployeeFormSection);
        console.log(
          "AEMP DEBUG: Called showPageSection(editEmployeeFormSection). editEmployeeFormSection display style:",
          editEmployeeFormSection
            ? editEmployeeFormSection.style.display
            : "N/A (editEmployeeFormSection is null!)"
        );
        // --- END ADDED LOGS AROUND SHOWPAGESECTION ---

        await fetchAndDisplayEmployeeRates(
          employeeId,
          currentEditingEmployeeName
        );
      } else {
        showGeneralMessage(
          editEmployeeMessageEl,
          "Employee data not found in employeeMasterList.",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "DEBUG AEMP: Error in handleEditEmployeeClick for employeeId " +
          employeeId +
          ":",
        error
      );
      showGeneralMessage(
        editEmployeeMessageEl,
        `Error loading employee: ${error.message}`,
        "error"
      );
    }
  }

  async function handleEditEmployeeSubmit(event) {
    event.preventDefault();

    // Get the element directly to avoid null reference issues
    let editEmployeeUidInput = document.getElementById("edit-employee-uid");
    console.log(
      "AEMP DEBUG: editEmployeeUidInput found:",
      editEmployeeUidInput
    );

    // If element doesn't exist, create it
    if (!editEmployeeUidInput) {
      console.warn("AEMP: Creating missing edit-employee-uid element");
      const editForm = document.getElementById("edit-employee-form");
      if (editForm) {
        editEmployeeUidInput = document.createElement("input");
        editEmployeeUidInput.type = "hidden";
        editEmployeeUidInput.id = "edit-employee-uid";
        editForm.appendChild(editEmployeeUidInput);
        console.log("AEMP: Created edit-employee-uid element");

        // Set the value from the global variable
        if (currentEditingEmployeeId) {
          editEmployeeUidInput.value = currentEditingEmployeeId;
          console.log(
            "AEMP: Set employee ID value to:",
            currentEditingEmployeeId
          );
        }
      }
    }

    if (!db || !serverTimestamp) {
      showGeneralMessage(editEmployeeMessageEl, "System error.", "error");
      return;
    }
    setFormDisabledState(editEmployeeForm, true);
    showGeneralMessage(editEmployeeMessageEl, "Saving changes...", "info");

    // Check if editEmployeeUidInput exists before accessing its value
    if (!editEmployeeUidInput) {
      console.error("AEMP ERROR: edit-employee-uid element not found!");
      console.log("AEMP DEBUG: Available elements with 'edit' in ID:");
      const allElements = document.querySelectorAll('[id*="edit"]');
      allElements.forEach((el) => console.log("  -", el.id));

      showGeneralMessage(
        editEmployeeMessageEl,
        "Error: Employee form not properly loaded. Please refresh the page.",
        "error"
      );
      setFormDisabledState(editEmployeeForm, false);
      return;
    }

    const employeeId = editEmployeeUidInput.value; // This is employeeMasterList doc ID
    // Guard against empty employeeId just in case form is submitted without one
    if (!employeeId) {
      showGeneralMessage(
        editEmployeeMessageEl,
        "Error: Employee ID is missing. Cannot save.",
        "error"
      );
      setFormDisabledState(editEmployeeForm, false);
      return;
    }
    // Safely get form values with null checks
    const firstNameEl = document.getElementById("edit-employee-first-name");
    const lastNameEl = document.getElementById("edit-employee-last-name");
    const phoneEl = document.getElementById("edit-employee-phone");
    const jobTitleEl = document.getElementById("edit-employee-job-title");
    const statusEl = document.getElementById("edit-employee-status");
    const roleEl = document.getElementById("edit-employee-role"); // This element was removed from HTML

    if (!firstNameEl || !lastNameEl || !phoneEl || !jobTitleEl || !statusEl) {
      console.error("AEMP ERROR: Missing form elements for employee update");
      showGeneralMessage(
        editEmployeeMessageEl,
        "Error: Form elements missing. Please refresh the page.",
        "error"
      );
      setFormDisabledState(editEmployeeForm, false);
      return;
    }

    const updatedData = {
      firstName: firstNameEl.value.trim(),
      lastName: lastNameEl.value.trim(),
      phone: phoneEl.value.trim(),
      jobTitle: jobTitleEl.value.trim(),
      status: statusEl.value === "true", // Assuming 'true'/'false' string from select
      updatedAt: serverTimestamp(), // Uses the global serverTimestamp
    };

    // Get employee's auth UID for role update
    const authUidEl = document.getElementById("edit-employee-auth-uid");
    const authUid = authUidEl ? authUidEl.value.trim() : null;
    try {
      await db
        .collection("employeeMasterList")
        .doc(employeeId)
        .update(updatedData);

      // Update role if role field exists and auth UID is available
      // Note: Role management was removed from the form, so this section is disabled
      if (roleEl && authUid && roleEl.value) {
        try {
          // Update role in users collection
          await db.collection("users").doc(authUid).update({
            role: roleEl.value,
            updatedAt: serverTimestamp(),
          });

          // Also call cloud function to update custom claims
          const response = await fetch(
            "https://us-central1-cleveland-clean-portal.cloudfunctions.net/setAdminRole",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
              },
              body: JSON.stringify({
                data: {
                  targetUid: authUid,
                  roleToSet: roleEl.value,
                },
              }),
            }
          );

          if (!response.ok) {
            console.warn(
              "Failed to update custom claims, but role updated in database"
            );
          }

          console.log(
            `AEMP: Successfully updated role to ${roleEl.value} for employee ${authUid}`
          );
        } catch (roleError) {
          console.warn("Error updating employee role:", roleError);
          showGeneralMessage(
            editEmployeeMessageEl,
            "Employee updated, but role update failed. Please try again.",
            "warning"
          );
        }
      } else {
        // Role management was removed from the form, so we skip role updates
        console.log(
          "AEMP: Role management disabled - role field was removed from the form"
        );
      }

      showGeneralMessage(
        editEmployeeMessageEl,
        "Employee updated successfully!",
        "success"
      );
      fetchAndDisplayEmployees(); // Refresh list
      setTimeout(() => {
        showPageSection(employeeMainView);
        showGeneralMessage(editEmployeeMessageEl, "", "info"); // Clear message
      }, 1500);
    } catch (error) {
      console.error("DEBUG AEMP: Error updating employee:", error);
      showGeneralMessage(
        editEmployeeMessageEl,
        `Error: ${error.message}`,
        "error"
      );
    } finally {
      setFormDisabledState(editEmployeeForm, false);
    }
  }

  // END OF CODE TO PASTE

  // --- This is the REVISED and COMPLETED handleSetEmployeePassword function ---
  async function handleSetEmployeePassword() {
    if (!currentAdminUser) {
      showGeneralMessage(
        setEmployeePasswordMessageEl,
        "Admin session error. Please re-login.",
        "error"
      );
      return;
    }
    if (!setEmployeeNewPasswordBtn) {
      // Guard clause in case button element isn't found
      console.error("AEMP ERROR: setEmployeeNewPasswordBtn not found.");
      return;
    }

    const targetAuthUid = editEmployeeAuthUidInput.value; // This input should hold the Auth UID
    const newPasswordInput = document.getElementById(
      "set-employee-new-password-input"
    );
    const newPassword = newPasswordInput.value;

    if (!targetAuthUid || targetAuthUid === "N/A - Login account not found") {
      showGeneralMessage(
        setEmployeePasswordMessageEl,
        "Target user Auth UID not available. Cannot set password.",
        "error"
      );
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showGeneralMessage(
        setEmployeePasswordMessageEl,
        "New password must be at least 6 characters long.",
        "error"
      );
      return;
    }

    // Disable button and show processing message
    setEmployeeNewPasswordBtn.disabled = true;
    showGeneralMessage(
      setEmployeePasswordMessageEl,
      "Setting new password...",
      "info"
    );

    try {
      const idToken = await currentAdminUser.getIdToken(true);
      const payload = { targetUid: targetAuthUid, newPassword: newPassword };

      console.log(
        `AEMP DEBUG: Calling Cloud Function: ${triggerUrlUpdatePassword} for Auth UID: ${targetAuthUid}`
      );
      const response = await fetch(triggerUrlUpdatePassword, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + idToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resultData = await response.json();
      console.log(
        "AEMP DEBUG: Raw response from updateUserPassword_v1 function:",
        response.status,
        resultData
      );

      if (!response.ok) {
        throw new Error(
          resultData.error ||
            resultData.message ||
            `Server error: ${response.status}`
        );
      }

      if (resultData.success) {
        showGeneralMessage(
          setEmployeePasswordMessageEl,
          resultData.message || "Password updated successfully!",
          "success"
        );
        if (newPasswordInput) newPasswordInput.value = ""; // Clear the password input field
      } else {
        throw new Error(
          resultData.error ||
            resultData.message ||
            "Cloud function indicated failure."
        );
      }
    } catch (error) {
      console.error(
        "AEMP CATCH ERROR: Error setting employee password:",
        error
      );
      showGeneralMessage(
        setEmployeePasswordMessageEl,
        `Error: ${error.message}`,
        "error"
      );
    } finally {
      if (setEmployeeNewPasswordBtn) setEmployeeNewPasswordBtn.disabled = false;
    }
  }
  // --- End of REVISED handleSetEmployeePassword function ---

  // --- This is the REVISED handleDeleteEmployeeClick function ---
  async function handleDeleteEmployeeClick(button, employeeId, employeeName) {
    if (!employeeId) {
      console.error(
        "AEMP ERROR: handleDeleteEmployeeClick called without employeeId."
      );
      alert("An error occurred: Employee ID is missing.");
      return;
    }
    if (
      !confirm(
        `ARE YOU SURE you want to delete employee: ${escapeHtml(
          employeeName
        )} (Profile ID: ${employeeId})? This action is permanent and will delete their login account and profile.`
      )
    ) {
      return;
    }

    if (button) button.disabled = true;
    // It's good practice to have a dedicated message element for delete operations near the list or globally.
    // For now, we'll use alerts and console logs. You can integrate showGeneralMessage if you have an element.
    console.log(
      `AEMP INFO: Attempting to delete employee: ${employeeName}, Profile ID: ${employeeId}`
    );

    try {
      if (!currentAdminUser) {
        throw new Error("Admin user session not found. Please re-login.");
      }

      // 1. Find the Auth UID from the 'users' collection using the employeeProfileId
      console.log(
        `AEMP DEBUG: Fetching Auth UID for employeeProfileId: ${employeeId}`
      );
      const usersQuery = db
        .collection("users")
        .where("profileId", "==", employeeId)
        .limit(1);
      const userSnapshot = await usersQuery.get();

      if (userSnapshot.empty) {
        // If no Auth UID, the user might only have a profile record and no login.
        // Or, data inconsistency. Decide how to handle. For now, we'll try to delete profile only.
        console.warn(
          `AEMP WARN: No Auth UID (login account) found in 'users' collection for employeeProfileId: ${employeeId}. Proceeding to delete profile record only.`
        );

        // Attempt to delete the employeeMasterList document directly
        await db.collection("employeeMasterList").doc(employeeId).delete();
        console.log(
          `AEMP INFO: Successfully deleted employeeMasterList profile: ${employeeId} (as no Auth UID was found).`
        );
        alert(
          `${escapeHtml(
            employeeName
          )}'s profile record has been deleted. No associated login account was found.`
        );
        fetchAndDisplayEmployees(); // Refresh the list
        if (button) button.disabled = false;
        return; // Exit here since there's no Auth UID to pass to the function
      }

      const authUidToDelete = userSnapshot.docs[0].id;
      console.log(
        `AEMP DEBUG: Found Auth UID: ${authUidToDelete} for employeeProfileId: ${employeeId}`
      );

      // 2. Get ID Token for the admin
      const idToken = await currentAdminUser.getIdToken(true);

      // 3. Call the deleteAuthUser_v1 Cloud Function
      console.log(
        `AEMP DEBUG: Calling Cloud Function: ${triggerUrlDelete} to delete Auth UID: ${authUidToDelete}`
      );
      const response = await fetch(triggerUrlDelete, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + idToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uidToDelete: authUidToDelete }),
      });

      const resultData = await response.json();
      console.log(
        "AEMP DEBUG: Raw response from deleteAuthUser_v1 function:",
        response.status,
        resultData
      );

      if (!response.ok) {
        // If the function returns an error (e.g., 4xx, 5xx)
        throw new Error(
          resultData.error?.message ||
            resultData.message ||
            `Server error: ${response.status}`
        );
      }

      if (resultData.success) {
        console.log(
          `AEMP INFO: Successfully deleted user via Cloud Function. Message: ${resultData.message}`
        );
        alert(
          resultData.message ||
            `${escapeHtml(employeeName)} has been deleted successfully.`
        );
        fetchAndDisplayEmployees(); // Refresh the list
      } else {
        // If the function returns success:false in its JSON body
        throw new Error(
          resultData.message ||
            resultData.error?.message ||
            "Cloud function indicated failure but did not provide a specific error message."
        );
      }
    } catch (error) {
      console.error(
        "AEMP CATCH ERROR: Error during employee deletion process:",
        error
      );
      alert(`Error deleting employee: ${error.message}`);
    } finally {
      if (button) button.disabled = false;
    }
  }
  // --- End of REVISED handleDeleteEmployeeClick function ---

  // --- Employee Rate Management Functions ---
  async function populateLocationsDropdownForEmployeeRate() {
    console.log(
      "DEBUG AEMP: Populating locations dropdown for employee rate form."
    );
    if (!db || !employeeRateLocationSelect) {
      console.error("DEBUG AEMP: DB or location select for rates not found.");
      return;
    }
    employeeRateLocationSelect.disabled = true;
    employeeRateLocationSelect.innerHTML =
      '<option value="">-- Loading Locations --</option>';
    try {
      const snapshot = await db
        .collection("locations")
        .where("status", "==", true)
        .orderBy("locationName", "asc")
        .get();
      let optionsHtml = '<option value="">-- Select Location --</option>';
      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          const loc = doc.data();
          optionsHtml += `<option value="${doc.id}">${escapeHtml(
            loc.locationName || "Unnamed Location"
          )}</option>`;
        });
      } else {
        optionsHtml =
          '<option value="">-- No Active Locations Found --</option>';
      }
      employeeRateLocationSelect.innerHTML = optionsHtml;
    } catch (error) {
      console.error("DEBUG AEMP: Error populating locations for rates:", error);
      employeeRateLocationSelect.innerHTML =
        '<option value="">-- Error Loading --</option>';
    } finally {
      employeeRateLocationSelect.disabled = false;
    }
  }

  async function fetchAndDisplayEmployeeRates(employeeId, employeeName) {
    console.log(
      `DEBUG AEMP: Fetching rates for employee: ${employeeName} (ID: ${employeeId})`
    );
    if (!db || !employeeId) {
      console.error(
        "DEBUG AEMP: DB or Employee ID missing for fetching rates."
      );
      return;
    }

    if (employeeRatesLoadingMessage)
      employeeRatesLoadingMessage.style.display = "block";
    if (employeeRatesTable) employeeRatesTable.style.display = "none";
    if (noEmployeeRatesMessage) noEmployeeRatesMessage.style.display = "none";
    if (employeeRatesTableBody) employeeRatesTableBody.innerHTML = "";

    try {
      const ratesSnapshot = await db
        .collection("employeeRates")
        .where("employeeProfileId", "==", employeeId)
        .orderBy("locationName", "asc") // Optional: order by location name
        .get();

      if (employeeRatesLoadingMessage)
        employeeRatesLoadingMessage.style.display = "none";

      if (ratesSnapshot.empty) {
        if (noEmployeeRatesMessage)
          noEmployeeRatesMessage.style.display = "block";
        console.log(`DEBUG AEMP: No rates found for employee ${employeeId}.`);
      } else {
        let ratesHtml = "";
        ratesSnapshot.forEach((doc) => {
          const rateData = doc.data();
          const rateDocId = doc.id;
          ratesHtml += `
                        <tr>
                            <td>${escapeHtml(
                              rateData.locationName || "N/A"
                            )}</td>
                            <td>$${escapeHtml(
                              typeof rateData.rate === "number"
                                ? rateData.rate.toFixed(2)
                                : "N/A"
                            )}</td>
                            <td>
                                <button class="edit-employee-rate-button button-small" data-rate-id="${rateDocId}">Edit</button>
                                <button class="delete-employee-rate-button button-small button-danger" data-rate-id="${rateDocId}" data-location-name="${escapeHtml(
            rateData.locationName || ""
          )}">Delete</button>
                            </td>
                        </tr>
                    `;
        });
        if (employeeRatesTableBody)
          employeeRatesTableBody.innerHTML = ratesHtml;
        if (employeeRatesTable) employeeRatesTable.style.display = "table";
        console.log(
          `DEBUG AEMP: Displayed ${ratesSnapshot.size} rates for employee ${employeeId}.`
        );
      }
    } catch (error) {
      console.error(
        `DEBUG AEMP: Error fetching rates for employee ${employeeId}:`,
        error
      );
      if (employeeRatesLoadingMessage)
        employeeRatesLoadingMessage.style.display = "none";
      if (noEmployeeRatesMessage) {
        noEmployeeRatesMessage.textContent =
          "Error loading rates for this employee.";
        noEmployeeRatesMessage.style.display = "block";
      }
    }
  }

  async function handleShowAddEmployeeRateForm() {
    if (!currentEditingEmployeeId) {
      alert("Please select an employee to edit before adding rates.");
      return;
    }
    console.log(
      `DEBUG AEMP: Showing add rate form for employee: ${currentEditingEmployeeName}`
    );
    if (addEditEmployeeRateForm) addEditEmployeeRateForm.reset();
    if (editEmployeeRateDocIdInput) editEmployeeRateDocIdInput.value = ""; // Clear for add mode
    if (employeeRateFormTitle)
      employeeRateFormTitle.textContent = `Add New Rate for ${escapeHtml(
        currentEditingEmployeeName
      )}`;
    if (saveEmployeeRateButton)
      saveEmployeeRateButton.textContent = "Save Rate";
    showGeneralMessage(addEditEmployeeRateMessage, "", "info");

    await populateLocationsDropdownForEmployeeRate(); // Populate locations

    if (addEditEmployeeRateFormSection)
      addEditEmployeeRateFormSection.style.display = "block";
    setFormDisabledState(addEditEmployeeRateForm, false);
  }

  async function handleEditEmployeeRateClick(rateDocId) {
    if (!currentEditingEmployeeId) return;
    console.log(
      `DEBUG AEMP: Editing rate Doc ID: ${rateDocId} for employee: ${currentEditingEmployeeName}`
    );
    showGeneralMessage(
      addEditEmployeeRateMessage,
      "Loading rate data...",
      "info"
    );
    if (addEditEmployeeRateForm) addEditEmployeeRateForm.reset();
    setFormDisabledState(addEditEmployeeRateForm, true);

    try {
      const rateDoc = await db.collection("employeeRates").doc(rateDocId).get();
      if (rateDoc.exists) {
        const rateData = rateDoc.data();
        await populateLocationsDropdownForEmployeeRate(); // Populate first

        if (editEmployeeRateDocIdInput)
          editEmployeeRateDocIdInput.value = rateDocId;
        if (employeeRateLocationSelect)
          employeeRateLocationSelect.value = rateData.locationId || "";
        if (employeeRateAmountInput)
          employeeRateAmountInput.value =
            typeof rateData.rate === "number" ? rateData.rate : "";

        if (employeeRateFormTitle)
          employeeRateFormTitle.textContent = `Edit Rate for ${escapeHtml(
            currentEditingEmployeeName
          )} at ${escapeHtml(rateData.locationName || "")}`;
        if (saveEmployeeRateButton)
          saveEmployeeRateButton.textContent = "Update Rate";

        // For editing, location cannot be changed as it's part of the key with employeeId
        if (employeeRateLocationSelect)
          employeeRateLocationSelect.disabled = true;

        showGeneralMessage(addEditEmployeeRateMessage, "", "info");
        if (addEditEmployeeRateFormSection)
          addEditEmployeeRateFormSection.style.display = "block";
      } else {
        showGeneralMessage(
          addEditEmployeeRateMessage,
          "Error: Rate record not found.",
          "error"
        );
      }
    } catch (error) {
      console.error("DEBUG AEMP: Error fetching rate for edit:", error);
      showGeneralMessage(
        addEditEmployeeRateMessage,
        `Error loading rate: ${error.message}`,
        "error"
      );
    } finally {
      setFormDisabledState(addEditEmployeeRateForm, false);
      if (employeeRateLocationSelect && editEmployeeRateDocIdInput.value) {
        // If editing, keep location disabled
        employeeRateLocationSelect.disabled = true;
      }
    }
  }

  async function handleSaveEmployeeRateSubmit(event) {
    event.preventDefault();
    if (!currentAdminUser || !currentEditingEmployeeId) {
      showGeneralMessage(
        addEditEmployeeRateMessage,
        "Session or employee context error.",
        "error"
      );
      return;
    }
    setFormDisabledState(addEditEmployeeRateForm, true);
    showGeneralMessage(addEditEmployeeRateMessage, "Saving rate...", "info");

    const rateDocId = editEmployeeRateDocIdInput.value; // Empty if adding new
    const locationId = employeeRateLocationSelect.value;
    const rateAmountStr = employeeRateAmountInput.value;

    if (!locationId || rateAmountStr.trim() === "") {
      showGeneralMessage(
        addEditEmployeeRateMessage,
        "Location and Rate Amount are required.",
        "error"
      );
      setFormDisabledState(addEditEmployeeRateForm, false);
      return;
    }
    const rateAmount = parseFloat(rateAmountStr);
    if (isNaN(rateAmount) || rateAmount < 0) {
      showGeneralMessage(
        addEditEmployeeRateMessage,
        "Rate must be a valid non-negative number.",
        "error"
      );
      setFormDisabledState(addEditEmployeeRateForm, false);
      return;
    }

    const selectedLocationOption =
      employeeRateLocationSelect.options[
        employeeRateLocationSelect.selectedIndex
      ];
    const locationName = selectedLocationOption
      ? selectedLocationOption.textContent
      : "Unknown Location";

    const rateData = {
      employeeProfileId: currentEditingEmployeeId,
      employeeName: currentEditingEmployeeName, // Denormalized
      locationId: locationId,
      locationName: locationName, // Denormalized
      rate: rateAmount,
      updatedAt: serverTimestamp(),
    };

    try {
      const ratesCollectionRef = db.collection("employeeRates");
      if (rateDocId) {
        // Editing existing rate
        await ratesCollectionRef.doc(rateDocId).update({
          rate: rateAmount,
          updatedAt: serverTimestamp(),
        });
        showGeneralMessage(
          addEditEmployeeRateMessage,
          "Rate updated successfully!",
          "success"
        );
      } else {
        // Adding new rate - check for uniqueness
        const uniquenessQuery = await ratesCollectionRef
          .where("employeeProfileId", "==", currentEditingEmployeeId)
          .where("locationId", "==", locationId)
          .limit(1)
          .get();

        if (!uniquenessQuery.empty) {
          throw new Error(
            `A rate already exists for ${currentEditingEmployeeName} at ${locationName}. Please edit the existing rate.`
          );
        }
        rateData.createdAt = serverTimestamp();
        await ratesCollectionRef.add(rateData);
        showGeneralMessage(
          addEditEmployeeRateMessage,
          "Rate added successfully!",
          "success"
        );
      }
      fetchAndDisplayEmployeeRates(
        currentEditingEmployeeId,
        currentEditingEmployeeName
      ); // Refresh rates list
      setTimeout(() => {
        if (addEditEmployeeRateFormSection)
          addEditEmployeeRateFormSection.style.display = "none";
        if (addEditEmployeeRateForm) addEditEmployeeRateForm.reset();
        showGeneralMessage(addEditEmployeeRateMessage, "", "info");
      }, 1500);
    } catch (error) {
      console.error("DEBUG AEMP: Error saving employee rate:", error);
      showGeneralMessage(
        addEditEmployeeRateMessage,
        `Error: ${error.message}`,
        "error"
      );
    } finally {
      setFormDisabledState(addEditEmployeeRateForm, false);
    }
  }

  async function handleDeleteEmployeeRateClick(
    button,
    rateDocId,
    locationName
  ) {
    if (!rateDocId || !currentEditingEmployeeId) {
      alert("Error: Missing rate or employee information for deletion.");
      return;
    }
    if (
      !confirm(
        `ARE YOU SURE you want to delete the rate for ${currentEditingEmployeeName} at ${locationName}?`
      )
    ) {
      return;
    }
    if (button) button.disabled = true;

    try {
      await db.collection("employeeRates").doc(rateDocId).delete();
      alert("Rate deleted successfully.");
      fetchAndDisplayEmployeeRates(
        currentEditingEmployeeId,
        currentEditingEmployeeName
      ); // Refresh list
    } catch (error) {
      console.error("DEBUG AEMP: Error deleting employee rate:", error);
      alert(`Error deleting rate: ${error.message}`);
      if (button) button.disabled = false;
    }
  }
  console.log(
    "DEBUG AEMP: Admin Employee Management script (with rate stubs) fully initialized."
  );
});

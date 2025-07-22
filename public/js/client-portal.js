// Cleveland Clean Solutions - Client Portal JavaScript  
// Modern sidebar navigation and dashboard functionality

let currentView = 'dashboard';
let currentClient = null;

// Firebase initialization
let auth, db, storage;
let currentUser = null;

// Initialize Firebase
try {
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();
    console.log("CLIENT: Firebase initialized successfully");
    
    // Monitor authentication state
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            console.log("CLIENT: User authenticated:", user.email);
            // Load user profile and client data
            loadClientProfile(user);
        } else {
            console.log("CLIENT: User not authenticated, redirecting to login");
            // Redirect to login page if not authenticated
            window.location.href = '/index.html';
        }
    });
} catch (error) {
    console.error("CLIENT: Firebase initialization error:", error);
}

// Load client profile data
async function loadClientProfile(user) {
    if (!db || !user) return;
    
    try {
        // Find the client profile for this authenticated user
        const snapshot = await db.collection('clientMasterList')
            .where('email', '==', user.email)
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            const clientDoc = snapshot.docs[0];
            const clientData = clientDoc.data();
            
            // Store client information globally
            currentClient = {
                id: clientDoc.id,
                companyName: clientData.companyName,
                contactName: clientData.contactName,
                email: clientData.email,
                phone: clientData.phone,
                status: clientData.status,
                nextService: clientData.nextService || 'Contact us to schedule',
                balance: clientData.balance || 0,
                pendingInvoices: clientData.pendingInvoices || 0,
                contractType: clientData.contractType || 'Standard Cleaning',
                serviceAddress: 'Loading locations...'
            };
            
            console.log("CLIENT: Client profile loaded:", currentClient.companyName);
            
            // Load service agreement data
            await loadServiceAgreement(currentClient.id);
            
            // Update UI with real client data
            updateClientUI();
            
            // Load initial dashboard data
            loadDashboardData();
            
        } else {
            console.error("CLIENT: No client profile found for user:", user.email);
            showErrorMessage("No client profile found for your account. Please contact support to set up your account.");
            return;
        }
    } catch (error) {
        console.error("CLIENT: Error loading client profile:", error);
        
        // Handle permission errors with proper message
        if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
            console.error("CLIENT: Permission denied accessing client profile");
            showErrorMessage("Access denied. Please ensure your account has proper permissions or contact support.");
        } else {
            console.error("CLIENT: Error loading client profile:", error);
            showErrorMessage("Error loading your profile. Please try refreshing the page or contact support.");
        }
    }
}

// Update UI elements with real client data
function updateClientUI() {
    if (!currentClient) return;
    
    // Update welcome message with real company name
    const welcomeEl = document.getElementById('welcome-message');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome, ${currentClient.companyName}!`;
    }
    
    // Update sidebar client name
    const sidebarNameEl = document.getElementById('client-name-sidebar');
    if (sidebarNameEl) {
        sidebarNameEl.textContent = currentClient.contactName;
    }
    
    // Show main dashboard, hide loading
    const loadingEl = document.getElementById('client-loading-message');
    const dashboardEl = document.getElementById('client-dashboard-content');
    if (loadingEl) loadingEl.style.display = 'none';
    if (dashboardEl) dashboardEl.style.display = 'block';
    
    console.log("CLIENT: UI updated with real client data");
}

// Show error message to user
function showErrorMessage(message) {
    const loadingEl = document.getElementById('client-loading-message');
    const dashboardEl = document.getElementById('client-dashboard-content');
    
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="text-center">
                <div class="mb-4">
                    <i data-lucide="alert-triangle" class="h-12 w-12 text-red-500 mx-auto mb-4"></i>
                    <h2 class="text-xl font-bold text-red-600">Access Error</h2>
                </div>
                <p class="text-gray-600 mb-4">${message}</p>
                <button onclick="window.location.reload()" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark">
                    Try Again
                </button>
                <br><br>
                <button onclick="auth.signOut().then(() => window.location.href = '/index.html')" class="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600">
                    Sign Out
                </button>
            </div>
        `;
    }
    
    if (dashboardEl) {
        dashboardEl.style.display = 'none';
    }
}

// Load service agreement data for the client
async function loadServiceAgreement(clientId) {
    if (!db || !clientId) return;
    
    try {
        console.log("CLIENT: Loading service agreement for client:", clientId);
        
        const snapshot = await db.collection('serviceAgreements')
            .where('clientId', '==', clientId)
            .where('isActive', '==', true)
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            const agreementDoc = snapshot.docs[0];
            const agreement = agreementDoc.data();
            
            // Update current client with agreement details
            currentClient.serviceAgreement = {
                frequency: agreement.frequency,
                includedServices: agreement.includedServices || [],
                specialInstructions: agreement.specialInstructions || '',
                startDate: agreement.createdAt,
                lastUpdated: agreement.updatedAt
            };
            
            console.log("CLIENT: Service agreement loaded:", agreement.frequency);
        } else {
            console.log("CLIENT: No active service agreement found");
            currentClient.serviceAgreement = null;
        }
    } catch (error) {
        console.error("CLIENT: Error loading service agreement:", error);
        currentClient.serviceAgreement = null;
    }
}

// Mobile sidebar functionality
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && overlay) {
        const isOpen = sidebar.classList.contains('sidebar-open');
        
        if (isOpen) {
            sidebar.classList.remove('sidebar-open');
            overlay.classList.remove('active');
        } else {
            sidebar.classList.add('sidebar-open');
            overlay.classList.add('active');
        }
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.remove('sidebar-open');
        overlay.classList.remove('active');
    }
}

// Navigation function
function showView(viewName) {
    console.log(`CLIENT: Switching to view: ${viewName}`);
    
    // Close mobile sidebar when navigating
    closeMobileSidebar();
    
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
    
    // Load view-specific data
    loadViewData(viewName);
    
    // Re-initialize icons after view change
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load data for specific views
function loadViewData(viewName) {
    switch (viewName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'services':
            loadServicesData();
            break;
        case 'invoices':
            loadInvoicesData();
            break;
        case 'photos':
            loadPhotosData();
            break;
        case 'profile':
            loadProfileData();
            break;
    }
}

// Dashboard data loading
function loadDashboardData() {
    updateDashboardStats();
    loadRecentServices();
    loadPaymentStatus();
}

// Update dashboard statistics with real data
async function updateDashboardStats() {
    if (!currentClient || !db) return;
    
    try {
        // Get real next service date from locations or service history
        await loadRealNextService();
        
        // Update balance (keep as placeholder for now as requested)
        const balanceEl = document.getElementById('dashboard-balance');
        const pendingInvoicesEl = document.getElementById('dashboard-pending-invoices');
        if (balanceEl) {
            balanceEl.textContent = '$0.00'; // Placeholder as requested
            if (pendingInvoicesEl) {
                pendingInvoicesEl.textContent = '0 pending invoices'; // Placeholder as requested
            }
        }
        
        // Get real service type from client's locations
        await loadRealServiceType();
        
        // Get real jobs completed count
        await loadRealJobsCompleted();
        
    } catch (error) {
        console.error("CLIENT: Error updating dashboard stats:", error);
    }
}

// Load real next service from client's locations
async function loadRealNextService() {
    if (!currentClient || !currentClient.id) {
        console.log("CLIENT: No valid client ID for loading next service");
        const nextServiceEl = document.getElementById('dashboard-next-service');
        const nextServiceEmployeeEl = document.getElementById('dashboard-next-service-employee');
        if (nextServiceEl) nextServiceEl.textContent = 'Contact us to schedule';
        if (nextServiceEmployeeEl) nextServiceEmployeeEl.textContent = 'No client profile';
        return;
    }
    
    try {
        const snapshot = await db.collection('locations')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', true)
            .orderBy('nextServiceDate', 'asc')
            .limit(1)
            .get();
        
        const nextServiceEl = document.getElementById('dashboard-next-service');
        const nextServiceEmployeeEl = document.getElementById('dashboard-next-service-employee');
        
        if (!snapshot.empty) {
            const locationData = snapshot.docs[0].data();
            const nextDate = locationData.nextServiceDate;
            
            if (nextDate && nextDate.toDate) {
                const dateStr = nextDate.toDate().toLocaleDateString();
                const timeStr = nextDate.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                if (nextServiceEl) nextServiceEl.textContent = `${dateStr} at ${timeStr}`;
                if (nextServiceEmployeeEl) nextServiceEmployeeEl.textContent = 'Staff assignment pending';
            } else {
                if (nextServiceEl) nextServiceEl.textContent = 'Contact us to schedule';
                if (nextServiceEmployeeEl) nextServiceEmployeeEl.textContent = 'No upcoming service';
            }
        } else {
            if (nextServiceEl) nextServiceEl.textContent = 'Contact us to schedule';
            if (nextServiceEmployeeEl) nextServiceEmployeeEl.textContent = 'No locations found';
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading next service:", error);
        const nextServiceEl = document.getElementById('dashboard-next-service');
        if (nextServiceEl) nextServiceEl.textContent = 'Contact us to schedule';
    }
}

// Load real service type from client's active service agreement
async function loadRealServiceType() {
    if (!currentClient || !currentClient.id) {
        console.log("CLIENT: No valid client ID for loading service type");
        const serviceTypeEl = document.getElementById('dashboard-service-type');
        if (serviceTypeEl) serviceTypeEl.textContent = 'No active service';
        return;
    }
    
    const serviceTypeEl = document.getElementById('dashboard-service-type');
    
    // Use service agreement data if available
    if (currentClient.serviceAgreement) {
        const agreement = currentClient.serviceAgreement;
        let serviceDescription = '';
        
        if (agreement.includedServices && agreement.includedServices.length > 0) {
            serviceDescription = agreement.includedServices.map(service => {
                return service.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }).join(', ');
        } else {
            serviceDescription = 'Standard Cleaning';
        }
        
        // Add frequency information
        if (agreement.frequency) {
            const frequencyMap = {
                'weekly': 'Weekly',
                'bi-weekly': 'Bi-Weekly',
                'monthly': 'Monthly',
                'one-time': 'One-Time'
            };
            serviceDescription += ` (${frequencyMap[agreement.frequency] || agreement.frequency})`;
        }
        
        if (serviceTypeEl) serviceTypeEl.textContent = serviceDescription;
        console.log("CLIENT: Service type loaded from agreement:", serviceDescription);
        return;
    }
    
    // Fallback to checking locations if no service agreement
    try {
        const snapshot = await db.collection('locations')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', true)
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            const locationData = snapshot.docs[0].data();
            const serviceType = locationData.serviceType || 'Standard Cleaning';
            if (serviceTypeEl) serviceTypeEl.textContent = serviceType;
        } else {
            if (serviceTypeEl) serviceTypeEl.textContent = 'No active service agreement';
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading service type:", error);
        if (serviceTypeEl) serviceTypeEl.textContent = 'Contact support for service details';
    }
}

// Load real jobs completed count
async function loadRealJobsCompleted() {
    if (!currentClient || !currentClient.id) {
        console.log("CLIENT: No valid client ID for loading jobs completed");
        const jobsCompletedEl = document.getElementById('dashboard-jobs-completed');
        if (jobsCompletedEl) jobsCompletedEl.textContent = '0';
        return;
    }
    
    try {
        const thisMonth = new Date();
        const startOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
        
        const snapshot = await db.collection('serviceHistory')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', 'Complete')
            .where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(startOfMonth))
            .get();
        
        const jobsCompletedEl = document.getElementById('dashboard-jobs-completed');
        if (jobsCompletedEl) {
            jobsCompletedEl.textContent = snapshot.size;
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading jobs completed:", error);
        const jobsCompletedEl = document.getElementById('dashboard-jobs-completed');
        if (jobsCompletedEl) jobsCompletedEl.textContent = '0';
    }
}

// Load real recent services for dashboard
async function loadRecentServices() {
    const loadingEl = document.getElementById('recent-services-loading');
    const containerEl = document.getElementById('recent-services-container');
    const noDataEl = document.getElementById('no-recent-services');
    
    if (!loadingEl || !containerEl || !noDataEl || !db) return;
    
    if (!currentClient || !currentClient.id) {
        console.log("CLIENT: No valid client ID for loading recent services");
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        return;
    }
    
    try {
        const snapshot = await db.collection('serviceHistory')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', 'Complete')
            .orderBy('serviceDate', 'desc')
            .limit(3)
            .get();
        
        loadingEl.classList.add('hidden');
        
        if (!snapshot.empty) {
            const recentServices = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                recentServices.push({
                    date: data.serviceDate ? data.serviceDate.toDate().toLocaleDateString() : 'Unknown Date',
                    employee: getEmployeeNames(data.employeeAssignments || []),
                    status: data.status || 'Complete'
                });
            });
            
            containerEl.innerHTML = recentServices.map(service => `
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-medium">${service.date}</div>
                        <div class="text-sm text-muted-foreground">Completed by ${service.employee}</div>
                    </div>
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ${service.status}
                    </span>
                </div>
            `).join('');
            containerEl.classList.remove('hidden');
        } else {
            noDataEl.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading recent services:", error);
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
    }
}

// Load payment status for dashboard
function loadPaymentStatus() {
    const loadingEl = document.getElementById('payment-status-loading');
    const containerEl = document.getElementById('payment-status-container');
    const allPaidEl = document.getElementById('all-paid-message');
    
    if (!loadingEl || !containerEl || !allPaidEl) return;
    
    // Simulate loading
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        // Check if there's outstanding balance
        const hasOutstanding = currentClient && currentClient.balance > 0;
        
        if (hasOutstanding) {
            containerEl.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-medium">Invoice #${Math.floor(Math.random() * 10000)}</div>
                        <div class="text-sm text-muted-foreground">Due ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-medium">$${currentClient.balance.toFixed(2)}</div>
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            PENDING
                        </span>
                    </div>
                </div>
            `;
            containerEl.classList.remove('hidden');
        } else {
            allPaidEl.classList.remove('hidden');
        }
    }, 1200);
}

// Load real services data
async function loadServicesData() {
    if (!currentClient || !db) return;
    
    try {
        // Load real contract details from client's locations
        await loadRealContractDetails();
        
        // Load service sections
        loadInProgressServices();
        loadUpcomingServices();
        loadServiceHistory();
        
    } catch (error) {
        console.error("CLIENT: Error loading services data:", error);
    }
}

// Load real contract details from service agreement and locations
async function loadRealContractDetails() {
    if (!currentClient || !currentClient.id) {
        console.log("CLIENT: No valid client ID for loading contract details");
        document.getElementById('contract-service-type').textContent = 'No active service';
        document.getElementById('contract-location').textContent = 'No client profile';
        document.getElementById('contract-next-service').textContent = 'Contact us to set up service';
        return;
    }
    
    const serviceTypeEl = document.getElementById('contract-service-type');
    const locationEl = document.getElementById('contract-location');
    const nextServiceEl = document.getElementById('contract-next-service');
    
    try {
        // Load service type from service agreement if available
        if (currentClient.serviceAgreement && serviceTypeEl) {
            const agreement = currentClient.serviceAgreement;
            let serviceDescription = '';
            
            if (agreement.includedServices && agreement.includedServices.length > 0) {
                serviceDescription = agreement.includedServices.map(service => {
                    return service.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }).join(', ');
            } else {
                serviceDescription = 'Standard Cleaning';
            }
            
            // Add frequency information
            if (agreement.frequency) {
                const frequencyMap = {
                    'weekly': 'Weekly',
                    'bi-weekly': 'Bi-Weekly', 
                    'monthly': 'Monthly',
                    'one-time': 'One-Time'
                };
                serviceDescription += ` (${frequencyMap[agreement.frequency] || agreement.frequency})`;
            }
            
            serviceTypeEl.textContent = serviceDescription;
            
            // Update service includes section with real data
            updateServiceIncludesSection(agreement);
        }
        
        // Load locations data
        const snapshot = await db.collection('locations')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', true)
            .get();
        
        if (!snapshot.empty) {
            const locations = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                locations.push({
                    name: data.locationName || 'Unnamed Location',
                    address: data.address || 'No address',
                    serviceType: data.serviceType || 'Standard Cleaning',
                    nextService: data.nextServiceDate
                });
            });
            
            // Update location information
            if (locationEl) {
                if (locations.length === 1) {
                    locationEl.textContent = locations[0].name;
                } else {
                    locationEl.textContent = `${locations.length} locations`;
                }
            }
            
            // Update next service date
            if (nextServiceEl) {
                // First try to get next service from upcoming scheduled services
                await loadNextScheduledService(nextServiceEl);
            }
            
            // Fallback to service type from locations if no agreement
            if (!currentClient.serviceAgreement && serviceTypeEl) {
                const serviceTypes = [...new Set(locations.map(loc => loc.serviceType))];
                serviceTypeEl.textContent = serviceTypes.join(', ');
            }
            
        } else {
            // No locations found
            if (!currentClient.serviceAgreement && serviceTypeEl) {
                serviceTypeEl.textContent = 'No active service agreement';
            }
            if (locationEl) locationEl.textContent = 'No locations found';
            if (nextServiceEl) nextServiceEl.textContent = 'Contact us to set up service';
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading contract details:", error);
        if (serviceTypeEl) serviceTypeEl.textContent = 'Contact support for service details';
        if (locationEl) locationEl.textContent = 'Error loading locations';
        if (nextServiceEl) nextServiceEl.textContent = 'Error loading next service';
    }
}

// Update the service includes section with real agreement data
function updateServiceIncludesSection(agreement) {
    // Find the service includes section
    const serviceIncludesContainer = document.querySelector('.card-content .space-y-1');
    if (!serviceIncludesContainer || !agreement.includedServices) return;
    
    // Clear existing static content
    serviceIncludesContainer.innerHTML = '';
    
    // Add real included services
    agreement.includedServices.forEach(service => {
        const serviceName = service.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const li = document.createElement('li');
        li.className = 'flex items-center gap-2';
        li.innerHTML = `
            <i data-lucide="check-circle" class="h-3 w-3 text-green-600"></i>
            ${serviceName}
        `;
        serviceIncludesContainer.appendChild(li);
    });
    
    // Add special instructions if available
    if (agreement.specialInstructions) {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-2 mt-3 pt-3 border-t';
        li.innerHTML = `
            <i data-lucide="info" class="h-3 w-3 text-blue-600 mt-0.5"></i>
            <div class="text-xs">
                <span class="font-medium text-blue-800">Special Instructions:</span>
                <br>
                <span class="text-muted-foreground">${agreement.specialInstructions}</span>
            </div>
        `;
        serviceIncludesContainer.appendChild(li);
    }
    
    // Re-initialize Lucide icons for new content
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// Load next scheduled service from serviceHistory
async function loadNextScheduledService(nextServiceEl) {
    if (!currentClient || !currentClient.id || !db) return;
    
    try {
        const now = firebase.firestore.Timestamp.now();
        const snapshot = await db.collection('serviceHistory')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', 'Scheduled')
            .where('serviceDate', '>', now)
            .orderBy('serviceDate', 'asc')
            .limit(1)
            .get();
        
        if (!snapshot.empty) {
            const serviceData = snapshot.docs[0].data();
            const serviceDate = serviceData.serviceDate.toDate();
            const dateStr = serviceDate.toLocaleDateString();
            const timeStr = serviceDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            nextServiceEl.textContent = `${dateStr} at ${timeStr}`;
        } else {
            nextServiceEl.textContent = 'Contact us to schedule';
        }
    } catch (error) {
        console.error("CLIENT: Error loading next scheduled service:", error);
        nextServiceEl.textContent = 'Contact us to schedule';
    }
}

// Load in-progress services
function loadInProgressServices() {
    const loadingEl = document.getElementById('in-progress-loading');
    const containerEl = document.getElementById('in-progress-container');
    const noDataEl = document.getElementById('no-in-progress');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        // For now, show no in-progress services
        noDataEl.classList.remove('hidden');
    }, 800);
}

// Load upcoming services
function loadUpcomingServices() {
    const loadingEl = document.getElementById('upcoming-loading');
    const containerEl = document.getElementById('upcoming-container');
    const noDataEl = document.getElementById('no-upcoming');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        if (currentClient && currentClient.nextService) {
            containerEl.innerHTML = `
                <div class="border rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Scheduled
                        </span>
                        <span class="text-sm text-muted-foreground">${currentClient.nextService}</span>
                    </div>
                    <div class="space-y-2 text-sm">
                        <div class="flex items-center gap-2">
                            <i data-lucide="user" class="h-4 w-4 text-muted-foreground"></i>
                            Assigning staff...
                        </div>
                        <div class="flex items-center gap-2">
                            <i data-lucide="map-pin" class="h-4 w-4 text-muted-foreground"></i>
                            ${currentClient.serviceAddress}
                        </div>
                    </div>
                </div>
            `;
            containerEl.classList.remove('hidden');
        } else {
            noDataEl.classList.remove('hidden');
        }
        
        // Re-initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 900);
}

// Helper function to count photos visible to client
async function countClientVisiblePhotos(locationId, serviceDate) {
    if (!db || !locationId || !serviceDate) return 0;
    
    try {
        const serviceDateObj = serviceDate.toDate ? serviceDate.toDate() : new Date(serviceDate);
        const startOfDay = new Date(serviceDateObj);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(serviceDateObj);
        endOfDay.setHours(23, 59, 59, 999);
        
        const snapshot = await db.collection('servicePhotos')
            .where('locationId', '==', locationId)
            .where('uploadedAt', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
            .where('uploadedAt', '<=', firebase.firestore.Timestamp.fromDate(endOfDay))
            .where('isClientVisible', '==', true)
            .get();
        
        return snapshot.size;
    } catch (error) {
        console.error("CLIENT: Error counting photos:", error);
        return 0;
    }
}

// Helper function to get employee names from assignments
function getEmployeeNames(assignments) {
    if (!assignments || assignments.length === 0) return 'Unknown Staff';
    return assignments.map(emp => emp.employeeName || 'Unknown').join(', ');
}

// Helper function to calculate tasks completed
function calculateTasksCompleted(serviceData) {
    // Estimate based on service type or default to reasonable number
    const serviceType = serviceData.serviceType || '';
    if (serviceType.toLowerCase().includes('deep')) return 8;
    if (serviceType.toLowerCase().includes('standard')) return 5;
    if (serviceType.toLowerCase().includes('basic')) return 3;
    return 4; // Default
}

// Helper function to calculate service duration  
function calculateServiceDuration(serviceData) {
    // For now, estimate based on service type
    // Later this could use actual clock-in/clock-out data
    const serviceType = serviceData.serviceType || '';
    if (serviceType.toLowerCase().includes('deep')) return '3-4 hours';
    if (serviceType.toLowerCase().includes('standard')) return '2-3 hours';
    return '2 hours';
}

// Helper function to format service start time
function formatServiceTime(serviceDate) {
    if (!serviceDate) return '9:00 AM';
    const date = serviceDate.toDate ? serviceDate.toDate() : new Date(serviceDate);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Load service history from Firebase
async function loadServiceHistory() {
    const loadingEl = document.getElementById('service-history-loading');
    const containerEl = document.getElementById('service-history-container');
    const noDataEl = document.getElementById('no-service-history');
    
    if (!db) {
        console.error("CLIENT: Firebase not initialized");
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        return;
    }
    
    try {
        console.log("CLIENT: Loading real service history from Firebase");
        
        // Query service history for the authenticated client only
        if (!currentClient || !currentClient.id) {
            console.log("CLIENT: No client profile available for filtering");
            loadingEl.classList.add('hidden');
            noDataEl.classList.remove('hidden');
            return;
        }
        
        // Get pagination settings
        const servicesPerPage = 10;
        const startAfter = window.lastServiceDoc || null;
        
        // Build query with pagination
        let query = db.collection('serviceHistory')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', 'Complete')
            .orderBy('serviceDate', 'desc')
            .limit(servicesPerPage);
        
        if (startAfter) {
            query = query.startAfter(startAfter);
        }
        
        const snapshot = await query.get();
        
        loadingEl.classList.add('hidden');
        
        if (snapshot.empty) {
            noDataEl.classList.remove('hidden');
            return;
        }
        
        const serviceHistory = [];
        const photoCountPromises = [];
        
        // Process each service record
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const serviceId = doc.id;
            
            // Count photos for this service (approved for client viewing)
            const photoCountPromise = countClientVisiblePhotos(data.locationId, data.serviceDate);
            photoCountPromises.push(photoCountPromise);
            
            const service = {
                id: serviceId,
                date: data.serviceDate ? data.serviceDate.toDate().toLocaleDateString() : 'Unknown Date',
                employee: getEmployeeNames(data.employeeAssignments || []),
                tasks: calculateTasksCompleted(data),
                photos: 0, // Will be filled by photo count promise
                duration: calculateServiceDuration(data),
                startTime: formatServiceTime(data.serviceDate),
                notes: data.adminNotes || '', // REAL ADMIN NOTES! 🎉
                location: data.locationName || 'Unknown Location',
                client: data.clientName || 'Unknown Client',
                serviceType: data.serviceType || 'Standard Cleaning',
                rawData: data // Store raw data for detailed view
            };
            
            serviceHistory.push(service);
        }
        
        // Wait for all photo counts
        const photoCounts = await Promise.all(photoCountPromises);
        serviceHistory.forEach((service, index) => {
            service.photos = photoCounts[index];
        });
        
        // Store service history globally for detail view
        window.clientServiceHistory = serviceHistory;
        
        // Store last document for pagination
        if (snapshot.docs.length > 0) {
            window.lastServiceDoc = snapshot.docs[snapshot.docs.length - 1];
        }
        
        // Add pagination controls
        addServiceHistoryPagination(snapshot.docs.length === servicesPerPage);
        
        if (serviceHistory.length > 0) {
            containerEl.innerHTML = serviceHistory.map(service => `
                <div class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer service-history-item" data-service-id="${service.id}">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-2">
                                <div class="font-medium text-lg">${service.date}</div>
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Completed
                                </span>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-2">
                                <div class="flex items-center gap-1">
                                    <i data-lucide="user" class="h-3 w-3"></i>
                                    ${service.employee}
                                </div>
                                <div class="flex items-center gap-1">
                                    <i data-lucide="check-square" class="h-3 w-3"></i>
                                    ${service.tasks} tasks
                                </div>
                                <div class="flex items-center gap-1">
                                    <i data-lucide="camera" class="h-3 w-3"></i>
                                    ${service.photos} photos
                                </div>
                                <div class="flex items-center gap-1">
                                    <i data-lucide="clock" class="h-3 w-3"></i>
                                    ${service.duration}
                                </div>
                            </div>
                            ${service.notes ? `<div class="text-sm text-blue-700 bg-blue-50 p-2 rounded-md"><i data-lucide="message-circle" class="h-3 w-3 inline mr-1"></i>Admin Notes Available</div>` : ''}
                        </div>
                        <div class="ml-4">
                            <i data-lucide="chevron-right" class="h-5 w-5 text-muted-foreground"></i>
                        </div>
                    </div>
                </div>
            `).join('');
            containerEl.classList.remove('hidden');
            
            // Add click listeners for service history items
            document.querySelectorAll('.service-history-item').forEach(item => {
                item.addEventListener('click', () => {
                    const serviceId = item.dataset.serviceId;
                    showServiceDetail(serviceId);
                });
            });
        } else {
            noDataEl.classList.remove('hidden');
        }
        
        // Re-initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading service history:", error);
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
    }
}

// Add pagination controls to service history
function addServiceHistoryPagination(hasMore) {
    const containerEl = document.getElementById('service-history-container');
    if (!containerEl) return;
    
    // Create pagination container if it doesn't exist
    let paginationEl = document.getElementById('service-history-pagination');
    if (!paginationEl) {
        paginationEl = document.createElement('div');
        paginationEl.id = 'service-history-pagination';
        paginationEl.className = 'mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4';
        containerEl.parentNode.appendChild(paginationEl);
    }
    
    let paginationHTML = '<div class="flex items-center gap-3">';
    
    // Show "Load More" button if there are more services
    if (hasMore) {
        paginationHTML += `
            <button id="load-more-services" class="btn-primary">
                <i data-lucide="chevron-down" class="h-4 w-4 mr-2"></i>
                Load More Services
            </button>
        `;
    } else {
        paginationHTML += `
            <div class="text-sm text-muted-foreground">
                All services loaded
            </div>
        `;
    }
    
    paginationHTML += '</div>';
    
    // Add filter controls
    paginationHTML += `
        <div class="flex flex-col md:flex-row items-start md:items-center gap-3">
            <select id="location-filter" class="px-3 py-2 border border-border rounded-md text-sm min-w-[150px]">
                <option value="">All Locations</option>
            </select>
            <input type="date" id="date-filter" class="px-3 py-2 border border-border rounded-md text-sm" placeholder="Filter by date">
            <button id="clear-filters" class="btn-secondary text-sm">Clear Filters</button>
        </div>
    `;
    
    paginationEl.innerHTML = paginationHTML;
    
    // Add event listeners
    const loadMoreBtn = document.getElementById('load-more-services');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            loadServiceHistory(); // This will load the next page
        });
    }
    
    const locationFilter = document.getElementById('location-filter');
    const dateFilter = document.getElementById('date-filter');
    const clearFiltersBtn = document.getElementById('clear-filters');
    
    if (locationFilter) {
        loadLocationFilterOptions();
        locationFilter.addEventListener('change', filterServiceHistory);
    }
    
    if (dateFilter) {
        dateFilter.addEventListener('change', filterServiceHistory);
    }
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            locationFilter.value = '';
            dateFilter.value = '';
            window.lastServiceDoc = null; // Reset pagination
            window.clientServiceHistory = []; // Clear existing data
            const existingContainer = document.getElementById('service-history-container');
            if (existingContainer) existingContainer.innerHTML = '';
            loadServiceHistory();
        });
    }
    
    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load location options for filter
async function loadLocationFilterOptions() {
    if (!db || !currentClient) return;
    
    try {
        const snapshot = await db.collection('locations')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', true)
            .get();
        
        const locationFilter = document.getElementById('location-filter');
        if (!locationFilter) return;
        
        let options = '<option value="">All Locations</option>';
        snapshot.forEach(doc => {
            const data = doc.data();
            options += `<option value="${doc.id}">${data.locationName || 'Unnamed Location'}</option>`;
        });
        
        locationFilter.innerHTML = options;
        
    } catch (error) {
        console.error("CLIENT: Error loading location filter options:", error);
    }
}

// Filter service history based on selected filters
async function filterServiceHistory() {
    const locationFilter = document.getElementById('location-filter');
    const dateFilter = document.getElementById('date-filter');
    
    if (!locationFilter || !dateFilter || !db || !currentClient) return;
    
    const selectedLocation = locationFilter.value;
    const selectedDate = dateFilter.value;
    
    const loadingEl = document.getElementById('service-history-loading');
    const containerEl = document.getElementById('service-history-container');
    const noDataEl = document.getElementById('no-service-history');
    
    try {
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (containerEl) containerEl.innerHTML = '';
        if (noDataEl) noDataEl.classList.add('hidden');
        
        // Build filtered query
        let query = db.collection('serviceHistory')
            .where('clientProfileId', '==', currentClient.id)
            .where('status', '==', 'Complete');
        
        // Add location filter if selected
        if (selectedLocation) {
            query = query.where('locationId', '==', selectedLocation);
        }
        
        // Add date filter if selected
        if (selectedDate) {
            const filterDate = new Date(selectedDate);
            const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
            const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
            
            query = query.where('serviceDate', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
                         .where('serviceDate', '<=', firebase.firestore.Timestamp.fromDate(endOfDay));
        }
        
        const snapshot = await query.orderBy('serviceDate', 'desc').limit(20).get();
        
        if (loadingEl) loadingEl.classList.add('hidden');
        
        if (!snapshot.empty) {
            const serviceHistory = [];
            const photoCountPromises = [];
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                const serviceId = doc.id;
                
                const photoCountPromise = countClientVisiblePhotos(data.locationId, data.serviceDate);
                photoCountPromises.push(photoCountPromise);
                
                const service = {
                    id: serviceId,
                    date: data.serviceDate ? data.serviceDate.toDate().toLocaleDateString() : 'Unknown Date',
                    employee: getEmployeeNames(data.employeeAssignments || []),
                    tasks: calculateTasksCompleted(data),
                    photos: 0,
                    duration: calculateServiceDuration(data),
                    startTime: formatServiceTime(data.serviceDate),
                    notes: data.adminNotes || '',
                    location: data.locationName || 'Unknown Location',
                    client: data.clientName || 'Unknown Client',
                    serviceType: data.serviceType || 'Standard Cleaning',
                    rawData: data
                };
                
                serviceHistory.push(service);
            }
            
            const photoCounts = await Promise.all(photoCountPromises);
            serviceHistory.forEach((service, index) => {
                service.photos = photoCounts[index];
            });
            
            // Display filtered results
            if (containerEl) {
                containerEl.innerHTML = serviceHistory.map(service => `
                    <div class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer service-history-item" data-service-id="${service.id}">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="font-medium text-lg">${service.date}</div>
                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Completed
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-2">
                                    <div class="flex items-center gap-1">
                                        <i data-lucide="user" class="h-3 w-3"></i>
                                        ${service.employee}
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <i data-lucide="check-square" class="h-3 w-3"></i>
                                        ${service.tasks} tasks
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <i data-lucide="camera" class="h-3 w-3"></i>
                                        ${service.photos} photos
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <i data-lucide="clock" class="h-3 w-3"></i>
                                        ${service.duration}
                                    </div>
                                </div>
                                <div class="text-sm text-muted-foreground mb-1">
                                    <i data-lucide="map-pin" class="h-3 w-3 inline mr-1"></i>
                                    ${service.location}
                                </div>
                                ${service.notes ? `<div class="text-sm text-blue-700 bg-blue-50 p-2 rounded-md"><i data-lucide="message-circle" class="h-3 w-3 inline mr-1"></i>Admin Notes Available</div>` : ''}
                            </div>
                            <div class="ml-4">
                                <i data-lucide="chevron-right" class="h-5 w-5 text-muted-foreground"></i>
                            </div>
                        </div>
                    </div>
                `).join('');
                containerEl.classList.remove('hidden');
                
                // Add click listeners
                document.querySelectorAll('.service-history-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const serviceId = item.dataset.serviceId;
                        showServiceDetail(serviceId);
                    });
                });
            }
            
            window.clientServiceHistory = serviceHistory;
            
            // Update pagination for filtered results
            const paginationEl = document.getElementById('service-history-pagination');
            if (paginationEl) {
                paginationEl.innerHTML = `
                    <div class="text-sm text-muted-foreground">
                        Showing ${serviceHistory.length} filtered result${serviceHistory.length !== 1 ? 's' : ''}
                    </div>
                    <div class="flex items-center gap-3">
                        <select id="location-filter" class="px-3 py-2 border border-border rounded-md text-sm">
                            <option value="">All Locations</option>
                        </select>
                        <input type="date" id="date-filter" class="px-3 py-2 border border-border rounded-md text-sm" value="${selectedDate || ''}">
                        <button id="clear-filters" class="btn-secondary text-sm">Clear Filters</button>
                    </div>
                `;
                
                // Re-add event listeners for filters
                const newLocationFilter = document.getElementById('location-filter');
                const newDateFilter = document.getElementById('date-filter');
                const newClearBtn = document.getElementById('clear-filters');
                
                if (newLocationFilter) {
                    loadLocationFilterOptions();
                    newLocationFilter.value = selectedLocation;
                    newLocationFilter.addEventListener('change', filterServiceHistory);
                }
                if (newDateFilter) newDateFilter.addEventListener('change', filterServiceHistory);
                if (newClearBtn) {
                    newClearBtn.addEventListener('click', () => {
                        window.lastServiceDoc = null;
                        window.clientServiceHistory = [];
                        const container = document.getElementById('service-history-container');
                        if (container) container.innerHTML = '';
                        loadServiceHistory();
                    });
                }
            }
            
        } else {
            if (noDataEl) noDataEl.classList.remove('hidden');
        }
        
        // Re-initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
    } catch (error) {
        console.error("CLIENT: Error filtering service history:", error);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (noDataEl) noDataEl.classList.remove('hidden');
    }
}

// Load invoices data (Coming Soon)
function loadInvoicesData() {
    // Invoices are now showing "Coming Soon" message
    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load photos data (service selection)
function loadPhotosData() {
    loadServiceDates();
}

// Load service dates for photo view
function loadServiceDates() {
    const loadingEl = document.getElementById('service-dates-loading');
    const gridEl = document.getElementById('service-dates-grid');
    const noDataEl = document.getElementById('no-service-dates');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        // Use the same service history data
        const services = window.clientServiceHistory || [];
        
        if (services.length > 0) {
            gridEl.innerHTML = services.map(service => `
                <div class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer service-date-card" data-service-id="${service.id}">
                    <div class="text-center">
                        <div class="text-lg font-semibold mb-2">${service.date}</div>
                        <div class="text-sm text-muted-foreground mb-3">
                            <div>${service.employee}</div>
                            <div>${service.duration} • ${service.tasks} tasks</div>
                        </div>
                        <div class="flex items-center justify-center gap-2 text-sm">
                            <div class="flex items-center gap-1 text-blue-600">
                                <i data-lucide="camera" class="h-3 w-3"></i>
                                ${service.photos} photos
                            </div>
                            ${service.notes ? `
                                <div class="flex items-center gap-1 text-green-600">
                                    <i data-lucide="message-square" class="h-3 w-3"></i>
                                    Notes
                                </div>
                            ` : ''}
                        </div>
                        <div class="mt-3">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                View Details
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
            gridEl.classList.remove('hidden');
            
            // Add click listeners
            document.querySelectorAll('.service-date-card').forEach(card => {
                card.addEventListener('click', () => {
                    const serviceId = card.dataset.serviceId;
                    showServiceDetail(serviceId);
                });
            });
        } else {
            noDataEl.classList.remove('hidden');
        }
        
        // Re-initialize icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 800);
}

// Show service detail view
function showServiceDetail(serviceId) {
    const service = window.clientServiceHistory?.find(s => s.id === serviceId);
    if (!service) return;
    
    // Hide service selection view and show detail view
    document.getElementById('service-selection-view').classList.add('hidden');
    document.getElementById('service-detail-view').classList.remove('hidden');
    
    // Update service detail information
    document.getElementById('service-detail-title').textContent = `Service - ${service.date}`;
    document.getElementById('service-detail-subtitle').textContent = `Completed by ${service.employee}`;
    
    document.getElementById('detail-service-date').textContent = service.date;
    document.getElementById('detail-employee-name').textContent = service.employee;
    document.getElementById('detail-start-time').textContent = service.startTime;
    document.getElementById('detail-duration').textContent = service.duration;
    document.getElementById('detail-tasks-completed').textContent = `${service.tasks} tasks`;
    document.getElementById('detail-photos-count').textContent = `${service.photos} photos`;
    
    // Show admin notes if available
    const notesCard = document.getElementById('admin-notes-card');
    const notesContent = document.getElementById('admin-notes-content');
    if (service.notes) {
        notesContent.textContent = service.notes;
        notesCard.classList.remove('hidden');
    } else {
        notesCard.classList.add('hidden');
    }
    
    // Load service photos
    loadServicePhotos(service);
    
    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load real photos for specific service from Firebase
async function loadServicePhotos(service) {
    const loadingEl = document.getElementById('service-photos-loading');
    const gridEl = document.getElementById('service-photos-grid');
    const noDataEl = document.getElementById('no-service-photos');
    
    if (!db || !service.rawData) {
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        return;
    }
    
    try {
        console.log("CLIENT: Loading real service photos from Firebase");
        
        const serviceData = service.rawData;
        const serviceDateObj = serviceData.serviceDate.toDate();
        const startOfDay = new Date(serviceDateObj);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(serviceDateObj);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Query photos for this service date and location that are approved for client viewing
        const snapshot = await db.collection('servicePhotos')
            .where('locationId', '==', serviceData.locationId)
            .where('uploadedAt', '>=', firebase.firestore.Timestamp.fromDate(startOfDay))
            .where('uploadedAt', '<=', firebase.firestore.Timestamp.fromDate(endOfDay))
            .where('isClientVisible', '==', true)
            .orderBy('uploadedAt', 'desc')
            .get();
        
        loadingEl.classList.add('hidden');
        
        if (!snapshot.empty) {
            const photos = [];
            snapshot.forEach(doc => {
                const photoData = doc.data();
                photos.push({
                    id: doc.id,
                    url: photoData.photoUrl,
                    caption: photoData.notes || `Service Photo`,
                    timestamp: photoData.uploadedAt ? photoData.uploadedAt.toDate().toLocaleString() : 'Unknown time',
                    employee: photoData.employeeName || 'Staff'
                });
            });
            
            gridEl.innerHTML = photos.map(photo => `
                <div class="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <img src="${photo.url}" alt="${photo.caption}" class="w-full h-48 object-cover cursor-pointer" onclick="viewPhotoFullscreen('${photo.url}', '${photo.caption}')">
                    <div class="p-3">
                        <div class="text-sm font-medium">${photo.caption}</div>
                        <div class="text-xs text-muted-foreground">
                            <div>📸 ${photo.employee}</div>
                            <div>🕒 ${photo.timestamp}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            gridEl.classList.remove('hidden');
            
            console.log(`CLIENT: Loaded ${photos.length} approved photos for service`);
        } else {
            noDataEl.classList.remove('hidden');
            console.log("CLIENT: No approved photos found for this service");
        }
        
    } catch (error) {
        console.error("CLIENT: Error loading service photos:", error);
        loadingEl.classList.add('hidden');
        noDataEl.classList.remove('hidden');
    }
}

// View photo in fullscreen (placeholder function)
function viewPhotoFullscreen(url, caption) {
    alert(`Would open fullscreen view for: ${caption}\nURL: ${url}\n\n(Fullscreen photo viewer coming soon!)`);
}

// Back to service list
function setupServiceDetailNavigation() {
    const backBtn = document.getElementById('back-to-service-list');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            document.getElementById('service-detail-view').classList.add('hidden');
            document.getElementById('service-selection-view').classList.remove('hidden');
        });
    }
}

// Load profile data
function loadProfileData() {
    if (!currentClient) return;
    
    // Update profile display
    document.getElementById('display-company').textContent = currentClient.company || 'Loading...';
    document.getElementById('display-name').textContent = currentClient.name || 'Loading...';
    document.getElementById('display-phone').textContent = currentClient.phone || 'Loading...';
    document.getElementById('display-email').textContent = currentClient.email || 'Loading...';
    
    loadActiveLocations();
}

// Load active locations
function loadActiveLocations() {
    const loadingEl = document.getElementById('locations-loading');
    const listEl = document.getElementById('locations-list');
    const noDataEl = document.getElementById('no-locations');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        if (currentClient && currentClient.serviceAddress) {
            listEl.innerHTML = `
                <div class="border rounded-lg p-4">
                    <div class="flex items-start justify-between">
                        <div>
                            <h3 class="font-medium">${currentClient.serviceAddress}</h3>
                            <div class="text-sm text-muted-foreground mt-1">
                                <div>Service Type: ${currentClient.contractType}</div>
                                <div>Next Service: ${currentClient.nextService || 'TBD'}</div>
                            </div>
                        </div>
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                        </span>
                    </div>
                </div>
            `;
            listEl.classList.remove('hidden');
        } else {
            noDataEl.classList.remove('hidden');
        }
    }, 800);
}

// Setup navigation
function setupNavigation() {
    const navItems = [
        { id: 'nav-dashboard', view: 'dashboard' },
        { id: 'nav-services', view: 'services' },
        { id: 'nav-invoices', view: 'invoices' },
        { id: 'nav-photos', view: 'photos' },
        { id: 'nav-profile', view: 'profile' }
    ];
    
    navItems.forEach(({ id, view }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', () => showView(view));
        }
    });
    
    // Mobile sidebar functionality
    document.getElementById('mobile-menu-button')?.addEventListener('click', toggleMobileSidebar);
    document.getElementById('sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
    
    // Close mobile sidebar on window resize if screen becomes larger
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMobileSidebar();
        }
    });
}

// Setup profile management
function setupProfileManagement() {
    const showEditBtn = document.getElementById('show-edit-btn');
    const showPasswordBtn = document.getElementById('show-password-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const cancelPasswordBtn = document.getElementById('cancel-password-btn');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    
    const profileView = document.getElementById('profile-view');
    const profileEdit = document.getElementById('profile-edit');
    const passwordEdit = document.getElementById('password-edit');
    
    if (showEditBtn) {
        showEditBtn.addEventListener('click', () => {
            profileView.classList.add('hidden');
            profileEdit.classList.remove('hidden');
            passwordEdit.classList.add('hidden');
            
            // Populate edit form
            document.getElementById('edit-name-input').value = currentClient?.name || '';
            document.getElementById('edit-phone-input').value = currentClient?.phone || '';
        });
    }
    
    if (showPasswordBtn) {
        showPasswordBtn.addEventListener('click', () => {
            profileView.classList.add('hidden');
            profileEdit.classList.add('hidden');
            passwordEdit.classList.remove('hidden');
        });
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            profileView.classList.remove('hidden');
            profileEdit.classList.add('hidden');
            passwordEdit.classList.add('hidden');
        });
    }
    
    if (cancelPasswordBtn) {
        cancelPasswordBtn.addEventListener('click', () => {
            profileView.classList.remove('hidden');
            profileEdit.classList.add('hidden');
            passwordEdit.classList.add('hidden');
        });
    }
    
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            // Simulate saving profile
            const messageEl = document.getElementById('edit-profile-msg');
            messageEl.textContent = 'Profile updated successfully! (Feature coming soon)';
            messageEl.className = 'text-sm text-green-600';
            messageEl.classList.remove('hidden');
            
            setTimeout(() => {
                profileView.classList.remove('hidden');
                profileEdit.classList.add('hidden');
                passwordEdit.classList.add('hidden');
                messageEl.classList.add('hidden');
            }, 2000);
        });
    }
}

// Setup logout
function setupLogout() {
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                // Sign out from Firebase
                await firebase.auth().signOut();
                console.log('CLIENT: User signed out successfully');
                
                // Redirect to main login page
                window.location.href = '../index.html';
            } catch (error) {
                console.error('CLIENT: Error signing out:', error);
                // Still redirect even if signout fails
                window.location.href = '../index.html';
            }
        });
    }
}

// Update client name in sidebar
function updateClientName(name) {
    const sidebarName = document.getElementById('client-name-sidebar');
    if (sidebarName) {
        sidebarName.textContent = name;
    }
}

// Initialize client portal
function initializeClientPortal() {
    // Get current user info
    const user = firebase.auth().currentUser;
    if (!user) {
        console.log('CLIENT: No user found, redirecting to login');
        window.location.href = '../index.html';
        return;
    }
    
    // Simulate client data (replace with actual Firebase data)
    // In future: Query Firestore based on user.email or custom claims
    currentClient = {
        company: 'Downtown Office Complex',
        name: 'John Smith',
        phone: '(216) 555-0123',
        email: user.email || 'john.smith@downtownoffice.com',
        serviceAddress: '123 Main Street, Cleveland, OH 44115',
        contractType: 'Commercial Cleaning',
        nextService: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        balance: 450.00,
        pendingInvoices: 1
    };
    
    // Update welcome message and sidebar
    const welcomeEl = document.getElementById('welcome-message');
    if (welcomeEl) {
        welcomeEl.textContent = `Welcome, ${currentClient.company}!`;
    }
    updateClientName(currentClient.company);
    
    // Setup all functionality
    setupNavigation();
    setupProfileManagement();
    setupLogout();
    setupServiceDetailNavigation();
    
    // Load initial dashboard data
    loadDashboardData();
    
    // Hide loading and show content
    const loadingEl = document.getElementById('client-loading-message');
    const contentEl = document.getElementById('client-dashboard-content');
    
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    
    // Initialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication state
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('CLIENT: User authenticated:', user.email);
            // Initialize portal with user data
            initializeClientPortal();
        } else {
            console.log('CLIENT: No authenticated user, redirecting to login');
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

// Make functions globally available for button clicks
window.showView = showView; 
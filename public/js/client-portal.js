// Cleveland Clean Solutions - Client Portal JavaScript
// Modern sidebar navigation and dashboard functionality

let currentView = 'dashboard';
let currentClient = null;

// Navigation function
function showView(viewName) {
    console.log(`CLIENT: Switching to view: ${viewName}`);
    
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

// Update dashboard statistics
function updateDashboardStats() {
    if (!currentClient) return;
    
    // Update next service
    const nextServiceEl = document.getElementById('dashboard-next-service');
    const nextServiceEmployeeEl = document.getElementById('dashboard-next-service-employee');
    if (nextServiceEl) {
        nextServiceEl.textContent = currentClient.nextService || 'No scheduled service';
        if (nextServiceEmployeeEl) {
            nextServiceEmployeeEl.textContent = currentClient.nextService ? 'Assigning staff...' : 'Contact us to schedule';
        }
    }
    
    // Update balance
    const balanceEl = document.getElementById('dashboard-balance');
    const pendingInvoicesEl = document.getElementById('dashboard-pending-invoices');
    if (balanceEl) {
        balanceEl.textContent = `$${(currentClient.balance || 0).toFixed(2)}`;
        if (pendingInvoicesEl) {
            const pendingCount = currentClient.pendingInvoices || 0;
            pendingInvoicesEl.textContent = `${pendingCount} pending invoice${pendingCount !== 1 ? 's' : ''}`;
        }
    }
    
    // Update service type
    const serviceTypeEl = document.getElementById('dashboard-service-type');
    if (serviceTypeEl) {
        serviceTypeEl.textContent = currentClient.contractType || 'Standard Cleaning';
    }
    
    // Update jobs completed (placeholder)
    const jobsCompletedEl = document.getElementById('dashboard-jobs-completed');
    if (jobsCompletedEl) {
        jobsCompletedEl.textContent = Math.floor(Math.random() * 12) + 1; // Simulated
    }
}

// Load recent services for dashboard
function loadRecentServices() {
    const loadingEl = document.getElementById('recent-services-loading');
    const containerEl = document.getElementById('recent-services-container');
    const noDataEl = document.getElementById('no-recent-services');
    
    if (!loadingEl || !containerEl || !noDataEl) return;
    
    // Simulate loading
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        // Simulate some recent services
        const recentServices = [
            {
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                employee: 'Sarah Johnson',
                status: 'Completed'
            },
            {
                date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                employee: 'Mike Davis',
                status: 'Completed'
            }
        ];
        
        if (recentServices.length > 0) {
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
    }, 1000);
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

// Load services data
function loadServicesData() {
    if (!currentClient) return;
    
    // Update contract details
    document.getElementById('contract-service-type').textContent = currentClient.contractType || 'Standard Cleaning';
    document.getElementById('contract-location').textContent = currentClient.serviceAddress || 'Loading...';
    document.getElementById('contract-next-service').textContent = currentClient.nextService || 'TBD';
    
    // Load service sections
    loadInProgressServices();
    loadUpcomingServices();
    loadServiceHistory();
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

// Load service history 
function loadServiceHistory() {
    const loadingEl = document.getElementById('service-history-loading');
    const containerEl = document.getElementById('service-history-container');
    const noDataEl = document.getElementById('no-service-history');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        // Simulate service history with clickable items
        const serviceHistory = [
            {
                id: 'service-001',
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                employee: 'Sarah Johnson',
                tasks: 5,
                photos: 8,
                duration: '2.5 hours',
                startTime: '9:00 AM',
                notes: 'Service completed successfully. Restroom supplies were running low - restocked paper towels and soap dispensers. Client requested extra attention to lobby area which was completed.'
            },
            {
                id: 'service-002',
                date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                employee: 'Mike Davis',
                tasks: 4,
                photos: 5,
                duration: '2 hours',
                startTime: '10:30 AM',
                notes: 'Routine cleaning completed. Vacuum cleaner had minor issue but was resolved. All areas cleaned as requested.'
            },
            {
                id: 'service-003',
                date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                employee: 'Sarah Johnson',
                tasks: 6,
                photos: 12,
                duration: '3 hours',
                startTime: '8:30 AM',
                notes: 'Deep cleaning performed. Conference room required extra attention due to recent meeting. All glass surfaces polished and carpets professionally cleaned.'
            }
        ];
        
        // Store service history globally for detail view
        window.clientServiceHistory = serviceHistory;
        
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
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
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
    }, 1000);
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

// Load photos for specific service
function loadServicePhotos(service) {
    const loadingEl = document.getElementById('service-photos-loading');
    const gridEl = document.getElementById('service-photos-grid');
    const noDataEl = document.getElementById('no-service-photos');
    
    setTimeout(() => {
        loadingEl.classList.add('hidden');
        
        if (service.photos > 0) {
            // Generate simulated photos for demonstration
            const photos = Array.from({ length: service.photos }, (_, i) => ({
                id: `photo-${service.id}-${i + 1}`,
                url: `https://via.placeholder.com/300x200/4F46E5/FFFFFF?text=Photo+${i + 1}`,
                caption: `Service photo ${i + 1}`,
                timestamp: `${service.date} ${service.startTime}`
            }));
            
            gridEl.innerHTML = photos.map(photo => `
                <div class="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <img src="${photo.url}" alt="${photo.caption}" class="w-full h-48 object-cover cursor-pointer" onclick="viewPhotoFullscreen('${photo.url}', '${photo.caption}')">
                    <div class="p-3">
                        <div class="text-sm font-medium">${photo.caption}</div>
                        <div class="text-xs text-muted-foreground">${photo.timestamp}</div>
                    </div>
                </div>
            `).join('');
            gridEl.classList.remove('hidden');
        } else {
            noDataEl.classList.remove('hidden');
        }
    }, 600);
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
        logoutBtn.addEventListener('click', () => {
            // Simulate logout
            alert('Logout functionality coming soon!');
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
    // Simulate client data (replace with actual Firebase data)
    currentClient = {
        company: 'Downtown Office Complex',
        name: 'John Smith',
        phone: '(216) 555-0123',
        email: 'john.smith@downtownoffice.com',
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
    // Simulate authentication check
    setTimeout(initializeClientPortal, 1500);
});

// Make functions globally available for button clicks
window.showView = showView; 
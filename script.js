 const DEFAULT_FIREBASE_CONFIG = {
      apiKey: "AIzaSyB_Public_GuestHouse_App_Key_2026",
      authDomain: "edico-guesthouse-app.firebaseapp.com",
      databaseURL: "https://iddico-guest-house-management-default-rtdb.firebaseio.com/",
      projectId: "edico-guesthouse-app",
      storageBucket: "edico-guesthouse-app.appspot.com",
      messagingSenderId: "102938475612",
      appId: "1:102938475612:web:a1b2c3d4e5f67890"
    };

    let db = null;
    let activeRootRef = null;
    let syncKey = localStorage.getItem('edico_sync_key') || '***';
    let adminPassword = localStorage.getItem('edico_admin_pass') || 'admin123';
    let currentCurrency = localStorage.getItem('edico_currency') || 'GH₵';
    let houseName = localStorage.getItem('edico_house_name') || 'Edico Guest House';
    let logoData = localStorage.getItem('edico_app_logo') || '';
    let isDarkTheme = localStorage.getItem('edico_dark_theme') === 'true';
    let backupSchedule = localStorage.getItem('edico_backup_schedule') || 'none';
    let lastBackupTime = parseInt(localStorage.getItem('edico_last_backup_time') || '0');
    let pendingAdminAction = null;
    let pendingStaffOrAdminAction = null;
    let syncKeyVisible = false;

    let selectedRoomForCheckIn = null;
    let currentFilter = 'all';

    // Seed Data
    const seedRooms = {
      "room_101": { id: "room_101", number: 101, name: "Standard Room 101", price: 100, status: "available", amenities: ["AC", "Bathroom", "Wi-Fi"] },
     // "room_102": { id: "room_102", number: 102, name: "Standard Room 102", price: 120, status: "available", amenities: ["AC", "Bathroom", "Wi-Fi", "TV"] },
    //  "room_103": { id: "room_103", number: 103, name: "Deluxe Suite 103", price: 180, status: "available", amenities: ["AC", "Bathroom", "TV", "Wi-Fi", "Fridge"] },
     // "room_104": { id: "room_104", number: 104, name: "Executive Suite 104", price: 250, status: "available", amenities: ["AC", "Bathroom", "TV", "Wi-Fi", "Jacuzzi"] },
     // "room_105": { id: "room_105", number: 105, name: "Presidential Penthouse 105", price: 400, status: "available", amenities: ["AC", "Bathroom", "TV", "Wi-Fi", "Fridge", "Jacuzzi"] }
    };

    const seedStaff = {
      "s1": { id: "s1", name: "John Doe", role: "Front Desk Manager", phone: "0241234567", pin: "1234" },
      "s2": { id: "s2", name: "Mary Mensah", role: "Receptionist", phone: "0209876543", pin: "2345" },
      "s3": { id: "s3", name: "Samuel Osei", role: "Shift Supervisor", phone: "0551122334", pin: "3456" },
      "s4": { id: "s4", name: "Abena Appiah", role: "Evening Clerk", phone: "0275566778", pin: "4567" },
      "s5": { id: "s5", name: "Kwame Nkrumah", role: "Night Shift Operations", phone: "0509988776", pin: "5678" }
    };

    // State Holders
    let localRooms = JSON.parse(localStorage.getItem('edico_local_rooms')) || seedRooms;
    let localStaff = JSON.parse(localStorage.getItem('edico_local_staff')) || seedStaff;
    let activeShift = JSON.parse(localStorage.getItem('edico_local_shift')) || null;
    let finances = JSON.parse(localStorage.getItem('edico_local_finances')) || { cash: 0, momo: 0, total: 0 };
    let localTransactions = JSON.parse(localStorage.getItem('edico_local_transactions')) || [];
    let localNotifications = JSON.parse(localStorage.getItem('edico_local_notifs')) || [];
    let connectedSyncList = JSON.parse(localStorage.getItem('edico_connected_syncs')) || [syncKey];

    window.onload = function() {
      startClock();
      applyThemeState();
      
      renderRooms();
      renderStaff();
      renderShiftState();
      updateStats();
      renderTransactions();
      renderNotifications();
      loadSettings();
      renderConnectedSyncList();
      updateSyncKeyDisplay();

      initFirebase();

      document.addEventListener('click', function(e) {
        const notifWrapper = document.getElementById('notifWrapper');
        if (notifWrapper && !notifWrapper.contains(e.target)) {
          document.getElementById('notifDropdown').classList.remove('active');
        }
      });

      checkScheduledBackupAlert();
    };

    function startClock() {
      function updateTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const clockEl = document.getElementById('largeDigitalClock');
        const dateEl = document.getElementById('largeDigitalDate');
        if (clockEl) clockEl.innerText = timeStr;
        if (dateEl) dateEl.innerText = dateStr;
      }
      updateTime();
      setInterval(updateTime, 1000);
    }

    function unlockSystemMaster(e) {
      e.preventDefault();
      const inputPass = document.getElementById('gatePasswordInput').value;
      if (inputPass === adminPassword) {
        document.getElementById('masterAuthScreen').style.display = 'none';
        document.getElementById('gatePasswordInput').value = '';
      } else {
        showPopupModal("Authentication Failed", "Incorrect Admin Password!", null);
      }
    }

    function unlockSystemStaff(e) {
      e.preventDefault();
      const inputPin = document.getElementById('gateStaffPinInput').value.trim();
      const matchedStaff = Object.values(localStaff).find(s => s && s.pin === inputPin);
      
      if (matchedStaff) {
        activeShift = { staffId: matchedStaff.id, staffName: matchedStaff.name, role: matchedStaff.role, startTime: new Date().toLocaleTimeString() };
        saveLocalStorage();
        if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
          db.ref(`properties/${syncKey}/shift`).set(activeShift);
        }
        renderShiftState();
        renderStaff();
        addNotification(`Shift Started via Gate: ${matchedStaff.name}`);
        document.getElementById('masterAuthScreen').style.display = 'none';
        document.getElementById('gateStaffPinInput').value = '';
      } else {
        showPopupModal("Authentication Failed", "Invalid Staff Security PIN!", null);
      }
    }

    function logoutSystem() {
      document.getElementById('masterAuthScreen').style.display = 'flex';
      document.getElementById('gatePasswordInput').value = '';
      document.getElementById('gateStaffPinInput').value = '';
    }

    function toggleDarkTheme() {
      isDarkTheme = !isDarkTheme;
      localStorage.setItem('edico_dark_theme', isDarkTheme);
      applyThemeState();
    }

    function applyThemeState() {
      const themeIcon = document.getElementById('themeIcon');
      const themeBtnText = document.getElementById('themeBtnText');
      if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        if (themeIcon) themeIcon.className = "fa-solid fa-sun";
        if (themeBtnText) themeBtnText.innerText = "Light Mode";
      } else {
        document.body.classList.remove('dark-theme');
        if (themeIcon) themeIcon.className = "fa-solid fa-moon";
        if (themeBtnText) themeBtnText.innerText = "Dark Mode";
      }
    }

    function exportSystemBackup() {
      const backupData = {
        houseName,
        currentCurrency,
        rooms: localRooms,
        staff: localStaff,
        finances,
        transactions: localTransactions,
        notifications: localNotifications,
        exportDate: new Date().toISOString()
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Backup_${houseName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      lastBackupTime = Date.now();
      localStorage.setItem('edico_last_backup_time', lastBackupTime.toString());
      updateBackupScheduleStatusText();
      showPopupModal("Backup Successful", "System data backup file generated and downloaded.", null);
    }

    function importSystemBackup(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(event) {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported.rooms && imported.staff) {
            localRooms = imported.rooms;
            localStaff = imported.staff;
            if (imported.finances) finances = imported.finances;
            if (imported.transactions) localTransactions = imported.transactions;
            if (imported.notifications) localNotifications = imported.notifications;
            if (imported.houseName) {
              houseName = imported.houseName;
              localStorage.setItem('edico_house_name', houseName);
            }
            if (imported.currentCurrency) {
              currentCurrency = imported.currentCurrency;
              localStorage.setItem('edico_currency', currentCurrency);
            }

            saveLocalStorage();

            if (db && syncKey !== '****' && syncKey !== 'OFFLINE-LOCAL') {
              const rootRef = db.ref(`properties/${syncKey}`);
              rootRef.child('rooms').set(localRooms);
              rootRef.child('staff').set(localStaff);
              rootRef.child('finances').set(finances);
              rootRef.child('transactions').set(localTransactions);
              rootRef.child('notifications').set(localNotifications);
            }

            loadSettings();
            renderRooms();
            renderStaff();
            updateStats();
            renderTransactions();
            renderNotifications();

            showPopupModal("Import Successful", "Data successfully restored from backup file!", null);
          } else {
            showPopupModal("Import Error", "Invalid backup file format.", null);
          }
        } catch (err) {
          showPopupModal("Import Error", "Failed to parse JSON file.", null);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }

    function updateBackupScheduleSetting() {
      backupSchedule = document.getElementById('settingBackupSchedule').value;
      localStorage.setItem('edico_backup_schedule', backupSchedule);
      updateBackupScheduleStatusText();
    }

    function updateBackupScheduleStatusText() {
      const statusEl = document.getElementById('backupScheduleStatus');
      if (!statusEl) return;
      if (backupSchedule === 'none') {
        statusEl.innerText = "Backup Schedule Status: Disabled";
      } else {
        const lastStr = lastBackupTime ? new Date(lastBackupTime).toLocaleString() : 'Never';
        statusEl.innerText = `Backup Schedule: ${backupSchedule.toUpperCase()} (Last backup: ${lastStr})`;
      }
    }

    function checkScheduledBackupAlert() {
      if (backupSchedule === 'none') return;

      const now = Date.now();
      let requiredInterval = 0;

      if (backupSchedule === 'daily') requiredInterval = 24 * 60 * 60 * 1000;
      else if (backupSchedule === 'monthly') requiredInterval = 30 * 24 * 60 * 60 * 1000;
      else if (backupSchedule === 'yearly') requiredInterval = 365 * 24 * 60 * 60 * 1000;

      if (now - lastBackupTime >= requiredInterval) {
        setTimeout(() => {
          showPopupModal("Backup Due Reminder", `It is time for your scheduled (${backupSchedule.toUpperCase()}) system backup. Please export a backup copy to preserve your records.`, () => {
            exportSystemBackup();
          });
        }, 1200);
      }
    }

    function sanitizeObjectData(data) {
      if (!data) return null;
      const obj = {};
      if (Array.isArray(data)) {
        data.forEach((item, idx) => { if (item) obj[item.id || ('id_' + idx)] = item; });
      } else if (typeof data === 'object') {
        Object.keys(data).forEach(key => { if (data[key]) obj[key] = data[key]; });
      }
      return obj;
    }

    function initFirebase() {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(DEFAULT_FIREBASE_CONFIG);
        }
        db = firebase.database();
        document.getElementById('cloudStatusDot').classList.remove('offline');
        document.getElementById('cloudStatusText').innerText = "Cloud Synced";
        bindDatabaseListeners();
      } catch (err) {
        document.getElementById('cloudStatusDot').classList.add('offline');
        document.getElementById('cloudStatusText').innerText = "Local Mode";
      }
    }

    function bindDatabaseListeners() {
      updateSyncKeyDisplay();
      document.getElementById('syncKeyInput').value = syncKey;

      if (activeRootRef) activeRootRef.off();

      if (!syncKey || syncKey === '****' || syncKey === 'OFFLINE-LOCAL') {
        document.getElementById('cloudStatusDot').classList.add('offline');
        document.getElementById('cloudStatusText').innerText = "Disconnected";
        return;
      }

      activeRootRef = db.ref(`properties/${syncKey}`);

      activeRootRef.child('rooms').on('value', snapshot => {
        const val = snapshot.val();
        if (val === null) {
          activeRootRef.child('rooms').set(seedRooms);
          localRooms = seedRooms;
        } else {
          localRooms = sanitizeObjectData(val) || {};
        }
        saveLocalStorage();
        renderRooms();
        updateStats();
      });

      activeRootRef.child('staff').on('value', snapshot => {
        const val = snapshot.val();
        if (val === null) {
          activeRootRef.child('staff').set(seedStaff);
          localStaff = seedStaff;
        } else {
          localStaff = sanitizeObjectData(val) || {};
        }
        saveLocalStorage();
        renderStaff();
      });

      activeRootRef.child('shift').on('value', snapshot => {
        activeShift = snapshot.val();
        saveLocalStorage();
        renderShiftState();
        renderStaff();
      });

      activeRootRef.child('finances').on('value', snapshot => {
        finances = snapshot.val() || { cash: 0, momo: 0, total: 0 };
        saveLocalStorage();
        updateStats();
      });

      activeRootRef.child('transactions').on('value', snapshot => {
        const data = snapshot.val();
        localTransactions = data ? Object.values(data).filter(Boolean) : [];
        saveLocalStorage();
        renderTransactions();
      });

      activeRootRef.child('notifications').on('value', snapshot => {
        const data = snapshot.val();
        localNotifications = data ? Object.values(data).filter(Boolean) : [];
        renderNotifications();
      });

      activeRootRef.child('connected_keys').on('value', snapshot => {
        const remoteKeys = snapshot.val();
        if (remoteKeys && Array.isArray(remoteKeys)) {
          connectedSyncList = Array.from(new Set([...connectedSyncList, ...remoteKeys]));
          saveLocalStorage();
          renderConnectedSyncList();
        }
      });
    }

    function saveLocalStorage() {
      localStorage.setItem('edico_local_rooms', JSON.stringify(localRooms));
      localStorage.setItem('edico_local_staff', JSON.stringify(localStaff));
      localStorage.setItem('edico_local_shift', JSON.stringify(activeShift));
      localStorage.setItem('edico_local_finances', JSON.stringify(finances));
      localStorage.setItem('edico_local_transactions', JSON.stringify(localTransactions));
      localStorage.setItem('edico_local_notifs', JSON.stringify(localNotifications));
      localStorage.setItem('edico_connected_syncs', JSON.stringify(connectedSyncList));
    }

    function toggleSyncKeyVisibility() {
      if (syncKeyVisible) {
        syncKeyVisible = false;
        updateSyncKeyDisplay();
      } else {
        promptAdminAuth('revealSyncKey');
      }
    }

    function updateSyncKeyDisplay() {
      const el = document.getElementById('headerSyncKey');
      const icon = document.getElementById('syncKeyEyeIcon');
      if (!el) return;
      if (syncKeyVisible) {
        el.innerText = syncKey;
        if (icon) icon.className = "fa-solid fa-eye-slash text-muted";
      } else {
        el.innerText = "••••••••";
        if (icon) icon.className = "fa-solid fa-eye text-muted";
      }
    }

    function addNotification(message) {
      const notif = {
        id: Date.now().toString(),
        message: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false
      };

      localNotifications.unshift(notif);
      if (db && syncKey !== '****' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/notifications`).set(localNotifications);
      } else {
        saveLocalStorage();
      }
      renderNotifications();
    }

    function renderNotifications() {
      const list = document.getElementById('notifList');
      const badge = document.getElementById('notifBadge');
      if (!list) return;

      const unreadCount = localNotifications.filter(n => n && !n.read).length;
      if (unreadCount > 0) {
        badge.innerText = unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }

      if (!localNotifications.length) {
        list.innerHTML = '<div class="notif-item" style="text-align:center; color:var(--text-muted);">No activity recorded yet.</div>';
        return;
      }

      list.innerHTML = '';
      localNotifications.forEach((n, idx) => {
        if (!n) return;
        const item = document.createElement('div');
        item.className = `notif-item ${!n.read ? 'unread' : ''}`;
        item.onclick = () => markNotificationRead(idx);
        item.innerHTML = `<div>${n.message}</div><span class="notif-time">${n.time}</span>`;
        list.appendChild(item);
      });
    }

    function toggleNotifications(e) {
      if (e) e.stopPropagation();
      document.getElementById('notifDropdown').classList.toggle('active');
    }

    function markNotificationRead(index) {
      if (localNotifications[index]) {
        localNotifications[index].read = true;
        if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') db.ref(`properties/${syncKey}/notifications`).set(localNotifications);
        else saveLocalStorage();
        renderNotifications();
      }
    }

    function markAllNotificationsRead() {
      localNotifications.forEach(n => { if (n) n.read = true; });
      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') db.ref(`properties/${syncKey}/notifications`).set(localNotifications);
      else saveLocalStorage();
      renderNotifications();
    }

    function showPopupModal(title, message, onProceed) {
      document.getElementById('popupModalTitle').innerHTML = `<i class="fa-solid fa-circle-info"></i> ${title}`;
      document.getElementById('popupModalMessage').innerText = message;
      
      const proceedBtn = document.getElementById('popupModalProceedBtn');
      const newBtn = proceedBtn.cloneNode(true);
      proceedBtn.parentNode.replaceChild(newBtn, proceedBtn);
      
      newBtn.onclick = function() {
        closeModal('popupModal');
        if (onProceed) onProceed();
      };
      
      document.getElementById('popupModal').classList.add('active');
    }

    function promptAdminAuth(action, payload = null) {
      pendingAdminAction = { action, payload };
      document.getElementById('adminAuthPasswordInput').value = '';
      document.getElementById('adminAuthModal').classList.add('active');
    }

    function verifyAdminAuth() {
      const pass = document.getElementById('adminAuthPasswordInput').value;
      if (pass !== adminPassword) return showPopupModal("Authentication Failed", "Invalid Admin Password!", null);

      closeModal('adminAuthModal');
      if (!pendingAdminAction) return;

      const { action, payload } = pendingAdminAction;
      if (action === 'addRoom') openAddRoomModal();
      else if (action === 'editRoom') openEditRoomModal(payload);
      else if (action === 'deleteRoom') deleteRoom(payload);
      else if (action === 'addStaff') openAddStaffModal();
      else if (action === 'editStaff') openEditStaffModal(payload);
      else if (action === 'deleteStaff') deleteStaff(payload);
      else if (action === 'settings') switchTab('settingsTab', document.querySelectorAll('.nav-btn')[3]);
      else if (action === 'connectSync') connectSyncKey(payload);
      else if (action === 'disconnectSync') disconnectSyncKey();
      else if (action === 'toggleMaintenance') toggleRoomMaintenance(payload);
      else if (action === 'revealSyncKey') {
        syncKeyVisible = true;
        updateSyncKeyDisplay();
      } else if (action === 'removeSyncKey') removeSyncKey(payload);

      pendingAdminAction = null;
    }

    function promptStaffOrAdminAuth(actionTarget, targetBtn = null) {
      pendingStaffOrAdminAction = { target: actionTarget, btn: targetBtn };
      document.getElementById('staffOrAdminInput').value = '';
      document.getElementById('staffOrAdminAuthModal').classList.add('active');
    }

    function verifyStaffOrAdminAuth() {
      const input = document.getElementById('staffOrAdminInput').value.trim();
      const isAdmin = input === adminPassword;
      const matchedStaff = Object.values(localStaff).find(s => s && s.pin === input);

      if (!isAdmin && !matchedStaff) {
        return showPopupModal("Authentication Failed", "Invalid Staff PIN or Admin Password!", null);
      }

      closeModal('staffOrAdminAuthModal');
      if (!pendingStaffOrAdminAction) return;

      const { target, btn } = pendingStaffOrAdminAction;
      if (target === 'financeTab') {
        switchTab('financeTab', btn || document.querySelectorAll('.nav-btn')[2]);
      } else if (target === 'manualLog') {
        openManualLogModal();
      } else if (typeof target === 'function') {
        target();
      }

      pendingStaffOrAdminAction = null;
    }

    function filterRooms(type, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = type;
      renderRooms();
    }

    function renderRooms() {
      const container = document.getElementById('roomsContainer');
      const query = (document.getElementById('roomSearchInput')?.value || '').toLowerCase();
      if (!container) return;
      container.innerHTML = '';

      const roomKeys = Object.keys(localRooms).filter(k => localRooms[k]).sort((a,b) => (localRooms[a].number || 0) - (localRooms[b].number || 0));

      roomKeys.forEach(id => {
        const room = localRooms[id];
        if (!room) return;

        const isOccupied = room.status === 'occupied';
        const isMaintenance = room.status === 'maintenance';

        if (currentFilter === 'available' && room.status !== 'available') return;
        if (currentFilter === 'occupied' && !isOccupied) return;
        if (currentFilter === 'maintenance' && !isMaintenance) return;

        if (query && !room.number?.toString().includes(query) && !(room.name || '').toLowerCase().includes(query)) return;

        const card = document.createElement('div');
        card.className = `room-card ${isOccupied ? 'occupied' : isMaintenance ? 'maintenance' : 'available'}`;
        
        let amenitiesHtml = (room.amenities || []).map(a => `<span class="amenity-chip"><i class="fa-solid fa-check text-success"></i> ${a}</span>`).join('');

        card.innerHTML = `
          <div>
            <div class="room-card-header">
              <div>
                <div class="room-number-tag">Room ${room.number}</div>
                <div class="room-type">${room.name || 'Standard'}</div>
              </div>
              <div style="display:flex; gap:0.25rem;">
                <button class="btn btn-outline btn-sm" onclick="promptAdminAuth('toggleMaintenance', '${id}')" title="Maintenance Toggle"><i class="fa-solid fa-screwdriver-wrench"></i></button>
                <button class="btn btn-outline btn-sm" onclick="promptAdminAuth('editRoom', '${id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="promptAdminAuth('deleteRoom', '${id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>

            <div class="amenities-list">${amenitiesHtml}</div>
            <div class="room-price-tag">${currentCurrency} ${parseFloat(room.price || 0).toFixed(2)} / night</div>

            ${isOccupied ? `
              <div class="guest-details-box">
                <div><strong>Guest:</strong> ${room.guestName}</div>
                <div><strong>Phone:</strong> ${room.guestPhone || 'N/A'}</div>
                <div><strong>Nights:</strong> ${room.nights} | <strong>Paid:</strong> ${currentCurrency} ${parseFloat(room.totalPrice || 0).toFixed(2)} (${room.paymentMethod})</div>
                <div><strong>In:</strong> ${room.checkInTime}</div>
              </div>
            ` : isMaintenance ? `
              <div style="font-size:0.825rem; color:var(--warning); margin-bottom:1rem; font-weight:bold;"><i class="fa-solid fa-triangle-exclamation"></i> Out of Service for Maintenance</div>
            ` : '<div style="font-size:0.825rem; color:var(--text-muted); margin-bottom:1rem;">Ready for immediate guest check-in</div>'}
          </div>

          <div>
            ${isOccupied ? 
              `<button class="btn btn-danger" style="width:100%;" onclick="promptStaffOrAdminAuth(() => checkOutRoom('${id}'))"><i class="fa-solid fa-right-from-bracket"></i> Check Out Guest</button>` :
              `<button class="btn btn-success" style="width:100%;" ${isMaintenance ? 'disabled style="opacity:0.5;"' : ''} onclick="promptStaffOrAdminAuth(() => openCheckInModal('${id}'))"><i class="fa-solid fa-key"></i> Check In Room</button>`
            }
          </div>
        `;
        container.appendChild(card);
      });
    }

    function toggleRoomMaintenance(roomId) {
      const room = localRooms[roomId];
      if (!room) return;

      const newStatus = room.status === 'maintenance' ? 'available' : 'maintenance';
      room.status = newStatus;

      localRooms[roomId] = room;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/rooms/${roomId}`).set(room);
      }

      addNotification(`Room ${room.number} set to ${newStatus}.`);
      renderRooms();
      updateStats();
    }

    function openAddRoomModal() {
      document.getElementById('editRoomId').value = "";
      document.getElementById('roomModalTitle').innerHTML = `<i class="fa-solid fa-plus"></i> Add New Room`;
      document.getElementById('newRoomNumber').value = "";
      document.getElementById('newRoomName').value = "";
      document.getElementById('newRoomPrice').value = "";
      document.querySelectorAll('.room-amenity-cb').forEach(cb => cb.checked = false);
      document.getElementById('addRoomModal').classList.add('active');
    }

    function openEditRoomModal(roomId) {
      const room = localRooms[roomId];
      if (!room) return;
      document.getElementById('editRoomId').value = room.id;
      document.getElementById('roomModalTitle').innerHTML = `<i class="fa-solid fa-pen"></i> Edit Room ${room.number}`;
      document.getElementById('newRoomNumber').value = room.number;
      document.getElementById('newRoomName').value = room.name;
      document.getElementById('newRoomPrice').value = room.price;

      const currentAmenities = room.amenities || [];
      document.querySelectorAll('.room-amenity-cb').forEach(cb => cb.checked = currentAmenities.includes(cb.value));
      document.getElementById('addRoomModal').classList.add('active');
    }

    function handleCreateOrUpdateRoom(e) {
      e.preventDefault();
      const editId = document.getElementById('editRoomId').value;
      const number = parseInt(document.getElementById('newRoomNumber').value);
      const name = document.getElementById('newRoomName').value.trim();
      const price = parseFloat(document.getElementById('newRoomPrice').value);

      if (!editId) {
        const isDuplicate = Object.values(localRooms).some(r => r && r.number === number);
        if (isDuplicate) return showPopupModal("Duplicate Room", `Room Number ${number} already exists!`, null);
      }
      
      const amenities = [];
      document.querySelectorAll('.room-amenity-cb:checked').forEach(cb => amenities.push(cb.value));

      const id = editId ? editId : 'room_' + number;
      const existingStatus = editId && localRooms[editId] ? localRooms[editId].status : 'available';

      const newRoom = { ...(editId && localRooms[editId] ? localRooms[editId] : {}), id, number, name, price, amenities, status: existingStatus };

      localRooms[id] = newRoom;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/rooms/${id}`).set(newRoom);
      }

      addNotification(`Room ${number} (${name}) was saved.`);
      renderRooms();
      updateStats();
      closeModal('addRoomModal');
    }

    function deleteRoom(roomId) {
      const room = localRooms[roomId];
      const roomNumDisplay = room ? room.number : roomId;
      showPopupModal("Delete Room", `Are you sure you want to permanently delete Room ${roomNumDisplay}?`, () => {
        delete localRooms[roomId];
        saveLocalStorage();

        if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
          db.ref(`properties/${syncKey}/rooms/${roomId}`).remove();
        }

        addNotification(`Room ${roomNumDisplay} deleted.`);
        renderRooms();
        updateStats();
      });
    }

    function toggleNetworkSelect() {
      const method = document.getElementById('paymentMethod').value;
      const netGroup = document.getElementById('networkSelectGroup');
      if (method === 'MoMo') netGroup.style.display = 'block';
      else netGroup.style.display = 'none';
    }

    function toggleManualNetworkSelect() {
      const method = document.getElementById('manualLogPaymentMethod').value;
      const netGroup = document.getElementById('manualNetworkSelectGroup');
      if (method === 'MoMo') netGroup.style.display = 'block';
      else netGroup.style.display = 'none';
    }

    function openCheckInModal(roomId) {
      if (!activeShift) return showPopupModal("Shift Action Required", "An employee must sign in for shift duty in the 'Staff & Shift Operations' tab before completing check-ins!", null);

      const room = localRooms[roomId];
      if (!room) return;

      selectedRoomForCheckIn = room;
      document.getElementById('checkInRoomId').value = room.id;
      document.getElementById('modalCheckInTitle').innerText = `Check In: Room ${room.number}`;
      document.getElementById('guestName').value = '';
      document.getElementById('guestPhone').value = '';
      document.getElementById('stayNights').value = 1;
      document.getElementById('paymentMethod').value = 'Cash';
      toggleNetworkSelect();
      calculateCheckInPrice();
      document.getElementById('checkInModal').classList.add('active');
    }

    function calculateCheckInPrice() {
      if (!selectedRoomForCheckIn) return;
      const nights = parseInt(document.getElementById('stayNights').value) || 1;
      const total = nights * parseFloat(selectedRoomForCheckIn.price || 0);
      document.getElementById('totalCheckInPrice').value = total.toFixed(2);
    }

    function confirmCheckIn(e) {
      e.preventDefault();
      if (!selectedRoomForCheckIn) return;

      const roomId = selectedRoomForCheckIn.id;
      const guestName = document.getElementById('guestName').value.trim();
      const guestPhone = document.getElementById('guestPhone').value.trim();
      const nights = parseInt(document.getElementById('stayNights').value) || 1;
      let paymentMethod = document.getElementById('paymentMethod').value;
      if (paymentMethod === 'MoMo') {
        const net = document.getElementById('momoNetwork').value;
        paymentMethod = `MoMo (${net})`;
      }

      const totalPaid = nights * parseFloat(selectedRoomForCheckIn.price || 0);

      const checkInTimeStamp = new Date().toLocaleString();
      const updatedRoom = {
        ...selectedRoomForCheckIn,
        status: 'occupied',
        guestName,
        guestPhone,
        nights,
        paymentMethod,
        totalPrice: totalPaid,
        checkInTime: checkInTimeStamp
      };

      const currentCash = parseFloat(finances.cash || 0);
      const currentMomo = parseFloat(finances.momo || 0);

      if (paymentMethod.startsWith('Cash')) finances.cash = currentCash + totalPaid;
      else finances.momo = currentMomo + totalPaid;
      finances.total = parseFloat(finances.cash || 0) + parseFloat(finances.momo || 0);

      const transactionRecord = {
        timestamp: checkInTimeStamp,
        type: "Check-In",
        roomNumber: selectedRoomForCheckIn.number,
        guestName,
        attendant: activeShift ? activeShift.staffName : "Admin",
        paymentMethod,
        amount: totalPaid
      };

      localTransactions.push(transactionRecord);
      localRooms[roomId] = updatedRoom;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        const rootRef = db.ref(`properties/${syncKey}`);
        rootRef.child(`rooms/${roomId}`).set(updatedRoom);
        rootRef.child('finances').set(finances);
        rootRef.child('transactions').push(transactionRecord);
      }

      addNotification(`New Check-In: Room ${selectedRoomForCheckIn.number} (${guestName})`);
      renderRooms();
      updateStats();
      renderTransactions();
      
      closeModal('checkInModal');
      selectedRoomForCheckIn = null;
    }

    function checkOutRoom(roomId) {
      const room = localRooms[roomId];
      if (!room) return;

      showPopupModal("Confirm Check-Out", `Process Check-Out for Room ${room.number} (${room.guestName})?`, () => {
        const checkOutTimeStamp = new Date().toLocaleString();
        const resetRoom = { id: room.id, number: room.number, name: room.name, price: room.price, amenities: room.amenities || [], status: 'available' };

        const transactionRecord = {
          timestamp: checkOutTimeStamp,
          type: "Check-Out",
          roomNumber: room.number,
          guestName: room.guestName,
          attendant: activeShift ? activeShift.staffName : "Admin",
          paymentMethod: room.paymentMethod,
          amount: 0.00
        };

        localTransactions.push(transactionRecord);
        localRooms[roomId] = resetRoom;
        saveLocalStorage();

        if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
          db.ref(`properties/${syncKey}/rooms/${roomId}`).set(resetRoom);
          db.ref(`properties/${syncKey}/transactions`).push(transactionRecord);
        }

        addNotification(`Check-Out completed: Room ${room.number} (${room.guestName})`);
        renderRooms();
        updateStats();
        renderTransactions();
      });
    }

    function openManualLogModal() {
      document.getElementById('manualLogRoom').value = '';
      document.getElementById('manualLogGuest').value = '';
      document.getElementById('manualLogAmount').value = '';
      document.getElementById('manualLogPaymentMethod').value = 'Cash';
      toggleManualNetworkSelect();
      document.getElementById('manualLogModal').classList.add('active');
    }

    function handleManualLogSubmit(e) {
      e.preventDefault();
      const type = document.getElementById('manualLogType').value;
      const roomNum = document.getElementById('manualLogRoom').value.trim() || 'N/A';
      const guestName = document.getElementById('manualLogGuest').value.trim();
      let paymentMethod = document.getElementById('manualLogPaymentMethod').value;
      if (paymentMethod === 'MoMo') {
        const net = document.getElementById('manualMomoNetwork').value;
        paymentMethod = `MoMo (${net})`;
      }
      const amount = parseFloat(document.getElementById('manualLogAmount').value) || 0;

      const timeStamp = new Date().toLocaleString();

      const currentCash = parseFloat(finances.cash || 0);
      const currentMomo = parseFloat(finances.momo || 0);

      if (type === 'Manual Expense') {
        if (paymentMethod.startsWith('Cash')) finances.cash = currentCash - amount;
        else finances.momo = currentMomo - amount;
      } else {
        if (paymentMethod.startsWith('Cash')) finances.cash = currentCash + amount;
        else finances.momo = currentMomo + amount;
      }
      finances.total = parseFloat(finances.cash || 0) + parseFloat(finances.momo || 0);

      const transactionRecord = {
        timestamp: timeStamp,
        type: type,
        roomNumber: roomNum,
        guestName: guestName,
        attendant: activeShift ? activeShift.staffName : "Admin",
        paymentMethod: paymentMethod,
        amount: type === 'Manual Expense' ? -amount : amount
      };

      localTransactions.push(transactionRecord);
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        const rootRef = db.ref(`properties/${syncKey}`);
        rootRef.child('finances').set(finances);
        rootRef.child('transactions').push(transactionRecord);
      }

      addNotification(`Manual Log added: ${type} - ${guestName}`);
      updateStats();
      renderTransactions();
      closeModal('manualLogModal');
    }

    function renderStaff() {
      const tbody = document.getElementById('staffTableBody');
      const select = document.getElementById('signInStaffSelect');
      if (!tbody || !select) return;

      tbody.innerHTML = '';
      select.innerHTML = '<option value="">-- Choose Employee --</option>';

      Object.keys(localStaff).forEach(id => {
        const s = localStaff[id];
        if (!s) return;
        const isCurrentActive = activeShift && activeShift.staffId === id;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong class="${isCurrentActive ? 'glowing-staff' : ''}">${s.name}</strong></td>
          <td>${s.role}</td>
          <td>${s.phone}</td>
          <td>${isCurrentActive ? '<span style="color:var(--success); font-weight:bold;"><i class="fa-solid fa-circle"></i> On Shift</span>' : '<span style="color:var(--text-muted)">Offline</span>'}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="promptAdminAuth('editStaff', '${id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="promptAdminAuth('deleteStaff', '${id}')"><i class="fa-solid fa-user-minus"></i></button>
          </td>
        `;
        tbody.appendChild(tr);

        const opt = document.createElement('option');
        opt.value = id;
        opt.innerText = `${s.name} (${s.role})`;
        select.appendChild(opt);
      });
    }

    function openAddStaffModal() {
      document.getElementById('editStaffId').value = "";
      document.getElementById('staffModalTitle').innerHTML = `<i class="fa-solid fa-user-plus"></i> Register New Staff Member`;
      document.getElementById('newStaffName').value = "";
      document.getElementById('newStaffRole').value = "";
      document.getElementById('newStaffPhone').value = "";
      document.getElementById('newStaffPin').value = "";
      document.getElementById('addStaffModal').classList.add('active');
    }

    function openEditStaffModal(staffId) {
      const s = localStaff[staffId];
      if (!s) return;
      document.getElementById('editStaffId').value = s.id;
      document.getElementById('staffModalTitle').innerHTML = `<i class="fa-solid fa-pen"></i> Edit Staff Details`;
      document.getElementById('newStaffName').value = s.name;
      document.getElementById('newStaffRole').value = s.role;
      document.getElementById('newStaffPhone').value = s.phone;
      document.getElementById('newStaffPin').value = s.pin;
      document.getElementById('addStaffModal').classList.add('active');
    }

    function handleCreateOrUpdateStaff(e) {
      e.preventDefault();
      const editId = document.getElementById('editStaffId').value;
      const name = document.getElementById('newStaffName').value.trim();
      const role = document.getElementById('newStaffRole').value.trim();
      const phone = document.getElementById('newStaffPhone').value.trim();
      const pin = document.getElementById('newStaffPin').value.trim();
      
      const id = editId ? editId : 's_' + Date.now();
      const staffObj = { id, name, role, phone, pin };

      localStaff[id] = staffObj;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/staff/${id}`).set(staffObj);
      }

      addNotification(`Staff member ${name} saved.`);
      renderStaff();
      closeModal('addStaffModal');
    }

    function deleteStaff(staffId) {
      showPopupModal("Delete Staff Record", "Are you sure you want to remove this employee?", () => {
        delete localStaff[staffId];
        saveLocalStorage();

        if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
          db.ref(`properties/${syncKey}/staff/${staffId}`).remove();
        }

        addNotification(`Employee removed.`);
        renderStaff();
      });
    }

    function handleStaffSignIn(e) {
      e.preventDefault();
      const staffId = document.getElementById('signInStaffSelect').value;
      const enteredPin = document.getElementById('signInStaffPin').value.trim();

      const employee = localStaff[staffId];
      if (!employee) return showPopupModal("Selection Error", "Select a valid employee.", null);
      if (employee.pin !== enteredPin) return showPopupModal("Security Alert", "Incorrect Security PIN!", null);

      const shiftData = { staffId: employee.id, staffName: employee.name, role: employee.role, startTime: new Date().toLocaleTimeString() };

      activeShift = shiftData;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/shift`).set(shiftData);
      }

      addNotification(`Shift Started: ${employee.name}`);
      renderShiftState();
      renderStaff();
      document.getElementById('shiftSignInForm').reset();
    }

    function openStaffSignOutModal() {
      if (!activeShift) return;
      document.getElementById('staffSignOutPinInput').value = '';
      document.getElementById('signOutModalMessage').innerText = `Enter PIN for ${activeShift.staffName} to end shift.`;
      document.getElementById('staffSignOutModal').classList.add('active');
    }

    function verifyStaffSignOut() {
      if (!activeShift) return closeModal('staffSignOutModal');
      const enteredPin = document.getElementById('staffSignOutPinInput').value.trim();
      const employee = localStaff[activeShift.staffId];

      if (employee && employee.pin !== enteredPin) {
        return showPopupModal("Authentication Failed", "Incorrect Staff PIN!", null);
      }

      closeModal('staffSignOutModal');
      performStaffSignOut();
    }

    function renderShiftState() {
      const textDisplay = document.getElementById('shiftStatusText');
      const detailsBox = document.getElementById('activeShiftDetails');
      const signOutBtn = document.getElementById('signOutBtn');

      if (activeShift && activeShift.staffName) {
        textDisplay.innerHTML = `<span class="glowing-staff">Active: ${activeShift.staffName}</span>`;
        detailsBox.innerHTML = `<strong>Staff:</strong> <span class="glowing-staff">${activeShift.staffName}</span><br><strong>Role:</strong> ${activeShift.role}<br><strong>Start Time:</strong> ${activeShift.startTime}`;
        signOutBtn.style.display = 'inline-flex';
      } else {
        textDisplay.innerText = 'No Staff Shift Active';
        detailsBox.innerHTML = '<em>No employee currently signed in.</em>';
        signOutBtn.style.display = 'none';
      }
    }

    function performStaffSignOut() {
      const prevName = activeShift ? activeShift.staffName : "Staff";
      activeShift = null;
      saveLocalStorage();

      if (db && syncKey !== '***' && syncKey !== 'OFFLINE-LOCAL') {
        db.ref(`properties/${syncKey}/shift`).remove();
      }

      addNotification(`Shift ended for ${prevName}.`);
      renderShiftState();
      renderStaff();
    }

    function updateStats() {
      let available = 0, occupied = 0, totalRooms = 0;
      Object.values(localRooms).forEach(r => {
        if (!r) return;
        totalRooms++;
        if (r.status === 'available') available++;
        if (r.status === 'occupied') occupied++;
      });

      document.getElementById('statAvailableCount').innerText = available;
      const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
      document.getElementById('statOccupancy').innerText = `${occupancyRate}%`;

      const cash = parseFloat(finances.cash || 0);
      const momo = parseFloat(finances.momo || 0);
      const total = cash + momo;

      document.getElementById('statCash').innerText = `${currentCurrency} ${cash.toFixed(2)}`;
      document.getElementById('statMoMo').innerText = `${currentCurrency} ${momo.toFixed(2)}`;
      document.getElementById('statTotalRev').innerText = `${currentCurrency} ${total.toFixed(2)}`;
    }

    function renderTransactions() {
      const tbody = document.getElementById('transactionTableBody');
      if (!tbody) return;
      if (!localTransactions.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No activity recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      localTransactions.slice().reverse().forEach(t => {
        if (!t) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.timestamp}</td>
          <td><span class="badge" style="background:${t.type === 'Check-In' || t.type === 'Manual Check-In' ? '#dcfce7' : t.type === 'Manual Expense' ? '#fee2e2' : '#e0f2fe'}; color:${t.type === 'Check-In' || t.type === 'Manual Check-In' ? '#15803d' : t.type === 'Manual Expense' ? '#b91c1c' : '#0369a1'}; padding:0.2rem 0.4rem; border-radius:4px; font-weight:bold;">${t.type || 'Transaction'}</span></td>
          <td>${t.roomNumber !== 'N/A' ? 'Room ' + t.roomNumber : 'N/A'}</td>
          <td>${t.guestName}</td>
          <td>${t.attendant || 'System'}</td>
          <td>${t.paymentMethod}</td>
          <td><strong>${currentCurrency} ${parseFloat(t.amount || 0).toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    }

    function exportTransactionsCSV() {
      if (!localTransactions.length) return showPopupModal("Export Failed", "No records available to export.", null);
      let csvContent = "data:text/csv;charset=utf-8,Date & Time,Type,Room,Guest Name,Attendant,Payment Method,Amount Paid\n";
      localTransactions.forEach(t => {
        if (t) csvContent += `"${t.timestamp}","${t.type || 'Log'}","${t.roomNumber !== 'N/A' ? 'Room ' + t.roomNumber : 'N/A'}","${t.guestName}","${t.attendant || 'N/A'}","${t.paymentMethod}","${t.amount}"\n`;
      });
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `Check_In_Out_Report_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function printTransactionsPDF() {
      if (!localTransactions.length) return showPopupModal("Print Failed", "No transaction records available.", null);
      const printWindow = window.open('', '', 'height=600,width=800');
      printWindow.document.write('<html><head><title>Check-In & Check-Out Details Report</title>');
      printWindow.document.write('<style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:8px;text-align:left;} th{background:#f1f5f9;}</style>');
      printWindow.document.write('</head><body><h2>Check-In & Check-Out Activity Log</h2>');
      printWindow.document.write(document.getElementById('printableTransactionTable').outerHTML);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }

    function connectSyncKeyDirect() {
      const input = document.getElementById('syncKeyInput').value.trim();
      if (!input) return showPopupModal("Input Error", "Enter a valid Sync Key!", null);
      connectSyncKey(input);
    }

    function connectSyncKey(targetKey) {
      syncKey = targetKey.toUpperCase();
      localStorage.setItem('edico_sync_key', syncKey);

      if (!connectedSyncList.includes(syncKey)) {
        connectedSyncList.push(syncKey);
      }
      saveLocalStorage();

      if (db) {
        db.ref(`properties/${syncKey}/connected_keys`).set(connectedSyncList);
        bindDatabaseListeners();
      }
      
      renderConnectedSyncList();
      showPopupModal("Success", `Connected to Sync Key: ${syncKey}`, null);
    }

    function disconnectSyncKey() {
      syncKey = "OFFLINE-LOCAL";
      localStorage.setItem('edico_sync_key', syncKey);
      updateSyncKeyDisplay();
      document.getElementById('cloudStatusDot').classList.add('offline');
      document.getElementById('cloudStatusText').innerText = "Disconnected Mode";
      renderConnectedSyncList();
    }

    function removeSyncKey(targetKey) {
      connectedSyncList = connectedSyncList.filter(k => k !== targetKey);
      saveLocalStorage();
      if (syncKey === targetKey) {
        disconnectSyncKey();
      } else {
        renderConnectedSyncList();
      }
      showPopupModal("Removed", `Sync Key ${targetKey} removed from saved list.`, null);
    }

    function renderConnectedSyncList() {
      const tbody = document.getElementById('connectedSyncTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      connectedSyncList.forEach(key => {
        const isCurrent = key === syncKey;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${key}</strong> ${isCurrent ? '<span class="sync-badge">Active</span>' : ''}</td>
          <td>${isCurrent ? 'Connected' : 'Saved'}</td>
          <td>
            <div style="display:flex; gap:0.2rem;">
              ${isCurrent ? 
                `<button class="btn btn-danger btn-sm" onclick="disconnectSyncKey()">Disconnect</button>` :
                `<button class="btn btn-accent btn-sm" onclick="connectSyncKey('${key}')">Connect</button>`
              }
              <button class="btn btn-outline btn-sm" style="color:var(--danger);" onclick="promptAdminAuth('removeSyncKey', '${key}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function togglePinVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
      }
    }

    function switchTab(tabId, btnEl) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      if (btnEl) btnEl.classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    function loadSettings() {
      document.getElementById('displayDefaultPassword').innerText = adminPassword;
      document.getElementById('settingHouseName').value = houseName;
      document.getElementById('settingCurrency').value = currentCurrency;
      document.getElementById('appTitle').innerText = houseName;
      document.getElementById('gateBrandTitle').innerText = houseName;
      document.getElementById('footerHouseName').innerText = houseName;
      document.querySelectorAll('.currSymbol').forEach(el => el.innerText = currentCurrency);

      const scheduleSelect = document.getElementById('settingBackupSchedule');
      if (scheduleSelect) scheduleSelect.value = backupSchedule;
      updateBackupScheduleStatusText();

      if (logoData) {
        const logoEl = document.getElementById('appLogo');
        logoEl.src = logoData;
        logoEl.style.display = 'block';
      }
    }

    function saveBrandingSettings() {
      const hName = document.getElementById('settingHouseName').value.trim();
      const currency = document.getElementById('settingCurrency').value;

      if (hName) {
        houseName = hName;
        localStorage.setItem('edico_house_name', houseName);
        document.getElementById('appTitle').innerText = houseName;
        document.getElementById('gateBrandTitle').innerText = houseName;
        document.getElementById('footerHouseName').innerText = houseName;
      }
      
      currentCurrency = currency;
      localStorage.setItem('edico_currency', currentCurrency);
      document.querySelectorAll('.currSymbol').forEach(el => el.innerText = currency);
      
      renderRooms();
      updateStats();
      renderTransactions();
      showPopupModal("Settings Saved", "Branding settings saved.", null);
    }

    function handleLogoUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        logoData = evt.target.result;
        localStorage.setItem('edico_app_logo', logoData);
        const logoEl = document.getElementById('appLogo');
        logoEl.src = logoData;
        logoEl.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    function removeLogo() {
      logoData = '';
      localStorage.removeItem('edico_app_logo');
      const logoEl = document.getElementById('appLogo');
      logoEl.style.display = 'none';
      logoEl.src = '';
    }

    function updateAdminPassword() {
      const curr = document.getElementById('currAdminPass').value;
      const newP = document.getElementById('newAdminPass').value;

      if (curr !== adminPassword) return showPopupModal("Error", "Current Admin Password incorrect.", null);
      if (!newP || newP.length < 4) return showPopupModal("Error", "New password must be at least 4 characters.", null);

      adminPassword = newP;
      localStorage.setItem('edico_admin_pass', adminPassword);
      document.getElementById('displayDefaultPassword').innerText = adminPassword;
      document.getElementById('currAdminPass').value = '';
      document.getElementById('newAdminPass').value = '';
      showPopupModal("Password Changed", "Admin Password updated!", null);
    }

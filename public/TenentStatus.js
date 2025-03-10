// Username dropdown functionality
function toggleDropdown() {
    document.getElementById("usernameDropdown").classList.toggle("show");
}

// Custom dropdown functionality
function toggleCustomDropdown(element) {
    element.classList.toggle('active');
    
    var dropdownList = element.nextElementSibling;
    
    var allDropdowns = document.querySelectorAll('.dropdown-list');
    allDropdowns.forEach(function(dropdown) {
        if (dropdown !== dropdownList && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            dropdown.previousElementSibling.classList.remove('active');
        }
    });
    
    if (!dropdownList.classList.contains('show')) {
        dropdownList.classList.add('show');
    } else {
        dropdownList.classList.remove('show');
    }
}

function selectOption(option) {
    var selectedText = option.textContent;
    var dropdownList = option.parentElement;
    var dropdownSelect = dropdownList.previousElementSibling;
    
    dropdownSelect.textContent = selectedText;
    
    var options = dropdownList.querySelectorAll('.dropdown-option');
    options.forEach(function(opt) {
        opt.classList.remove('selected');
    });
    
    option.classList.add('selected');
    
    setTimeout(function() {
        dropdownList.classList.remove('show');
        dropdownSelect.classList.remove('active');
    }, 150);
    
    loadRooms();
}

// Close the dropdowns if the user clicks outside
window.onclick = function(event) {
    if (!event.target.matches('.username-dropdown') && !event.target.matches('.username-dropdown span')) {
        var dropdown = document.getElementById("usernameDropdown");
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    }
    
    if (!event.target.matches('.dropdown-select') && !event.target.matches('.dropdown-option')) {
        var dropdowns = document.querySelectorAll('.dropdown-list');
        var selects = document.querySelectorAll('.dropdown-select');
        
        dropdowns.forEach(function(dropdown) {
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        });
        
        selects.forEach(function(select) {
            if (select.classList.contains('active')) {
                select.classList.remove('active');
            }
        });
    }
}

// ✅ โหลดตึกจากฐานข้อมูลสำหรับ dropdown
function loadDormitories() {
    axios.get('/api/dormitories')
        .then(response => {
            const dormitories = response.data;
            const dormitoryList = document.querySelector('.dropdown-container:nth-child(1) .dropdown-list');
            dormitoryList.innerHTML = '<div class="dropdown-option" onclick="selectOption(this)">ทุกตึก</div>';

            dormitories.forEach(dorm => {
                const option = document.createElement("div");
                option.className = "dropdown-option";
                option.textContent = dorm.dormitory_name;
                option.setAttribute("data-id", dorm.dormitory_id);
                option.onclick = () => selectOption(option);
                dormitoryList.appendChild(option);
            });

            // โหลดชั้นเริ่มต้น
            loadFloors();
        })
        .catch(error => {
            console.error("❌ Error loading dormitories:", error);
        });
}

// ✅ โหลดชั้นจากฐานข้อมูลสำหรับ dropdown
function loadFloors() {
    const dormitoryText = document.querySelector('.dropdown-container:nth-child(1) .dropdown-select').textContent;
    const floorList = document.querySelector('.dropdown-container:nth-child(2) .dropdown-list');
    floorList.innerHTML = '<div class="dropdown-option" onclick="selectOption(this)">ทุกชั้น</div>';

    let dormitoryId = null;
    if (dormitoryText !== "ทุกตึก") {
        const dormOption = document.querySelector(`.dropdown-container:nth-child(1) .dropdown-option[data-id]`);
        if (dormOption) {
            dormitoryId = dormOption.getAttribute("data-id");
        }
    }

    if (!dormitoryId) {
        axios.get('/api/floors')
            .then(response => {
                response.data.forEach(floor => {
                    const option = document.createElement("div");
                    option.className = "dropdown-option";
                    option.textContent = `ชั้น ${floor.floor}`;
                    option.onclick = () => selectOption(option);
                    floorList.appendChild(option);
                });
            })
            .catch(error => console.error("❌ Error loading floors:", error));
    } else {
        axios.get(`/api/floors?dormitory_id=${dormitoryId}`)
            .then(response => {
                response.data.forEach(floor => {
                    const option = document.createElement("div");
                    option.className = "dropdown-option";
                    option.textContent = `ชั้น ${floor.floor}`;
                    option.onclick = () => selectOption(option);
                    floorList.appendChild(option);
                });
            })
            .catch(error => console.error("❌ Error loading floors:", error));
    }
}

// Load rooms from API
function loadRooms() {
    const floorsContainer = document.getElementById("floors-container");
    floorsContainer.innerHTML = "<div class='loading-indicator'>กำลังโหลดข้อมูล...</div>";
    
    const dormitoryText = document.querySelector('.dropdown-container:nth-child(1) .dropdown-select').textContent;
    const floorText = document.querySelector('.dropdown-container:nth-child(2) .dropdown-select').textContent;
    const roomSearch = document.getElementById("roomSearch").value.trim();

    let dormitoryId = null;
    if (dormitoryText !== "ทุกตึก") {
        const selectedDorm = document.querySelector('.dropdown-container:nth-child(1) .dropdown-option.selected');
        if (selectedDorm) {
            dormitoryId = selectedDorm.getAttribute("data-id");
        }
    }

    let floor = "";
    if (floorText !== "ทุกชั้น") {
        floor = floorText.replace("ชั้น ", "");
    }

    let apiUrl = `/api/rooms?`;
    if (dormitoryId) apiUrl += `dormitory_id=${dormitoryId}&`;
    if (floor) apiUrl += `floor=${floor}&`;
    if (roomSearch) apiUrl += `room_id=${roomSearch}&`;
    if (apiUrl.endsWith('&')) apiUrl = apiUrl.slice(0, -1);

    console.log("🔍 กำลังค้นหาห้อง:", apiUrl);

    axios.get(apiUrl)
        .then(response => {
            const rooms = response.data;
            if (dormitoryText === "ทุกตึก") {
                displayRoomsByDormitory(rooms);
            } else {
                displayRooms(rooms);
            }
        })
        .catch(error => {
            console.error("❌ Error loading rooms:", error);
            floorsContainer.innerHTML = "<div class='error-message'>เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง</div>";
        });
}

// Display rooms in HTML
function displayRooms(roomsData) {
    const floorsContainer = document.getElementById("floors-container");
    floorsContainer.innerHTML = "";

    if (!roomsData || Object.keys(roomsData).length === 0) {
        floorsContainer.innerHTML = "<div class='no-results'>ไม่พบห้องที่ค้นหา</div>";
        return;
    }

    const sortedFloors = Object.keys(roomsData).sort((a, b) => parseInt(a) - parseInt(b));
    sortedFloors.forEach(floor => {
        const floorSection = document.createElement("div");
        floorSection.classList.add("floor-section");
        floorSection.innerHTML = `
            <div class="floor-title">ชั้นที่ ${floor}</div>
            <div class="room-grid"></div>
        `;

        const roomGrid = floorSection.querySelector(".room-grid");
        const rooms = roomsData[floor];

        rooms.sort((a, b) => a.room_id.localeCompare(b.room_id));
        rooms.forEach(room => {
            const roomButton = document.createElement("button");
            roomButton.classList.add("room-item");
            roomButton.classList.add(room.tenant_ID ? "occupied" : "available");

            roomButton.innerHTML = `
                <div class="room-status">
                    <img src="${room.tenant_picture || '/image/default-profile.png'}" alt="User" class="room-user-image"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div class="room-status-icon"></div>
                </div>
                <h3>${room.room_id}</h3>
            `;

            roomButton.onclick = () => openPopup(
                room.room_id,
                room.room_status,
                room.tenant_status,
                room.telephone,
                room.tenant_ID,
                room.tenant_picture,
                room.firstName,
                room.lastName,
                room.room_type_name
            );

            roomGrid.appendChild(roomButton);
        });

        floorsContainer.appendChild(floorSection);
    });
}

// Display rooms by dormitory for "ทุกตึก" option
function displayRoomsByDormitory(roomsData) {
    const floorsContainer = document.getElementById("floors-container");
    floorsContainer.innerHTML = "";

    if (!roomsData || Object.keys(roomsData).length === 0) {
        floorsContainer.innerHTML = "<div class='no-results'>ไม่พบห้องที่ค้นหา</div>";
        return;
    }

    const dormitories = {};
    Object.keys(roomsData).forEach(floor => {
        roomsData[floor].forEach(room => {
            const dormId = room.dormitory_id; // ใช้ dormId โดยตรง

            if (!dormitories[dormId]) {
                dormitories[dormId] = {};
            }

            if (!dormitories[dormId][floor]) {
                dormitories[dormId][floor] = [];
            }

            dormitories[dormId][floor].push(room);
        });
    });

    Object.keys(dormitories).sort().forEach(dormId => {
        const dormitorySection = document.createElement("div");
        dormitorySection.classList.add("dormitory-section");
        dormitorySection.innerHTML = `<h2 class="dormitory-title">${dormId}</h2>`; // แสดง dormId โดยตรง

        const floors = Object.keys(dormitories[dormId]).sort((a, b) => parseInt(a) - parseInt(b));
        floors.forEach(floor => {
            const floorSection = document.createElement("div");
            floorSection.classList.add("floor-section");
            floorSection.innerHTML = `
                <div class="floor-title">ชั้นที่ ${floor}</div>
                <div class="room-grid"></div>
            `;

            const roomGrid = floorSection.querySelector(".room-grid");
            const rooms = dormitories[dormId][floor];

            rooms.sort((a, b) => a.room_id.localeCompare(b.room_id));
            rooms.forEach(room => {
                const roomButton = document.createElement("button");
                roomButton.classList.add("room-item");
                roomButton.classList.add(room.tenant_ID ? "occupied" : "available");


                //เอาไว้แสดงรูปคนในroom
                roomButton.innerHTML = `
                    <div class="room-status">
                        <img src="${room.tenant_picture || '/image/default-profile.png'}" alt="User" class="room-user-image"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div class="room-status-icon"></div>
                    </div>
                    <h3>${room.room_id}</h3>
                `;

                roomButton.onclick = () => openPopup(
                    room.room_id,
                    room.room_status || (room.tenant_ID ? "มีผู้เช่า" : "ว่าง"),
                    room.tenant_status || (room.tenant_ID ? "อาศัยอยู่" : "ไม่มีผู้เช่า"),
                    room.telephone || "ไม่มีข้อมูล",
                    room.tenant_ID || null,
                    room.tenant_picture || '/image/default-profile.png',
                    room.firstName || '',
                    room.lastName || '',
                    room.room_type_name
                );

                roomGrid.appendChild(roomButton);
            });

            dormitorySection.appendChild(floorSection);
        });

        floorsContainer.appendChild(dormitorySection);
    });
}

// Open popup to show room details
function openPopup(roomId, roomStatus, tenantStatus, telephone, tenantId, firstName, lastName, roomTypeName) {
    const popup = document.getElementById("profilePopup");
    const popupRoomNumber = document.getElementById("popup-room-number");
    const popupTenantName = document.getElementById("popup-tenant-name");
    const popupRoomStatus = document.getElementById("popup-room-status");
    const popupPhone = document.getElementById("popup-phone");
    const popupRoomType = document.getElementById("popup-room-type");

    if (!popupRoomType) {
        const popupBody = popup.querySelector(".popup-body .profile-info");
        const roomTypeElement = document.createElement("p");
        roomTypeElement.id = "popup-room-type";
        roomTypeElement.innerHTML = `<strong>ประเภทห้อง:</strong> <span></span>`;
        popupBody.appendChild(roomTypeElement);
    }

    popupRoomNumber.textContent = roomId;
    popupTenantName.textContent = `${firstName || ''} ${lastName || ''}`;
    popupRoomStatus.textContent = roomStatus || (tenantId ? "มีผู้เช่า" : "ว่าง");
    popupPhone.textContent = telephone || "ไม่มีข้อมูล";
    document.getElementById("popup-room-type").querySelector("span").textContent = roomTypeName || "ไม่ระบุ";

    const deleteTenantBtn = document.getElementById("delete-tenant-btn");
    const hasTenant = tenantId && tenantId !== "null" && tenantId.trim() !== "";

    if (hasTenant) {
        deleteTenantBtn.innerText = "ลบผู้เช่า";
        deleteTenantBtn.classList.add("btn-danger");
        deleteTenantBtn.classList.remove("btn-disabled");
        deleteTenantBtn.onclick = () => confirmRemoveTenant(roomId, tenantId);
    } else {
        deleteTenantBtn.innerText = "ไม่มีผู้เช่า";
        deleteTenantBtn.classList.add("btn-disabled");
        deleteTenantBtn.classList.remove("btn-danger");
        deleteTenantBtn.onclick = () => alert("ห้องนี้ไม่มีผู้เช่า");
    }

    popup.style.display = "flex";
    setTimeout(() => popup.classList.add("show"), 10);
}

// Confirm and remove tenant
function confirmRemoveTenant(roomNumber, tenantID) {
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้เช่าออกจากห้อง ${roomNumber} ?`)) {
        axios.post('/api/remove-tenant', { room_id: roomNumber, tenant_ID: tenantID })
            .then(response => {
                alert(response.data.message);
                closePopup();
                loadRooms();
            })
            .catch(error => {
                console.error("❌ เกิดข้อผิดพลาด:", error);
                alert("เกิดข้อผิดพลาดในการลบผู้เช่า");
            });
    }
}

// Close popup
function closePopup() {
    const popupContainer = document.getElementById("profilePopup");
    popupContainer.classList.remove("show");
    popupContainer.classList.add("hide");

    setTimeout(() => {
        popupContainer.style.display = "none";
        popupContainer.classList.remove("hide");
    }, 300);
}

// Delete tenant
function deleteTenant(tenantId, roomId) {
    if (confirm("คุณแน่ใจหรือไม่ที่จะลบผู้เช่าคนนี้? การกระทำนี้จะลบสัญญาและปล่อยห้องด้วย")) {
        axios.delete(`/api/tenant/${tenantId}`, { data: { roomId } })
            .then(response => {
                if (response.data.success) {
                    alert("ลบผู้เช่าสำเร็จ");
                    loadRooms();
                }
            })
            .catch(error => {
                console.error("❌ Error deleting tenant:", error.response.data);
                alert(error.response.data.message || "เกิดข้อผิดพลาดในการลบผู้เช่า");
            });
    }
}

// Handle room status change
function handleRoomStatusChange() {
    const roomStatusDropdown = document.getElementById("roomStatus");
    const selectedStatus = roomStatusDropdown.value;
    const roomId = document.getElementById("popup-room-number").innerText;

    if (selectedStatus === "ว่าง") {
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนสถานะห้องเป็นว่าง? ข้อมูลผู้เช่าจะถูกลบออก!")) {
            axios.post('/api/update-room-status', { room_id: roomId, tenant_ID: null })
                .then(response => {
                    alert("เปลี่ยนสถานะห้องเป็นว่างเรียบร้อยแล้ว!");
                    loadRooms();
                    closePopup();
                })
                .catch(error => {
                    console.error("เกิดข้อผิดพลาดในการเปลี่ยนสถานะ:", error);
                    alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
                });
        } else {
            roomStatusDropdown.value = "มีผู้เช่า";
        }
    }
}

// View contract details
function viewContract() {
    const roomNumber = document.getElementById("popup-room-number").innerText;
    window.location.href = `/ContractDetail?room_id=${roomNumber}`;
}

// Event listener when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    const roomSearch = document.getElementById("roomSearch");
    if (roomSearch) {
        roomSearch.addEventListener("input", function() {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => loadRooms(), 300);
        });
    }

    // Load initial data
    loadDormitories();
    loadRooms();

    // Add event listener for dormitory selection to update floors
    const dormitorySelect = document.querySelector('.dropdown-container:nth-child(1) .dropdown-select');
    dormitorySelect.addEventListener('click', loadFloors);

    // CSS for loading indicator, error message, and no results
    const style = document.createElement('style');
    style.textContent = `
        .loading-indicator, .error-message, .no-results {
            text-align: center;
            padding: 20px;
            margin: 20px 0;
            font-size: 16px;
        }
        .loading-indicator {
            color: #0066cc;
        }
        .error-message {
            color: #cc0000;
        }
        .no-results {
            color: #666;
            font-style: italic;
        }
    `;
    document.head.appendChild(style);
});
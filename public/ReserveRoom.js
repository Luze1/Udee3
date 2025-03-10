document.addEventListener("DOMContentLoaded", function () {
    loadDormitories();
});

// ✅ โหลดรายการตึก
function loadDormitories() {
    axios.get('/api/dormitories')
        .then(response => {
            const dormSelect = document.getElementById("dormitorySelect");
            dormSelect.innerHTML = `<option value="">--เลือกตึก--</option>`;
            response.data.forEach(dorm => {
                dormSelect.innerHTML += `<option value="${dorm.dormitory_id}">${dorm.dormitory_id}</option>`;
            });
        })
        .catch(error => console.error("❌ Error fetching dormitories:", error));
}

// ✅ โหลดรายการชั้นเมื่อเลือกตึก
function loadFloors() {
    const dormitoryId = document.getElementById("dormitorySelect").value;
    if (!dormitoryId) return;

    axios.get(`/api/floors?dormitory_id=${dormitoryId}`)
        .then(response => {
            const floorSelect = document.getElementById("floorSelect");
            floorSelect.innerHTML = `<option value="">--เลือกชั้น--</option>`;
            response.data.forEach(floor => {
                floorSelect.innerHTML += `<option value="${floor.floor}">ชั้น ${floor.floor}</option>`;
            });
        })
        .catch(error => console.error("❌ Error fetching floors:", error));
}

// ✅ โหลดรายการห้องว่าง
function loadVacantRooms() {
    const dormitoryId = document.getElementById("dormitorySelect").value;
    const floor = document.getElementById("floorSelect").value;

    if (!dormitoryId || !floor || dormitoryId === "--เลือกตึก--" || floor === "--เลือกชั้น--") {
        document.getElementById("roomSelect").innerHTML = `<option value="">--เลือกห้อง--</option>`;
        return;
    }

    axios.get('/api/vacant-rooms', {
        params: { dormitory_id: dormitoryId, floor: floor }
    })
    .then(response => {
        const roomSelect = document.getElementById("roomSelect");
        roomSelect.innerHTML = `<option value="">--เลือกห้อง--</option>`;
        response.data.forEach(room => {
            roomSelect.innerHTML += `<option value="${room.room_id}">${room.room_id}</option>`;
        });
        console.log("✅ โหลดห้องว่างสำเร็จ:", response.data);
    })
    .catch(error => {
        console.error("❌ Error fetching vacant rooms:", error);
        document.getElementById("roomSelect").innerHTML = `<option value="">--เกิดข้อผิดพลาด--</option>`;
    });
}

// ✅ บันทึกข้อมูลการจองห้อง
function assignRoom() {
    const firstName = document.getElementById("tenantFirstName").value;
    const lastName = document.getElementById("tenantLastName").value;
    const roomId = document.getElementById("roomSelect").value;
    const roomTypeId = document.getElementById("roomTypeSelect").value; // เพิ่มการดึง roomTypeId
    const tenantFirstName = document.getElementById("tenantFirstName").value;
    const tenantLastName = document.getElementById("tenantLastName").value;
    const dormitoryId = document.getElementById("dormitorySelect").value;
    const floorNumber = document.getElementById("floorSelect").value;
    const userCitizenId = document.getElementById("user_citizen_id").value;
    const userAddress = document.getElementById("user_address").value;
    const contractStartDate = document.getElementById("contract_start_date").value;
    const contractEndDate = document.getElementById("contract_end_date").value;
    const contractMonth = document.getElementById("contract_month").value;
    const rentFee = document.getElementById("rent_fee").value;
    const warranty = document.getElementById("warranty").value;
    const electricMeterNumber = document.getElementById("electric_meter_number").value;
    const waterMeterNumber = document.getElementById("water_meter_number").value;
    const electricPerUnit = document.getElementById("electric_per_unit").value;
    const waterPerUnit = document.getElementById("water_per_unit").value;
    const extraCondition = document.getElementById("extra_condition").value;

    // เพิ่มการตรวจสอบ roomTypeId
    if (!firstName || !lastName || !roomId || !roomTypeId) {
        alert("กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงเลือกประเภทห้อง");
        return;
    }

    axios.post("/api/assign-room", { 
        firstName, 
        lastName, 
        roomId, 
        roomTypeId, // เพิ่ม roomTypeId
        tenantFirstName, 
        tenantLastName, 
        dormitoryId, 
        floorNumber, 
        userCitizenId, 
        userAddress, 
        contractStartDate, 
        contractEndDate, 
        contractMonth, 
        rentFee, 
        warranty, 
        electricMeterNumber, 
        waterMeterNumber, 
        electricPerUnit, 
        waterPerUnit, 
        extraCondition 
    })
        .then(response => {
            if (response.data.success) {
                alert(`บันทึกข้อมูลสำเร็จ\nรหัสผู้เช่า: ${response.data.tenantId}`);
                // รีเซ็ตฟอร์ม
                document.getElementById("tenantFirstName").value = "";
                document.getElementById("tenantLastName").value = "";
                document.getElementById("roomSelect").value = "";
                document.getElementById("roomTypeSelect").value = ""; // รีเซ็ต roomTypeSelect
                document.getElementById("tenantFirstName").value = "";
                document.getElementById("tenantLastName").value = "";
                document.getElementById("dormitorySelect").value = "";
                document.getElementById("floorSelect").value = "";
                document.getElementById("user_citizen_id").value = "";
                document.getElementById("user_address").value = "";
                document.getElementById("contract_start_date").value = "";
                document.getElementById("contract_end_date").value = "";
                document.getElementById("contract_month").value = "";
                document.getElementById("rent_fee").value = "";
                document.getElementById("warranty").value = "";
                document.getElementById("electric_meter_number").value = "";
                document.getElementById("water_meter_number").value = "";
                document.getElementById("electric_per_unit").value = "";
                document.getElementById("water_per_unit").value = "";
                document.getElementById("extra_condition").value = "";
            }
        })
        .catch(error => {
            console.error("❌ Error assigning room:", error.response.data);
            alert(error.response.data.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        });
}

function loadRoomTypes() {
    axios.get('/api/room-types')
        .then(response => {
            const roomTypeSelect = document.getElementById("roomTypeSelect");
            roomTypeSelect.innerHTML = `<option value="">--เลือกประเภทห้อง--</option>`;
            response.data.forEach(roomType => {
                roomTypeSelect.innerHTML += `<option value="${roomType.room_type_id}">${roomType.room_type_name} (${roomType.price} บาท)</option>`;
            });
        })
        .catch(error => console.error("❌ Error fetching room types:", error));
}

// เพิ่ม Event Listener
document.getElementById("dormitorySelect").addEventListener("change", () => {
    loadFloors();
    document.getElementById("floorSelect").value = "";
    document.getElementById("roomSelect").value = "";
});

document.getElementById("floorSelect").addEventListener("change", () => {
    loadVacantRooms(); // โหลดห้องว่างเมื่อเลือกชั้น
});

document.addEventListener("DOMContentLoaded", function () {
    loadDormitories();
    loadRoomTypes(); // เพิ่มการโหลดประเภทห้อง
});
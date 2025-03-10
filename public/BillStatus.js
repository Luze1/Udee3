function displayBillStatus(bills, filter) {
    const floorsContainer = document.getElementById("floors-container");
    floorsContainer.innerHTML = "";

    console.log("🔍 ข้อมูลที่ได้รับจาก API:", bills); // เพิ่ม log เพื่อตรวจสอบ

    if (!bills || bills.length === 0) {
        floorsContainer.innerHTML = "<div class='no-results'>ไม่พบข้อมูลบิล</div>";
        return;
    }

    // แสดงผลแบบแยกตึกเหมือน TenentStatus
    displayBillsByDormitory(bills, filter);
}

function displayBillsByDormitory(bills, filter) {
    const floorsContainer = document.getElementById("floors-container");
    floorsContainer.innerHTML = "";

    console.log("🔍 ข้อมูลที่ได้รับจาก API:", bills);

    if (!bills || bills.length === 0) {
        floorsContainer.innerHTML = "<div class='no-results'>ไม่พบข้อมูลบิล</div>";
        return;
    }

    const dormitories = {};

    bills.forEach(bill => {
        if (filter && bill.bill_status !== filter) {
            return;
        }

        const dormName = getDormitoryName(bill.dormitory_id);
        const floor = bill.floor || "ไม่ทราบชั้น";

        if (!dormitories[dormName]) {
            dormitories[dormName] = {};
        }
        if (!dormitories[dormName][floor]) {
            dormitories[dormName][floor] = [];
        }
        dormitories[dormName][floor].push(bill);
    });

    Object.keys(dormitories).sort().forEach(dormName => {
        const dormitorySection = document.createElement("div");
        dormitorySection.classList.add("dormitory-section");
        dormitorySection.innerHTML = `<h2 class="dormitory-title">${dormName}</h2>`;

        const floors = Object.keys(dormitories[dormName]).sort((a, b) => parseInt(a) - parseInt(b));

        floors.forEach(floor => {
            const floorSection = document.createElement("div");
            floorSection.classList.add("floor-section");
            floorSection.innerHTML = `
                <div class="floor-title">ชั้นที่ ${floor}</div>
                <div class="room-container"></div>
            `;

            const roomContainer = floorSection.querySelector(".room-container");
            const billsInFloor = dormitories[dormName][floor];

            billsInFloor.sort((a, b) => a.room_id.localeCompare(b.room_id));

            billsInFloor.forEach(bill => {
                const roomLink = document.createElement("a");
                roomLink.href = `/BillDetail?room_id=${bill.room_id}`;

                const roomCard = document.createElement("div");
                roomCard.classList.add("room-card");
                roomCard.innerHTML = `<strong>${bill.room_id}</strong><br><span>${bill.bill_status}</span>`;

                // เพิ่ม class ตามสถานะบิลใน room-card
                switch (bill.bill_status) {
                    case "ชำระแล้ว":
                        roomCard.classList.add("complete");
                        break;
                    case "รอการตรวจสอบ":
                        roomCard.classList.add("paid");
                        break;
                    case "ค้างชำระ":
                        roomCard.classList.add("kangjai");
                        break;
                    case "บิลไม่สมบูรณ์":
                        roomCard.classList.add("incomplete");
                        break;
                    case "ไม่มีบิล":
                        roomCard.classList.add("no-data");
                        break;
                }

                roomLink.appendChild(roomCard);
                roomContainer.appendChild(roomLink);
            });

            dormitorySection.appendChild(floorSection);
        });

        floorsContainer.appendChild(dormitorySection);
    });
}

function getDormitoryName(dormId) {
    switch (dormId) {
        case 'D001': return 'ตึก A';
        case 'D002': return 'ตึก B';
        case 'D003': return 'ตึก C';
        default: return `ตึก ${dormId}`;
    }
}

// ฟังก์ชันโหลดบิล
function loadBills(statusFilter) {
    axios.get('/api/bill-status', { params: { status: statusFilter } })
        .then(response => {
            console.log("🔍 ผลลัพธ์จาก API:", response.data); // ตรวจสอบข้อมูล
            displayBillsByDormitory(response.data, statusFilter);
        })
        .catch(error => {
            console.error("❌ Error:", error);
            const floorsContainer = document.getElementById("floors-container");
            floorsContainer.innerHTML = "<div class='error-message'>เกิดข้อผิดพลาดในการโหลดข้อมูล</div>";
        });
}

// โหลดข้อมูลเริ่มต้นเมื่อหน้าโหลด
document.addEventListener('DOMContentLoaded', () => {
    loadBills(''); // แสดงทุกบิลเมื่อโหลดหน้า
});

// ฟังก์ชันค้นหาเมื่อกดปุ่ม
document.getElementById('searchBillBtn').addEventListener('click', () => {
    const statusFilter = document.getElementById('billStatusFilter').value;
    loadBills(statusFilter);
});

// อัปเดตเมื่อเปลี่ยนรอบบิล
document.getElementById('billingCycle').addEventListener('change', () => {
    const statusFilter = document.getElementById('billStatusFilter').value;
    const month = document.getElementById('billingCycle').value || 'มกราคม/2025';
    document.getElementById('selectedMonth').textContent = month;

    loadBills(statusFilter, month);
});

document.addEventListener("DOMContentLoaded", function () {
    const billingCycle = document.getElementById("billingCycle");
    const selectedMonthLabel = document.getElementById("selectedMonth");
    const billStatusFilter = document.getElementById("billStatusFilter");
    const searchBillBtn = document.getElementById("searchBillBtn");

    function fetchBillsByMonth(month) {
        axios.get(`/api/bills?month=${month}`)
            .then(response => {
                const bills = response.data;
                updateBillDisplay(bills);
            })
            .catch(error => console.error("❌ Error fetching bills:", error));
    }

    function updateBillDisplay(bills) {
        const container = document.getElementById("floors-container");
        container.innerHTML = "";
        bills.forEach(bill => {
            const billDiv = document.createElement("div");
            billDiv.classList.add("bill-item");
            billDiv.innerHTML = `<p>${bill.room_id} - ${bill.bill_status}</p>`;
            container.appendChild(billDiv);
        });
    }

    billingCycle.addEventListener("change", function () {
        const selectedMonth = billingCycle.value;
        selectedMonthLabel.textContent = selectedMonth;
        fetchBillsByMonth(selectedMonth);
    });

    searchBillBtn.addEventListener("click", function () {
        const selectedMonth = billingCycle.value;
        const status = billStatusFilter.value;
        axios.get(`/api/bills?month=${selectedMonth}&status=${status}`)
            .then(response => {
                updateBillDisplay(response.data);
            })
            .catch(error => console.error("❌ Error fetching filtered bills:", error));
    });

    // โหลดรอบบิลแรก
    fetchBillsByMonth(billingCycle.value);
});


document.addEventListener("DOMContentLoaded", function () {
    const billingCycleDropdown = document.getElementById("billingCycle");
    const selectedMonthText = document.getElementById("selectedMonth");

    function loadBillMonths() {
        axios.get("/api/billing-cycles")
            .then(response => {
                billingCycleDropdown.innerHTML = ""; // เคลียร์ dropdown ก่อนเติมข้อมูล

                response.data.forEach(month => {
                    const option = document.createElement("option");
                    option.value = month;
                    option.textContent = month;
                    billingCycleDropdown.appendChild(option);
                });

                // ตั้งค่าค่าดีฟอลต์เป็นเดือนแรกที่ดึงมา
                if (response.data.length > 0) {
                    billingCycleDropdown.value = response.data[0];
                    selectedMonthText.textContent = response.data[0];
                    loadBills("", response.data[0]); // โหลดบิลของเดือนแรก
                }
            })
            .catch(error => console.error("❌ Error loading bill months:", error));
    }

    billingCycleDropdown.addEventListener("change", function () {
        const selectedMonth = this.value;
        selectedMonthText.textContent = selectedMonth;
        loadBills("", selectedMonth);
    });

    loadBillMonths();
});

function refreshBillStatus() {
    axios.get('/api/bill-status')
        .then(response => {
            console.log("🔄 อัปเดตสถานะบิลใหม่:", response.data);
            displayBillsByDormitory(response.data);
        })
        .catch(error => {
            console.error("❌ Error:", error);
        });
}

function loadBills(statusFilter) {
    axios.get('/api/bill-status', { params: { status: statusFilter } })
        .then(response => {
            console.log("🔍 ผลลัพธ์จาก API:", response.data);
            displayBillsByDormitory(response.data, statusFilter);
        })
        .catch(error => {
            console.error("❌ Error:", error);
            const floorsContainer = document.getElementById("floors-container");
            floorsContainer.innerHTML = "<div class='error-message'>เกิดข้อผิดพลาดในการโหลดข้อมูล</div>";
        });
}



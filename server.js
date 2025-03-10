const express = require("express");
const path = require("path");
const port = 3000;
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const session = require("express-session");
const multer = require("multer");
const storage = multer.memoryStorage(); // เก็บไฟล์ในหน่วยความจำ (Buffer)
const { v4: uuidv4 } = require('uuid');
const upload = multer({
  storage: storage,
  limits: { files: 5 }, // จำกัดจำนวนไฟล์ที่สามารถอัปโหลดได้สูงสุด 5 ไฟล์
  fileFilter: (req, file, cb) => {  // การกรองไฟล์
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true); // อนุญาตให้ไฟล์ JPEG และ PNG อัปโหลดได้
    } else {
      cb(new Error('Only JPEG and PNG files are allowed'), false); // ถ้าไม่ใช่ไฟล์ JPEG หรือ PNG จะปฏิเสธ
    }
  }
});
const uploadSingle = upload.single("receipt");

// Creating the Express server
const app = express();

// Connect to SQLite database
let db = new sqlite3.Database("Udee_data.db", (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log("Connected to the SQlite database.");
});

// Session management
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true if using HTTPS
  })
);

// static resourse & templating engine
app.use(express.static("public"));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/style", express.static(path.join(__dirname, "style")));
// Set EJS as templating engine
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ ฟังก์ชันสร้าง `bill_id` อัตโนมัติ
function generateBillID(callback) {
  db.get("SELECT COUNT(*) AS count FROM bill", [], (err, row) => {
      if (err) {
          console.error("❌ Error fetching bill count:", err);
          return callback(null);
      }
      const newBillID = `B${String(row.count + 1).padStart(3, "0")}`;
      callback(newBillID);
  });
}

// ✅ ฟังก์ชันสร้าง `payment_id` อัตโนมัติ
function generatePaymentID(callback) {
  db.get("SELECT COUNT(*) AS count FROM payment", [], (err, row) => {
      if (err) {
          console.error("❌ Error fetching payment count:", err);
          return callback(null);
      }
      const newPaymentID = `P${String(row.count + 1).padStart(3, "0")}`;
      callback(newPaymentID);
  });
}

function createPayment(bill_id, room_id, tenant_ID, billDueDate, res) {
  console.log("✅ Creating payment for Bill ID:", bill_id);

  db.run("INSERT INTO payment (payment_id, room_id, tenant_ID, bill_id, bill_status, payment_due_date) VALUES (?, ?, ?, ?, ?, ?)",
      [`P${Date.now()}`, room_id, tenant_ID, bill_id, 0, billDueDate],
      function (err) {
          if (err) {
              console.error("❌ Error inserting payment:", err);
              return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการสร้างการชำระเงิน" });
          }

          console.log("✅ Payment successfully created");
          res.json({ success: true, message: "ส่งบิลสำเร็จ!" });
      }
  );
}

app.get("/dorm", function (req, res) {
  res.render("detail", { user: req.session.user });
});

app.get("/bill", function (req, res) {
  if (!req.session.user) {
    return res.redirect("/"); // ถ้าไม่ได้ login ให้กลับไปหน้าแรก
  }

  const tenantId = req.session.user.id;

  const query = `
    SELECT p.bill_id, p.payment_due_date, p.bill_status, 
           b.rent_fee, b.water_bill, b.electricity_bill, 
           b.additional_expenses, b.fine
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    WHERE p.tenant_id = ?
    ORDER BY p.payment_due_date DESC
  `;

  db.all(query, [tenantId], (err, bills) => {
    if (err) {
      console.error("SQL Error:", err.message);
      return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลบิล");
    }

    console.log("Bills fetched:", bills);
    res.render("bill", { user: req.session.user, bills });
  });
});

app.get("/bill/detail/:bill_id", function (req, res) {
  if (!req.session.user) {
    return res.status(403).json({ error: "กรุณาเข้าสู่ระบบ" });
  }

  const tenantId = req.session.user.id;
  const billId = req.params.bill_id;

  console.log("Fetching bill details for bill_id:", billId);
  console.log("Tenant ID:", tenantId);

  const query = `
    SELECT p.payment_due_date, p.bill_status, p.receipt_pic, 
           'ค่าเช่าห้อง' AS item_name, b.rent_fee AS amount
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    JOIN room r ON b.room_id = r.room_id
    WHERE p.bill_id = ? AND r.tenant_ID = ? AND b.rent_fee > 0
    UNION ALL
    SELECT p.payment_due_date, p.bill_status, p.receipt_pic,
           'ค่าน้ำ', b.water_bill
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    JOIN room r ON b.room_id = r.room_id
    WHERE p.bill_id = ? AND r.tenant_ID = ? AND b.water_bill > 0
    UNION ALL
    SELECT p.payment_due_date, p.bill_status, p.receipt_pic,
           'ค่าไฟ', b.electricity_bill
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    JOIN room r ON b.room_id = r.room_id
    WHERE p.bill_id = ? AND r.tenant_ID = ? AND b.electricity_bill > 0
    UNION ALL
    SELECT p.payment_due_date, p.bill_status, p.receipt_pic,
           'ค่าบริการส่วนกลาง', b.additional_expenses
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    JOIN room r ON b.room_id = r.room_id
    WHERE p.bill_id = ? AND r.tenant_ID = ? AND b.additional_expenses > 0
    UNION ALL
    SELECT p.payment_due_date, p.bill_status, p.receipt_pic,
           'ค่าปรับ', b.fine
    FROM payment p
    JOIN bill b ON p.bill_id = b.bill_id
    JOIN room r ON b.room_id = r.room_id
    WHERE p.bill_id = ? AND r.tenant_ID = ? AND b.fine > 0
  `;

  db.all(
    query,
    [billId, tenantId, billId, tenantId, billId, tenantId, billId, tenantId, billId, tenantId],
    (err, items) => {
      if (err) {
        console.error("SQL Error:", err.message);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในการดึงข้อมูลบิล" });
      }

      if (!items || items.length === 0) {
        return res.status(404).json({ error: "ไม่พบรายละเอียดบิล" });
      }

      const billInfo = {
        payment_due_date: items[0].payment_due_date,
        bill_status: items[0].bill_status,
        items: items,
        receipt_pic: items[0].receipt_pic ? `/receipt/${billId}` : null, // ✅ ส่งลิงก์รูป
      };

      res.json(billInfo);
    }
  );
});

app.get("/tenant/:dormitory_id", function (req, res) {
  const dormitory_id = req.params.dormitory_id; // รับค่า dormitory_id จาก URL

  // Query รวมข้อมูลจากหลายตาราง
  const query = `
    SELECT 
      d.dormitory_id, d.dormitory_name, d.dorm_address, d.province, d.district, d.subdistrict, d.zip_code,
      di.information, di.dorm_pic,
      f.facility,
      r.room_id, r.room_type_id,
      rt.room_type_name, rt.price
    FROM dormitory d
    LEFT JOIN dormitory_info di ON d.dormitory_id = di.dormitory_id
    LEFT JOIN facilities f ON d.dormitory_id = f.dormitory_id
    LEFT JOIN room r ON d.dormitory_id = r.dormitory_id
    LEFT JOIN room_type rt ON r.room_type_id = rt.room_type_id
    WHERE d.dormitory_id = ?`;

  db.all(query, [dormitory_id], (err, rows) => {
    if (err) {
      console.log(err.message);
      return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูล");
    }

    if (!rows || rows.length === 0) {
      return res.status(404).send("ไม่พบข้อมูลหอพัก");
    }

    // ดึงข้อมูลหอพักจาก row แรก
    let dormData = {
      dormitory_id: rows[0].dormitory_id,
      dorm_name: rows[0].dormitory_name,
      dorm_address: `${rows[0].dorm_address}, ${rows[0].subdistrict}, ${rows[0].district}, ${rows[0].province}, ${rows[0].zip_code}`,
      information: [],
      gallery: [],
      facilities: [],
      rooms: [],
    };

    // วนลูปเพิ่มข้อมูลรายละเอียด
    rows.forEach((row) => {
      if (row.information && !dormData.information.includes(row.information)) {
        dormData.information.push(row.information);
      }
    });

    // วนลูปเพิ่มรูปภาพทั้งหมด
    rows.forEach((row) => {
      if (row.dorm_pic) {
        let imageBase64 = `data:image/jpeg;base64,${Buffer.from(
          row.dorm_pic
        ).toString("base64")}`;
        if (!dormData.gallery.includes(imageBase64)) {
          dormData.gallery.push(imageBase64);
        }
      }
    });

    // วนลูปเพิ่มข้อมูลสิ่งอำนวยความสะดวก
    rows.forEach((row) => {
      if (row.facility && !dormData.facilities.includes(row.facility)) {
        dormData.facilities.push(row.facility);
      }
    });

    // วนลูปเพิ่มข้อมูลห้องพัก
    rows.forEach((row) => {
      if (
        row.room_id &&
        !dormData.rooms.some((r) => r.room_id === row.room_id)
      ) {
        dormData.rooms.push({
          room_id: row.room_id,
          room_type: row.room_type_name,
          price: row.price,
        });
      }
    });

    console.log(dormData);
    res.render("tenant", { data: dormData, user: req.session.user });
  });
});

// Middleware to parse request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Route for the home page
app.get('/', (req, res) => {
  if (req.session.user) {
      return res.render('home', { user: req.session.user }); // Render หน้า home ถ้ามี session
  }
  res.render('start'); // ถ้าไม่มี session ให้แสดงหน้าเริ่มต้น (start)
});

// API route for user registration
app.post('/register', (req, res) => {
  const { username, password, firstName, lastName, telephone, email } = req.body;
  let errors = [];
  // ตรวจสอบว่า telephone ต้องเป็นตัวเลข 10 หลัก
  if (!/^[0-9]{10}$/.test(telephone)) {
    errors.push("หมายเลขโทรศัพท์ต้องมี 10 หลัก");
  }
  if (errors.length > 0) {
    return res.status(400).json({ status: 'error', message: errors.join(", ") });
  }
  // ตรวจสอบความซ้ำซ้อนของ username, email และชื่อเต็ม
  db.get("SELECT * FROM tenant WHERE tenant_username = ? OR email = ? OR (firstName = ? AND lastName = ?)",
    [username, email, firstName, lastName], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ status: 'error', message: 'Database error' });
      }
      if (row) {
        return res.status(400).json({ status: 'error', message: 'Username, Email หรือ Full Name ถูกใช้ไปแล้ว' });
      }
      // นับจำนวน tenant ที่มีอยู่เพื่อสร้าง tenant_ID ใหม่
      db.get("SELECT COUNT(*) AS count FROM tenant", [], (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ status: 'error', message: 'Database error' });
        }

        let count = result.count + 1;
        let tenant_ID = `T${count.toString().padStart(3, '0')}`; // สร้าง ID ในรูปแบบ T001, T002, T003
        // INSERT ข้อมูลใหม่ลงฐานข้อมูล
        db.run("INSERT INTO tenant (tenant_ID, tenant_username, tenant_password, firstName, lastName, telephone, email) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [tenant_ID, username, password, firstName, lastName, telephone, email],
          function (err) {
            if (err) {
              console.error(err, 'cannot insert user');
              return res.status(500).json({ status: 'error', message: 'Database error' });
            }
            console.log('Insert user success');
            res.status(200).json({ status: 'success', message: 'User registered successfully', tenant_ID });
          }
        );
      });
    }
  );
});

app.get("/banks/:bill_id", (req, res) => {
  if (!req.session.user) {
      return res.redirect("/");
  }

  const billId = req.params.bill_id;
  const query = `SELECT bank_account_number, bank_account_name, bank_name, bank_pic FROM bank`;

  db.all(query, [], (err, banks) => {
      if (err) {
          console.error("SQL Error:", err.message);
          return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลธนาคาร");
      }

      const formattedBanks = banks.map(bank => {
        console.log("Raw bank_pic from DB:", bank.bank_pic);
        
        let bankPic = "/assets/default-bank.png"; // ค่า default
        if (bank.bank_pic && bank.bank_pic.trim() !== "") {
            bankPic = bank.bank_pic.startsWith("/") ? bank.bank_pic : `/assets/${bank.bank_pic}`;
        }
        
        console.log("Processed bank_pic:", bankPic);
        return {
            bank_account_number: bank.bank_account_number,
            bank_account_name: bank.bank_account_name,
            bank_name: bank.bank_name,
            bank_pic: bankPic
        };
    });

      res.render("select_bank", { user: req.session.user, banks: formattedBanks, bill_id: billId });
  });
});

app.get("/pay/:bank_account_number/:bill_id", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/"); // ถ้าไม่ได้ login ให้กลับไปหน้าแรก
  }

  const { bank_account_number, bill_id } = req.params;

  const query = `SELECT * FROM bank WHERE bank_account_number = ?`;

  db.get(query, [bank_account_number], (err, bank) => {
    if (err) {
      console.error("SQL Error:", err.message);
      return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลธนาคาร");
    }

    if (!bank) {
      return res.status(404).send("ไม่พบบัญชีธนาคาร");
    }

    // ใช้ path ของรูปภาพตรงๆ
    const bankPic = bank.bank_pic && bank.bank_pic.trim() !== "" ? bank.bank_pic : "/assets/default-bank.png";

    res.render("payment", { user: req.session.user, bank: { ...bank, bank_pic: bankPic }, bill_id });
  });
});

const fs = require("fs");

app.post("/confirm-payment", uploadSingle, (req, res) => {
  if (!req.session.user) {
      return res.redirect("/"); 
  }

  const { bill_id, bank_account_number } = req.body;

  console.log("Received file:", req.file); // Debugging

  let receiptBlob = null;
  if (req.file) {
      receiptBlob = req.file.buffer; 
  }

  const query = `UPDATE payment SET bill_status = 2, receipt_pic = ? WHERE bill_id = ?;`;

  db.run(query, [receiptBlob, bill_id], (err) => {
      if (err) {
          console.error("SQL Error:", err.message);
          return res.status(500).send("เกิดข้อผิดพลาดในการบันทึกการชำระเงิน");
      }

      res.redirect("/bill");
  });
});

app.get("/receipt/:bill_id", (req, res) => {
  const { bill_id } = req.params;

  const query = `SELECT receipt_pic FROM payment WHERE bill_id = ?`;

  db.get(query, [bill_id], (err, row) => {
    if (err) {
      console.error("SQL Error:", err.message);
      return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูล");
    }

    if (!row || !row.receipt_pic) {
      return res.status(404).send("ไม่พบรูปภาพสลิป");
    }

    res.setHeader("Content-Type", "image/png");
    res.send(row.receipt_pic);
  });
});


// API route for user login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM tenant WHERE tenant_username = ? AND tenant_password = ?", [username, password], (err, row) => {
      if (err) {
          console.log(err);
          return res.status(500).json({ status: 'error', message: 'Database error' });
      }
      if (!row) {
          return res.status(400).json({ status: 'error', message: 'Invalid username or password' });
      }

      // Create a session for the user
      req.session.user = {
          id: row.tenant_ID,
          username: row.tenant_username,
          firstName: row.firstName,
          lastName: row.lastName
      };

      res.status(200).json({ status: 'success', message: 'Login successful' });
  });
});

app.get('/home', (req, res) => {
  if (!req.session.user) {
      return res.redirect('/');
  }
  res.render('home', { user: req.session.user });
});

// Route for the owner login page
app.get('/owner-login', (req, res) => {
  if (req.session.owner) {
    return res.render('owner', { owner: req.session.owner }); // Render หน้า owner ถ้ามี session
  }
  res.render('owner-login'); // ถ้าไม่มี session ให้แสดงหน้า login
});

// Route for the owner login page
app.get('/owner-login', (req, res) => {
  if (req.session.owner) {
    return res.render('owner', { owner: req.session.owner }); // Render หน้า owner ถ้ามี session
  }
  res.render('owner-login'); // ถ้าไม่มี session ให้แสดงหน้า login
});

// API route for owner login
app.post('/owner-login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM owners WHERE owner_username = ? AND owner_password = ?", [username, password], (err, row) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ status: 'error', message: 'Database error' });
    }
    if (!row) {
      return res.status(400).json({ status: 'error', message: 'Invalid owner username or password' });
    }

    // Create a session for the owner
    req.session.owner = {
      id: row.id,
      username: row.owner_username
    };

    res.status(200).json({ status: 'success', message: 'Login successful' });
  });
});

// Route for the owner page
app.get('/owner', (req, res) => {
  if (!req.session.owner) {
    return res.redirect('/owner-login');
  }
  res.render('TenentStatus', { owner: req.session.owner });
});

// Route: Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get('/tncontact', (req, res) => {
  if (!req.session.user) {
      return res.redirect('/');
  }

  console.log(req.session.user.id);
  console.log(req.session.user.username);
  const tenantID = req.session.user.id;
  
  const query = `SELECT c.contact_id, c.tenant_ID, c.topic, c.description, c.picture, c.date, 
       c.status, c.response, c.date, d.dormitory_name
      FROM contact c 
      JOIN tenant t ON c.tenant_ID = t.tenant_ID
      JOIN room r ON t.tenant_ID = r.tenant_ID
      JOIN dormitory d ON r.dormitory_id = d.dormitory_id
      WHERE c.tenant_ID = ?
      GROUP BY c.contact_id
      ORDER BY c.date DESC;`;  // แสดงเฉพาะ tenant_ID ที่ล็อกอิน
  

  db.all(query, [tenantID], (err, rows) => {
      if (err) {
          return res.status(500).send('Database error: ' + err.message);
      }

      res.render('tenantcontact', { contacts: rows, id: req.session.user, user: req.session.user });
  });
});

app.get('/ownercontact', (req, res) => {
  const query = `SELECT c.contact_id, c.tenant_ID, c.topic, c.description, c.picture, c.date, c.status, c.response, c.response_time, t.tenant_ID, r.room_id, d.dormitory_id, d.dormitory_name, d.owner_id
    FROM contact c
    JOIN tenant t ON c.tenant_ID = t.tenant_ID
    JOIN room r ON t.tenant_ID = r.tenant_ID
    JOIN dormitory d ON r.dormitory_id = d.dormitory_id
    GROUP BY c.contact_id
    ORDER BY c.date DESC;`;

  db.all(query, [], (err, rows) => {
      if (err) {
          return res.status(500).send('Database error: ' + err.message);
      }

      // เรนเดอร์หน้า EJS และส่งข้อมูลไป
      res.render('ownercontact', { contacts: rows , owner:req.session.owner});
  });
});

app.get('/tenantcontactform', (req, res) => {
  if (!req.session.user) {
      return res.redirect('/');
  }
  res.render('tenantcontactform', { user: req.session.user.username });
});

app.get('/contact/:id', (req, res) => {
  const contactId = req.params.id;
  const query = `SELECT c.contact_id, c.tenant_ID, c.topic, c.description, c.picture, c.date, c.status, c.response, c.response_time, t.tenant_ID, t.firstName, t.lastName, t.telephone, r.room_id, d.dormitory_id, d.dormitory_name, d.owner_id
FROM contact c
JOIN tenant t ON c.tenant_ID = t.tenant_ID
JOIN room r ON t.tenant_ID = r.tenant_ID
JOIN dormitory d ON r.dormitory_id = d.dormitory_id
WHERE c.contact_id = ?`;

  db.get(query, [contactId], (err, row) => {
      if (err) {
          return res.status(500).send('Database error: ' + err.message);
      }
      if (!row) {
          return res.status(404).send('Contact not found');
      }
      if (row.picture) {
          row.picture = `data:image/jpeg;base64,${row.picture.toString('base64')}`;
      }

      if (row.status === 'pending') {
          res.render('ownercontactdetail', { contact: row , owner:req.session.owner, user:req.session.user});
      } else {
          res.render('contactdone_owner', { contact: row , owner:req.session.owner, user:req.session.user});
      }

  });
});

app.get('/tncontact/:id', (req, res) => {
  const contactId = req.params.id;
  const query = `SELECT c.contact_id, c.tenant_ID, c.topic, c.description, c.picture, c.date, c.status, c.response, c.response_time, t.tenant_ID, t.firstName, t.lastName, t.telephone, r.room_id, d.dormitory_id, d.dormitory_name, d.owner_id
FROM contact c
JOIN tenant t ON c.tenant_ID = t.tenant_ID
JOIN room r ON t.tenant_ID = r.tenant_ID
JOIN dormitory d ON r.dormitory_id = d.dormitory_id
WHERE c.contact_id = ?`;

  db.get(query, [contactId], (err, row) => {
      if (err) {
          return res.status(500).send('Database error: ' + err.message);
      }
      if (!row) {
          return res.status(404).send('Contact not found');
      }
      if (row.picture) {
          row.picture = `data:image/jpeg;base64,${row.picture.toString('base64')}`;
      }

      if (row.status === 'pending') {
          res.render('tenantcontactdetail', { contact: row });
      } else {
          res.render('contactdone_user', { contact: row ,user:req.session.user});
      }

  });
});

app.get('/owncontact/:id', (req, res) => {
  const contactId = req.params.id;
  const query = `SELECT c.contact_id, c.tenant_ID, c.topic, c.description, c.picture, c.date, c.status, c.response, c.response_time, t.tenant_ID, t.firstName, t.lastName, t.telephone, r.room_id, d.dormitory_id, d.dormitory_name, d.owner_id
FROM contact c
JOIN tenant t ON c.tenant_ID = t.tenant_ID
JOIN room r ON t.tenant_ID = r.tenant_ID
JOIN dormitory d ON r.dormitory_id = d.dormitory_id
WHERE c.contact_id = ?`;

  db.get(query, [contactId], (err, row) => {
      if (err) {
          return res.status(500).send('Database error: ' + err.message);
      }
      if (!row) {
          return res.status(404).send('Contact not found');
      }
      if (row.picture) {
          row.picture = `data:image/jpeg;base64,${row.picture.toString('base64')}`;
      }

      if (row.status === 'pending') {
          res.render('tenantcontactdetail', { contact: row });
      } else {
          res.render('contactdone_owner', { contact: row , owner:req.session.owner, user:req.session.user});
      }
  });
});

app.post('/update-contact', (req, res) => {
  const { contact_id, response } = req.body;
  if (!contact_id || !response) {
      return res.json({ success: false, message: "Missing data" });
  }

  const responseDate = new Date().toISOString();

  const query = `UPDATE contact 
                 SET status = 'resolved', 
                     response = ?, 
                     response_time = ? 
                 WHERE contact_id = ?`;

  db.run(query, [response, responseDate, contact_id], function (err) {
      if (err) {
          console.error("Database Error:", err.message);
          return res.json({ success: false, message: err.message });
      }
      res.json({ success: true });
  });
});

app.post('/submit-contact', upload.single('picture'), (req, res) => {
  if (!req.session.user) {
      return res.redirect('/');
  }
  
  const tenantID = req.session.user.id;
  const { topic, description } = req.body;
  let picture = req.file ? req.file.buffer : null;
  const date = new Date().toISOString();
  const status = 'pending';

  db.get("SELECT contact_id FROM contact ORDER BY contact_id DESC LIMIT 1", (err, row) => {
      if (err) {
          console.error('Database error (SELECT):', err.message);
          return res.status(500).send('Database error (SELECT)');
      }
      
      let newContactId = "C001";
      if (row) {
          let lastId = parseInt(row.contact_id.substring(1));
          newContactId = `C${(lastId + 1).toString().padStart(3, '0')}`;
      }

      const insertQuery = `INSERT INTO contact (contact_id, tenant_ID, topic, description, picture, date, status, response, response_time) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`;

      db.run(insertQuery, [newContactId, tenantID, topic, description, picture, date, status], (err) => {
          if (err) {
              console.error('Database error (INSERT):', err.message);
              return res.status(500).send('Database error (INSERT)');
          }
          console.log("Contact inserted successfully! ID:", newContactId);
          res.redirect('/tncontact');
      });
  });
});

  // Route for the add_dorm page
app.get('/add_bill', (req, res) => {
    res.render('bill_detail');
  });
//Start usecase 2  เพิ่มข้อมูลหอพัก----------------------------------------------------------------------------------------
// ตั้งค่า multer สำหรับอัปโหลดไฟล์
// Multer configuration for file upload

// Route for the add_dorm page
app.get('/add_dorm', (req, res) => {
  res.render('add_dorm', {owner: req.session.owner});
});

app.post('/add_dorm_info', upload.array('image'), function (req, res) {
  let formdata = {
    dormitory_name: req.body.dormitory_name,
    contact: req.body.contact,
    email: req.body.email,
    monthly_bill_date: req.body.monthly_bill_date,
    bill_due_date: req.body.bill_due_date,
    floor_count: req.body.floor_count,
    dorm_address: req.body.dorm_address,
    province: req.body.province,
    subdistrict: req.body.subdistrict,
    district: req.body.district,
    zip_code: req.body.zip_code,
    bank_name: req.body.bank_name,
    bank_account_name: req.body.bank_account_name,
    bank_account_number: req.body.bank_account_number,
    information: typeof req.body.information === "object" ? JSON.stringify(req.body.information) : req.body.information || ""
  };

  // ค้นหาค่าของ dormitory_id ล่าสุด (ใช้ฟอร์แมต D001, D002, D003)
  db.get("SELECT dormitory_id FROM dormitory ORDER BY dormitory_id DESC LIMIT 1", (err, row) => {
    if (err) {
      console.error("Error fetching last dormitory_id:", err);
      return res.send("Error fetching last dormitory_id.");
    }

    let dormitory_id = 'D001'; // ค่าเริ่มต้น
    if (row) {
      let lastId = row.dormitory_id;
      let lastNumber = parseInt(lastId.replace('D', ''));
      dormitory_id = `D${(lastNumber + 1).toString().padStart(3, '0')}`;
    }

    // สร้าง SQL สำหรับเพิ่มข้อมูลหอพัก
    let sql = `INSERT INTO dormitory (dormitory_id, dormitory_name, contact, email, monthly_bill_date, bill_due_date, floor_count, dorm_address, province, subdistrict, district, zip_code) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

    db.run(sql, [
      dormitory_id,
      formdata.dormitory_name,
      formdata.contact,
      formdata.email,
      formdata.monthly_bill_date,
      formdata.bill_due_date,
      formdata.floor_count,
      formdata.dorm_address,
      formdata.province,
      formdata.subdistrict,
      formdata.district,
      formdata.zip_code
    ], function (err) {
      if (err) {
        console.error("Error inserting dormitory data:", err);
        return res.send("Error inserting dormitory data.");
      }

      console.log("Dormitory Data Inserted Successfully:");
      console.log({
        dormitory_id: dormitory_id,
        dormitory_name: formdata.dormitory_name,
        contact: formdata.contact,
        email: formdata.email,
        monthly_bill_date: formdata.monthly_bill_date,
        bill_due_date: formdata.bill_due_date,
        floor_count: formdata.floor_count,
        dorm_address: formdata.dorm_address,
        province: formdata.province,
        subdistrict: formdata.subdistrict,
        district: formdata.district,
        zip_code: formdata.zip_code
      });
      // เพิ่มข้อมูลชั้น (`floor_number`) และจำนวนห้อง (`room_amount`) ลงใน `dormitory_floors`
      for (let i = 1; i <= formdata.floor_count; i++) {
        let roomAmount = parseInt(req.body[`room_amount_floor_${i}`]) || 0;

        let floorSql = `INSERT INTO dormitory_floors (dormitory_id, floor_number, room_amount) VALUES (?, ?, ?);`;
        db.run(floorSql, [dormitory_id, i, roomAmount], function (err) {
          if (err) {
            console.error(`Error inserting floor data for floor ${i}:`, err);
          } else {
            console.log(`Inserted floor ${i} with ${roomAmount} rooms in dormitory ${dormitory_id}`);
          }
        });
      }
    // ✅ แยก `information` เป็นหลายแถว
    let dormInfoList = req.body.information || [];
    if (!Array.isArray(dormInfoList)) {
        dormInfoList = [dormInfoList]; // ถ้าเป็น string ให้เปลี่ยนเป็น array
    }

    console.log("Dormitory Information:", dormInfoList);

    dormInfoList.forEach(info => {
        let infoSql = `INSERT INTO dormitory_info (dormitory_id, information) VALUES (?, ?);`;
        db.run(infoSql, [dormitory_id, info], function (err2) {
            if (err2) {
                console.error("Error inserting information data:", err2);
            } else {
                console.log(`Inserted information: ${info} for dormitory ${dormitory_id}`);
            }
        });
    });

    // เพิ่มข้อมูลห้องพัก
    let roomSql = `INSERT INTO room (room_id, dormitory_id, floor_number, room_type_id) VALUES (?, ?, ?, ?);`;

    // แปลง dormitory_id เพื่อตัดเลข 0 ข้างหน้า
    let dormNumber = dormitory_id.replace(/^D0*/, '');

    for (let i = 1; i <= formdata.floor_count; i++) {
      let roomAmount = req.body[`room_amount_floor_${i}`] || 0;

      for (let j = 1; j <= roomAmount; j++) {
        let roomId = `${dormNumber}R${i}${String(j).padStart(2, '0')}`; // ใช้ dormNumber ที่ตัดเลข 0 แล้ว

        // สุ่มค่า room_type_id เฉพาะ 2 ห้องแรก
        let roomTypeId = (j <= 2) ? (Math.random() < 0.5 ? "RT001" : "RT002") : null;

        db.run(roomSql, [roomId, dormitory_id, i, roomTypeId], function (err) {
          if (err) {
            console.error("Error inserting room data:", err);
          } else {
            console.log(`Inserted room: ${roomId} on floor ${i} in dormitory ${dormitory_id} with room_type_id: ${roomTypeId}`);
          }
        });
      }
    }

      // กำหนด path ของรูปธนาคารในรูปแบบ text (ไม่ใช้ __dirname ในการเก็บข้อมูล)
      let bankPicText = "";
      switch (formdata.bank_name) {
        case "1":
          bankPicText = "/assets/prompt_pay.png";
          break;
        case "2":
          bankPicText = "/assets/bangkok.jpg";
          break;
        case "3":
          bankPicText = "/assets/kbank.jpg";
          break;
        case "4":
          bankPicText = "/assets/krungthai.png";
          break;
        case "5":
          bankPicText = "/assets/ttb.png";
          break;
        case "6":
          bankPicText = "/assets/scb.jpg";
          break;
        case "7":
          bankPicText = "/assets/krungsri.jpg";
          break;
        case "8":
          bankPicText = "/assets/aomsin.jpg";
          break;
        default:
          bankPicText = ""; // กรณีไม่ได้เลือกธนาคารที่ถูกต้อง
      }

      // Insert ข้อมูลธนาคารลงตาราง bank
      // ตาราง bank มีเฉพาะคอลัมน์ bank_name, bank_pic, bank_account_name, bank_account_number
      // โดย bank_account_number เป็น PRIMARY KEY
      db.run(
        `INSERT INTO bank (bank_name, bank_pic, bank_account_name, bank_account_number)
         VALUES (?, ?, ?, ?)`,
        [
          formdata.bank_name,
          bankPicText,
          formdata.bank_account_name,
          formdata.bank_account_number
        ],
        function (err2) {
          if (err2) {
            console.error("Insert bank error:", err2);
            return res.status(500).send("Database Error: " + err2.message);
          }
          console.log("Insert bank success.");

          // เพิ่มข้อมูลสิ่งอำนวยความสะดวก (facilities)
          const facilities = req.body.facility || [];
          if (facilities.length > 0) {
            let facilityInserts = [];
            let facilityValues = [];
            facilities.forEach(facility => {
              // ต้องแน่ใจว่ามีการ import uuidv4 มาก่อน เช่น const { v4: uuidv4 } = require('uuid');
              const rawUUID = uuidv4().replace(/-/g, '');
              const facilityID = `FAC-${rawUUID.slice(0, 8)}`;
              facilityInserts.push(`(?, ?, ?)`);
              facilityValues.push(facilityID, dormitory_id, facility);
            });
            let facilitySql = `INSERT INTO facilities (facilityID, dormitory_id, facility) VALUES ${facilityInserts.join(", ")};`;
            db.run(facilitySql, facilityValues, function (err3) {
              if (err3) {
                console.error("Error inserting facility data:", err3);
                return res.send("Error inserting facility data.");
              }
              console.log("Facility Data Inserted Successfully:");
              console.log(facilityValues);

              // ตรวจสอบการอัปโหลดรูปภาพหอพัก
              // ✅ Insert Dormitory Info (Images + Information)
          if (req.files && req.files.length > 0) {
            let pending = req.files.length;

            req.files.forEach(file => {
              const imageBuffer = file.buffer;
              let imageSql = 'INSERT INTO dormitory_info (dormitory_id, information, dorm_pic) VALUES (?, ?, ?);';
                  db.run(imageSql, [dormitory_id, formdata.information, imageBuffer], function (err2) {
                      if (err2) {
                          console.error("Error inserting image data:", err2);
                      }
                      pending--;
                      if (pending === 0) {
                          console.log("All images and information inserted successfully.");
                          res.redirect('/add_dorm');
                      }
                  });
              });
          } else {
              console.log("No images uploaded.");
              res.redirect('/add_dorm');
          }
            });
          } else {
            // ถ้าไม่มี facility ให้ตรวจสอบรูปภาพหอพักโดยตรง
            if (req.files && req.files.length > 0) {
              let pending = req.files.length;
              req.files.forEach(file => {
                const imageBuffer = file.buffer;
                let imageSql = `INSERT INTO dormitory_info (dormitory_id, dorm_pic) VALUES (?, ?);`;
                db.run(imageSql, [dormitory_id, imageBuffer], function (err4) {
                  if (err4) {
                    console.error("Error inserting image data:", err4);
                  }
                  pending--;
                  if (pending === 0) {
                    res.redirect('/add_dorm');
                  }
                });
              });
            } else {
              res.redirect('/add_dorm');
            }
          }
        }
      );
    });
  });
});

//End usecase 2  เพิ่มข้อมูลหอพัก--------------------------------------------------------------------------------------------
// 🟢 แสดงบิลของแต่ละห้อง
app.get('/bills/:room_id', async (req, res) => {
  try {
      const room_id = req.params.room_id;

      // ดึงข้อมูลบิลของห้องที่เลือก
      db.get("SELECT * FROM bill WHERE room_id = ?", [room_id], (err, billData) => {
          if (err || !billData) {
              return res.status(404).send("ไม่พบข้อมูลบิล");
          }

          // ดึงข้อมูลสัญญาเช่าของห้อง
          db.get("SELECT * FROM contract WHERE room_id = ?", [room_id], (err, contractData) => {
              if (err || !contractData) {
                  return res.status(404).send("ไม่พบข้อมูลสัญญาเช่า");
              }

              // ดึงข้อมูลผู้เช่า
              db.get("SELECT * FROM tenant WHERE tenant_ID = ?", [contractData.user_citizen_id], (err, tenantData) => {
                  if (err || !tenantData) {
                      return res.status(404).send("ไม่พบข้อมูลผู้เช่า");
                  }

                  // คำนวณยอดรวม
                  let totalAmount = parseFloat(billData.rent_fee) +
                      parseFloat(billData.water_bill) +
                      parseFloat(billData.electricity_bill) +
                      parseFloat(billData.additional_expenses) +
                      parseFloat(billData.fine);

                  // เรนเดอร์หน้า bills.ejs พร้อมส่งข้อมูล
                  res.render('bills', {
                      room_id: room_id,
                      tenantFirstName: contractData.tenantFirstName,
                      tenantLastName: contractData.tenantLastName,
                      telephone: tenantData.telephone,
                      bill_id: billData.bill_id,
                      rent_fee: billData.rent_fee,
                      water_bill: billData.water_bill,
                      electricity_bill: billData.electricity_bill,
                      additional_expenses: billData.additional_expenses,
                      fine: billData.fine,
                      totalAmount: totalAmount.toFixed(2)
                  });
              });
          });
      });
  } catch (error) {
      console.error("❌ Error:", error);
      res.status(500).send("เกิดข้อผิดพลาดในเซิร์ฟเวอร์");
  }
});

app.post('/api/add-expense', (req, res) => {
  const { room_id, month, amount } = req.body;

  db.get("SELECT bill_id FROM bill WHERE room_id = ? AND month = ?", [room_id, month], (err, bill) => {
      if (err) {
          console.error("❌ Database error:", err);
          return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลใบแจ้งหนี้" });
      }

      if (!bill) {
          console.warn("⚠️ ไม่พบบิล กำลังสร้างบิลใหม่...");

          generateBillID((newBillID) => {
            db.run("INSERT INTO bill (bill_id, room_id, contract_id, month, rent_fee, water_bill, electricity_bill, additional_expenses, fine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [newBillID, room_id, contract_id, month, rent_fee, water_bill, electric_bill, additional_expense, 0], function (err) {
                  if (err) {
                      console.error("❌ Error inserting new bill:", err);
                      return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการสร้างบิลใหม่" });
                  }
                  createPayment(newBillID, room_id, tenant_ID, billDueDate, res);
              });
          });
      } else {
          db.run("UPDATE bill SET additional_expenses = additional_expenses + ? WHERE bill_id = ?",
              [amount, bill.bill_id],
              function (err) {
                  if (err) return res.status(500).json({ success: false, message: "ไม่สามารถเพิ่มค่าใช้จ่ายได้" });
                  res.json({ success: true, message: "เพิ่มค่าใช้จ่ายสำเร็จ!" });
              });
      }
  });
});

// ✅ API: บันทึกค่าน้ำ/ค่าไฟ
app.post('/api/record-usage', (req, res) => {
  const { room_id, month, water_units, electric_units } = req.body;

  db.get("SELECT water_per_unit, electric_per_unit FROM contract WHERE room_id = ?", [room_id], (err, contract) => {
      if (err || !contract) {
          return res.status(500).json({ success: false, message: "ไม่พบข้อมูลสัญญาเช่า" });
      }

      const waterBill = water_units * contract.water_per_unit;
      const electricBill = electric_units * contract.electric_per_unit;

      generateBillID((newBillID) => {
          db.get("SELECT * FROM bill WHERE room_id = ? AND month = ?", [room_id, month], (err, bill) => {
              if (bill) {
                  db.run("UPDATE bill SET water_bill = ?, electricity_bill = ? WHERE room_id = ? AND month = ?",
                      [waterBill, electricBill, room_id, month],
                      function (err) {
                          if (err) return res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตค่าน้ำ/ค่าไฟ" });
                          res.json({ success: true, message: "อัปเดตค่าน้ำ/ค่าไฟสำเร็จ" });
                      }
                  );
              } else {
                  db.run("INSERT INTO bill (bill_id, room_id, month, water_bill, electricity_bill) VALUES (?, ?, ?, ?, ?)",
                      [newBillID, room_id, month, waterBill, electricBill],
                      function (err) {
                          if (err) return res.status(500).json({ message: "เกิดข้อผิดพลาดในการเพิ่มบิลใหม่" });
                          res.json({ success: true, message: "เพิ่มบิลและบันทึกค่าน้ำ/ค่าไฟสำเร็จ" });
                      }
                  );
              }
          });
      });
  });
});

app.post('/api/send-bill', (req, res) => {
  const { room_id, month, water_units, electric_units, additional_expense } = req.body;

  console.log("✅ Received request to send bill:", { room_id, month, water_units, electric_units, additional_expense });

  if (!room_id || !month) {
      return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
  }

  // ✅ ตรวจสอบและแปลงค่าเดือน (Month Year -> YYYY-MM-DD)
  const monthParts = month.split(" ");
  if (monthParts.length !== 2) {
      console.error("❌ รูปแบบเดือนผิดพลาด:", month);
      return res.status(400).json({ success: false, message: "รูปแบบเดือนผิดพลาด" });
  }

  const monthName = monthParts[0]; // เช่น "December"
  const year = parseInt(monthParts[1]); // เช่น "2025"

  const monthMap = {
      "January": "01", "February": "02", "March": "03", "April": "04",
      "May": "05", "June": "06", "July": "07", "August": "08",
      "September": "09", "October": "10", "November": "11", "December": "12"
  };

  const monthNum = monthMap[monthName];
  if (!monthNum) {
      console.error("❌ ชื่อเดือนผิดพลาด:", monthName);
      return res.status(400).json({ success: false, message: "ไม่พบชื่อเดือนที่ถูกต้อง" });
  }

  // ✅ ดึงข้อมูลหอพักเพื่อดู `bill_due_date`
  db.get(`
      SELECT c.contract_id, r.tenant_ID, r.dormitory_id, c.rent_fee, c.water_per_unit, c.electric_per_unit, d.bill_due_date
      FROM room r
      LEFT JOIN contract c ON r.room_id = c.room_id
      LEFT JOIN dormitory d ON r.dormitory_id = d.dormitory_id
      WHERE r.room_id = ?
  `, [room_id], (err, contract) => {
      if (err || !contract) {
          console.error("❌ ไม่พบ contract_id หรือ tenant_ID:", err);
          return res.status(500).json({ success: false, message: "ไม่พบข้อมูลสัญญาสำหรับห้องนี้" });
      }

      const { contract_id, tenant_ID, dormitory_id, rent_fee, water_per_unit, electric_per_unit, bill_due_date } = contract;
      if (!bill_due_date) {
          console.error("❌ ไม่มีค่ากำหนดชำระใน dormitory");
          return res.status(500).json({ success: false, message: "ไม่พบข้อมูลวันกำหนดชำระ" });
      }

      const paymentDueDate = `${year}-${monthNum}-${String(bill_due_date).padStart(2, "0")}`;
      console.log("✅ คำนวณ Payment Due Date:", paymentDueDate);

      const water_bill = water_units;
      const electric_bill = electric_units;

      db.get("SELECT bill_id FROM bill WHERE room_id = ? AND month = ?", [room_id, month], (err, bill) => {
          if (err) {
              console.error("❌ Error finding bill:", err);
              return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการค้นหาใบแจ้งหนี้" });
          }

          if (!bill) {
              console.warn("⚠️ ไม่พบบิล กำลังสร้างบิลใหม่...");

              generateBillID((newBillID) => {
                  console.log("🆕 Generating New Bill ID:", newBillID);
                  db.run("INSERT INTO bill (bill_id, room_id, contract_id, month, rent_fee, water_bill, electricity_bill, additional_expenses, fine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                      [newBillID, room_id, contract_id, month, rent_fee, water_bill, electric_bill, additional_expense, 0],
                      function (err) {
                          if (err) {
                              console.error("❌ Error inserting new bill:", err);
                              return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการสร้างบิลใหม่" });
                          }

                          console.log("✅ สร้างบิลใหม่สำเร็จ:", newBillID);
                          createPayment(newBillID, room_id, tenant_ID, paymentDueDate, res);
                      }
                  );
              });
          } else {
              console.log("✅ พบ bill_id:", bill.bill_id);

              db.run("UPDATE bill SET water_bill = ?, electricity_bill = ?, additional_expenses = additional_expenses + ? WHERE bill_id = ?",
                  [water_bill, electric_bill, additional_expense, bill.bill_id],
                  function (err) {
                      if (err) {
                          console.error("❌ Error updating bill:", err);
                          return res.status(500).json({ success: false, message: "ไม่สามารถอัปเดตบิลได้" });
                      }

                      createPayment(bill.bill_id, room_id, tenant_ID, paymentDueDate, res);
                  }
              );
          }
      });
  });
});

//End bills usecase 1 แจ้งค่าเช่า----------------------------------------------------------------------------------------------------

// Route: Owner search tenant history
app.get("/search-history", (req, res) => {
  const searchQuery = req.query.query;

  if (!searchQuery) {
    return res.render("historyOwner", { tenant: null, history: [], owner: req.session.owner, error: null });
  }

  const tenantQuery = `
      SELECT * FROM tenant 
      WHERE tenant_username = ? OR email = ? OR (firstName || ' ' || lastName) = ?
  `;

  db.get(tenantQuery, [searchQuery, searchQuery, searchQuery], (err, tenant) => {
    if (err) return res.render("historyOwner", { tenant: null, history: [], owner: req.session.owner, error: "Error fetching tenant data." });

    const fetchHistory = (tenantData) => {
      if (!tenantData) return res.render("historyOwner", { tenant: null, history: [], owner: req.session.owner, error: "Tenant or room not found!" });

      const historyQuery = `
        SELECT bill.*, payment.bill_status 
        FROM bill 
        LEFT JOIN payment ON bill.bill_id = payment.bill_id
        WHERE bill.room_id IN (SELECT room_id FROM room WHERE tenant_ID = ?)
      `;

      db.all(historyQuery, [tenantData.tenant_ID], (err, history) => {
        if (err) return res.render("historyOwner", { tenant: tenantData, history: [], owner: req.session.owner, error: "Error fetching rental history." });

        history.forEach(record => {
          console.log("Bill Status:", record.bill_status);
          if (record.bill_status === "0") {
            record.status_text = "❌ ค้างชำระ";
          } else if (record.bill_status === "1") {
            record.status_text = "✅ ชำระแล้ว";
          } else if (record.bill_status === "2") {
            record.status_text = "⏳ กำลังดำเนินการ";
          } else {
            record.status_text = "❓ ไม่ทราบสถานะ";
          }
        });

        res.render("historyOwner", { tenant: tenantData, history, owner: req.session.owner, error: null });
      });
    };

    if (!tenant) {
      const roomQuery = `
        SELECT tenant.* FROM room 
        JOIN tenant ON room.tenant_ID = tenant.tenant_ID
        WHERE room.room_id = ?
      `;
      db.get(roomQuery, [searchQuery], (err, roomTenant) => {
        if (err) return res.render("historyOwner", { tenant: null, history: [], owner: req.session.owner, error: "Error fetching tenant by room ID." });
        fetchHistory(roomTenant);
      });
    } else {
      fetchHistory(tenant);
    }
  });
});

app.get("/tenant-history", (req, res) => {
  const tenantID = req.session.user?.id; // Get tenantID from session

  if (!tenantID) {
    return res.send("You must be logged in to view your history.");
  }

  const tenantQuery = `SELECT * FROM tenant WHERE tenant_ID = ?;`
  const historyQuery = 
      `SELECT bill.*, 
              payment.bill_status 
       FROM bill 
       LEFT JOIN payment ON bill.bill_id = payment.bill_id
       WHERE bill.room_id IN (SELECT room_id FROM room WHERE tenant_ID = ?)
  ;`

  db.get(tenantQuery, [tenantID], (err, tenant) => {
    if (err) return res.send("Error fetching tenant data.");
    if (!tenant) return res.send("Tenant not found!");

    db.all(historyQuery, [tenantID], (err, history) => {
      if (err) return res.send("Error fetching rental history.");
    
      console.log("History Data:", history); // ตรวจสอบข้อมูลทั้งหมด
    
      history.forEach(record => {
        console.log("Bill Status:", record.bill_status); // ตรวจสอบค่า bill_status
        
        if (record.bill_status === "0") {
          record.status_text = "❌ ค้างชำระ";
        } else if (record.bill_status === "1") {
          record.status_text = "✅ ชำระแล้ว";
        } else if (record.bill_status === "2") {
          record.status_text = "⏳ กำลังดำเนินการ";
        } else {
          record.status_text = "❓ ไม่ทราบสถานะ";
        }
      });
    
      res.render("history", { tenant, history, user: req.session.user });
    });    
  });
});

app.get('/BillStatus', (req, res) => {
  res.render('BillStatus', {owner:req.session.owner})
})

app.get('/ReserveRoom', (req, res) => {
  res.render('ReserveRoom', {owner:req.session.owner})
})

// ✅ ดึงข้อมูลห้องทั้งหมด
app.get('/api/rooms', (req, res) => {
  const { dormitory_id, floor, room_id } = req.query;

  console.log("🔍 ค้นหาด้วยพารามิเตอร์:", { dormitory_id, floor, room_id });

  let query = `
      SELECT r.room_id, r.dormitory_id, r.tenant_ID, r.floor_number,
             rt.room_type_name, rt.price, 
             t.firstName, t.lastName, t.telephone,
             ts.room_status, ts.tenant_status, ts.bill_status, ts.tenant_picture
      FROM room r
      LEFT JOIN room_type rt ON r.room_type_id = rt.room_type_id
      LEFT JOIN tenant t ON r.tenant_ID = t.tenant_ID
      LEFT JOIN tenant_status ts ON r.tenant_ID = ts.tenant_ID
      WHERE 1=1
  `;

  const params = [];

  // ✅ ถ้าเลือกตึก
  if (dormitory_id && dormitory_id !== "--เลือกตึก--") {
      query += ` AND r.dormitory_id = ?`;
      params.push(dormitory_id);
  }

  // ✅ ถ้าเลือกชั้น (ใช้ floor_number แทน SUBSTR)
  if (floor && floor !== "--เลือกชั้น--") {
      query += ` AND r.floor_number = ?`;
      params.push(floor);
  }

  // ✅ ถ้าค้นหาหมายเลขห้อง
  if (room_id && room_id.trim() !== "") {
      query += ` AND r.room_id LIKE ?`;
      params.push(`%${room_id}%`);
  }

  query += ` ORDER BY r.dormitory_id, r.floor_number, r.room_id`;

  console.log("🔍 Query:", query);
  console.log("🔍 Params:", params);

  db.all(query, params, (err, rooms) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          res.status(500).json({ error: err.message });
          return;
      }

      console.log(`✅ พบ ${rooms.length} ห้อง`);

      let groupedRooms = {};
      rooms.forEach(room => {
          let floor = room.floor_number; // ใช้ floor_number แทนการ substring
          if (!groupedRooms[floor]) {
              groupedRooms[floor] = [];
          }
          groupedRooms[floor].push(room);
      });

      res.json(groupedRooms);
  });
});

app.get('/api/dormitories', (req, res) => {
  const query = "SELECT dormitory_id, dormitory_name FROM dormitory";

  db.all(query, [], (err, rows) => {
      if (err) {
          console.error("❌ Error fetching dormitories:", err);
          res.status(500).json({ error: "Database error" });
          return;
      }
      console.log("📡 Sending dormitories:", rows); // ✅ Debugging
      res.json(rows);
  });
});

app.get('/api/floors', (req, res) => {
  const { dormitory_id } = req.query;
  let query = 'SELECT DISTINCT floor_number AS floor FROM room';
  const params = [];

  if (dormitory_id) {
      query += ' WHERE dormitory_id = ?';
      params.push(dormitory_id);
  }
  query += ' ORDER BY floor_number;';

  db.all(query, params, (err, rows) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          res.status(500).json({ error: err.message });
          return;
      }
      res.json(rows);
  });
});

// ✅ เพิ่ม route ใหม่สำหรับดึงห้องว่าง
app.get('/api/vacant-rooms', (req, res) => {
  const { dormitory_id, floor } = req.query;

  let query = `
      SELECT room_id 
      FROM room 
      WHERE dormitory_id = ? 
      AND floor_number = ? 
      AND tenant_ID IS NULL
  `;

  const params = [dormitory_id, floor];

  db.all(query, params, (err, rooms) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          res.status(500).json({ error: err.message });
          return;
      }

      console.log(`✅ พบ ${rooms.length} ห้องว่าง`);
      res.json(rooms);
  });
});

// ✅ บันทึกข้อมูลผู้เช่าและอัปเดตห้อง
app.post("/api/assign-room", (req, res) => {
  const {
      firstName, lastName, roomId, roomTypeId, // เพิ่ม roomTypeId
      tenantFirstName, tenantLastName, dormitoryId, floorNumber,
      userCitizenId, userAddress, contractStartDate, contractEndDate,
      contractMonth, rentFee, warranty, electricMeterNumber,
      waterMeterNumber, electricPerUnit, waterPerUnit, extraCondition
  } = req.body;

  // สร้าง contract_id (ตัวอย่างใช้ timestamp)
  const contractId = `C${Date.now()}`;

  // ตรวจสอบความถูกต้องของข้อมูลผู้เช่า
  const query = `
      SELECT tenant_ID 
      FROM tenant 
      WHERE TRIM(LOWER(firstName)) = TRIM(LOWER(?)) 
      AND TRIM(LOWER(lastName)) = TRIM(LOWER(?))
  `;

  db.get(query, [firstName, lastName], (err, tenant) => {
      if (err) {
          console.error("❌ Database Error:", err.message);
          return res.status(500).json({ error: "เกิดข้อผิดพลาดในการค้นหาข้อมูล", errorDetail: err.message });
      }

      if (!tenant) {
          console.log("ค้นหาด้วย:", { firstName, lastName });
          return res.status(404).json({ error: "ไม่พบข้อมูลผู้เช่า", message: "กรุณาตรวจสอบชื่อและนามสกุลอีกครั้ง" });
      }

      // ตรวจสอบสถานะห้อง
      const checkRoomQuery = `
          SELECT tenant_ID 
          FROM room 
          WHERE room_id = ? AND tenant_ID IS NULL
      `;

      db.get(checkRoomQuery, [roomId], (err, room) => {
          if (err) {
              console.error("❌ Database Error:", err.message);
              return res.status(500).json({ error: "เกิดข้อผิดพลาดในการตรวจสอบห้อง", errorDetail: err.message });
          }

          if (!room) {
              return res.status(400).json({ error: "ห้องไม่ว่าง", message: "กรุณาเลือกห้องว่าง" });
          }

          // อัปเดตห้องด้วย tenant_ID และ room_type_id
          const updateRoomQuery = `UPDATE room SET tenant_ID = ?, room_type_id = ? WHERE room_id = ?`;
          db.run(updateRoomQuery, [tenant.tenant_ID, roomTypeId, roomId], (err) => {
              if (err) {
                  console.error("❌ Database Error:", err.message);
                  return res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตห้อง", errorDetail: err.message });
              }

              // อัปเดตสถานะผู้เช่า
              const updateTenantStatusQuery = `
                  UPDATE tenant_status 
                  SET room_status = 'เช่าอยู่', tenant_status = 'ปกติ', bill_status = 'รอชำระ' 
                  WHERE tenant_ID = ?
              `;
              db.run(updateTenantStatusQuery, [tenant.tenant_ID], (err) => {
                  if (err) {
                      console.error("❌ Database Error:", err.message);
                      return res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตสถานะผู้เช่า", errorDetail: err.message });
                  }

                  // INSERT ข้อมูลลงในตาราง contract
                  const insertContractQuery = `
                      INSERT INTO contract (
                          contract_id, tenantFirstName, tenantLastName, dormitory_id, floor_number, room_id,
                          user_citizen_id, user_address, contract_start_date, contract_end_date,
                          contract_month, rent_fee, warranty, electric_meter_number, water_meter_number,
                          electric_per_unit, water_per_unit, extra_condition
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `;

                  const values = [
                      contractId, tenantFirstName, tenantLastName, dormitoryId, floorNumber, roomId,
                      userCitizenId, userAddress, contractStartDate, contractEndDate, contractMonth,
                      rentFee, warranty, electricMeterNumber, waterMeterNumber, electricPerUnit,
                      waterPerUnit, extraCondition // signature เป็น NULL
                  ];

                  db.run(insertContractQuery, values, function (err) {
                      if (err) {
                          console.error("❌ Database Error:", err.message);
                          return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลสัญญา", errorDetail: err.message });
                      }

                      res.json({
                          success: true,
                          message: "จัดสรรห้องสำเร็จ และบันทึกข้อมูลสัญญาเรียบร้อยแล้ว",
                          tenantId: tenant.tenant_ID,
                          contractId: this.lastID
                      });
                  });
              });
          });
      });
  });
});

app.post('/api/cancel-payment', (req, res) => {
  const { room_id } = req.body;

  db.run(`UPDATE payment SET bill_status = '2' WHERE room_id = ?`, [room_id], function (err) {
      if (err) {
          console.error("❌ Error canceling payment:", err.message);
          return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการยกเลิกการชำระ" });
      }
      res.json({ success: true, message: "ยกเลิกการชำระสำเร็จ" });
  });
});

app.get('/api/bill-status', (req, res) => {
  const { status } = req.query; // รับ status จาก query parameter
  let query = `
      SELECT r.room_id, r.dormitory_id, 
             COALESCE(p.bill_status, 'ไม่มีบิล') AS bill_status, 
             r.floor_number AS floor
      FROM room r
      LEFT JOIN payment p ON r.room_id = p.room_id
      WHERE 1=1
  `;

  const params = [];

  // กรองตามสถานะถ้ามี
  if (status) {
      // แปลงสถานะจากข้อความเป็นค่าในฐานข้อมูล
      let statusValue;
      switch (status) {
          case 'ชำระแล้ว': statusValue = '1'; break;
          case 'รอการตรวจสอบ': statusValue = '2'; break;
          case 'ค้างชำระ': statusValue = '0'; break;
          case 'บิลไม่สมบูรณ์': statusValue = '3'; break;
          default: statusValue = null;
      }
      if (statusValue !== null) {
          query += ` AND COALESCE(p.bill_status, 'ไม่มีบิล') = ?`;
          params.push(statusValue);
      }
  }

  query += ` ORDER BY r.dormitory_id ASC, r.floor_number ASC, r.room_id ASC;`;

  db.all(query, params, (err, rows) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).json({ error: err.message });
      }

      const bills = rows.map(row => {
          let displayStatus;
          switch (row.bill_status.toString()) {
              case '1': displayStatus = 'ชำระแล้ว'; break;
              case '2': displayStatus = 'รอการตรวจสอบ'; break;
              case '0': displayStatus = 'ค้างชำระ'; break;
              case '3': displayStatus = 'บิลไม่สมบูรณ์'; break;
              default: displayStatus = 'ไม่มีบิล';
          }

          return {
              room_id: row.room_id,
              dormitory_id: row.dormitory_id,
              bill_status: displayStatus,
              floor: row.floor
          };
      });

      console.log("🔍 ข้อมูลที่ส่งกลับ:", bills); // เพิ่ม log เพื่อตรวจสอบ
      res.json(bills);
  });
});

// ✅ ดึงรอบบิลทั้งหมดจากฐานข้อมูล
app.get('/api/billing-cycles', (req, res) => {
  db.all("SELECT DISTINCT month FROM bill ORDER BY month ASC;", [], (err, rows) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).json({ error: err.message });
      }
      const months = rows.map(row => row.month);
      res.json(months);
  });
});

// ✅ ดึงบิลตามเดือนและสถานะที่เลือก
app.get('/api/bills', (req, res) => {
  const { month, status } = req.query;
  let query = "SELECT room_id, bill_status FROM bill WHERE month = ?";
  const params = [month];

  if (status) {
      query += " AND bill_status = ?";
      params.push(status);
  }

  db.all(query, params, (err, rows) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).json({ error: err.message });
      }
      res.json(rows);
  });
});

app.post('/api/update-room-status', (req, res) => {
  const { room_id, tenant_ID } = req.body;

  const query = "UPDATE room SET tenant_ID = ? WHERE room_id = ?";

  db.run(query, [tenant_ID, room_id], function (err) {
      if (err) {
          console.error("Error updating room status:", err);
          res.status(500).send({ success: false, message: "เกิดข้อผิดพลาดในการอัปเดตสถานะห้อง" });
      } else {
          res.send({ success: true, message: "อัปเดตสถานะห้องสำเร็จ" });
      }
  });
});

app.post('/api/remove-tenant', (req, res) => {
  const { room_id } = req.body;

  if (!room_id) {
      return res.status(400).json({ error: "Room ID is required" });
  }

  db.serialize(() => {
      // เริ่ม transaction
      db.run("BEGIN TRANSACTION");

      // 1. ตรวจสอบว่ามี tenant_ID ใน room หรือไม่
      db.get("SELECT tenant_ID FROM room WHERE room_id = ?", [room_id], (err, row) => {
          if (err) {
              db.run("ROLLBACK");
              console.error("❌ Error checking room:", err.message);
              return res.status(500).json({ error: "Failed to check room", details: err.message });
          }
          if (!row || !row.tenant_ID) {
              db.run("ROLLBACK");
              return res.status(400).json({ error: `ห้อง ${room_id} ไม่มีผู้เช่าอยู่แล้ว` });
          }

          const tenantId = row.tenant_ID;

          // 2. ลบข้อมูลจากตาราง contract ที่เกี่ยวข้องกับ room_id
          const deleteContractQuery = "DELETE FROM contract WHERE room_id = ?";
          db.run(deleteContractQuery, [room_id], (err) => {
              if (err) {
                  db.run("ROLLBACK");
                  console.error("❌ Error deleting contract:", err.message);
                  return res.status(500).json({ error: "Failed to delete contract", details: err.message });
              }

              // 3. อัปเดต room โดยตั้ง tenant_ID เป็น NULL
              const updateRoomQuery = "UPDATE room SET tenant_ID = NULL WHERE room_id = ?";
              db.run(updateRoomQuery, [room_id], (err) => {
                  if (err) {
                      db.run("ROLLBACK");
                      console.error("❌ Error updating room:", err.message);
                      return res.status(500).json({ error: "Failed to remove tenant", details: err.message });
                  }

                  // 4. ลบข้อมูลจาก tenant_status
                  const deleteTenantStatusQuery = "DELETE FROM tenant_status WHERE tenant_ID = ?";
                  db.run(deleteTenantStatusQuery, [tenantId], (err) => {
                      if (err) {
                          db.run("ROLLBACK");
                          console.error("❌ Error deleting tenant_status:", err.message);
                          return res.status(500).json({ error: "Failed to delete tenant status", details: err.message });
                      }

                      // ถ้าทุกอย่างสำเร็จ Commit transaction
                      db.run("COMMIT", () => {
                          console.log(`✅ Tenant removed from room ${room_id}`);
                          return res.json({ message: `ผู้เช่าในห้อง ${room_id} ถูกลบเรียบร้อยแล้ว พร้อมสัญญาที่เกี่ยวข้อง` });
                      });
                  });
              });
          });
      });
  });
});

app.get('/bill-detail', (req, res) => {
  const floor = req.query.floor; // ดึงค่า floor จาก query string

  if (!floor) {
      return res.status(400).send('Floor is required');
  }

  // สอบถามฐานข้อมูลเพื่อดึงรายละเอียดบิลของชั้นนั้น
  const query = `
      SELECT r.room_id, r.dormitory_id, 
             COALESCE(ts.bill_status, 'ไม่มีบิล') AS bill_status, 
             t.firstName, t.lastName, t.telephone
      FROM room r
      LEFT JOIN tenant_status ts ON r.tenant_ID = ts.tenant_ID
      LEFT JOIN tenant t ON r.tenant_ID = t.tenant_ID
      WHERE SUBSTR(r.room_id, 2, 1) = ?
      ORDER BY r.room_id ASC;
  `;

  db.all(query, [floor], (err, bills) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).send('Error loading bill details');
      }

      // เรนเดอร์หน้า BillDetail.ejs โดยส่งข้อมูล bills และ floor
      res.render('BillDetail', { bills: bills, floor: floor });
  });
});

app.post('/api/create-bill', async (req, res) => {
  const { room_id, month, additional_expense, water_units, electric_units } = req.body;

  try {
      // ตรวจสอบว่ามี bill_id สำหรับ room_id นี้หรือไม่
      const billQuery = `SELECT bill_id FROM bill WHERE room_id = ? AND month = ?`;
      const billResult = await db.get(billQuery, [room_id, month]);

      let bill_id;

      if (billResult) {
          // ถ้ามี bill_id แล้ว ให้อัปเดตข้อมูลบิลแทน
          bill_id = billResult.bill_id;
          const updateQuery = `
              UPDATE bill 
              SET additional_expenses = additional_expenses + ?
              WHERE bill_id = ?`;
          await db.run(updateQuery, [additional_expense, bill_id]);
      } else {
          // ถ้ายังไม่มี bill_id ให้สร้าง bill_id ใหม่
          const countQuery = `SELECT COUNT(*) AS count FROM bill`;
          const countResult = await db.get(countQuery);
          const newBillNumber = countResult.count + 1;
          bill_id = `B${String(newBillNumber).padStart(3, '0')}`;

          // คำนวณค่าน้ำ-ค่าไฟ
          const contractQuery = `SELECT electric_per_unit, water_per_unit FROM contract WHERE room_id = ?`;
          const contract = await db.get(contractQuery, [room_id]);

          const water_bill = water_units * contract.water_per_unit;
          const electricity_bill = electric_units * contract.electric_per_unit;

          // แทรกข้อมูลบิลใหม่
          const insertBillQuery = `
              INSERT INTO bill (bill_id, room_id, month, rent_fee, water_bill, electricity_bill, additional_expenses, fine)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
          await db.run(insertBillQuery, [bill_id, room_id, month, 0, water_bill, electricity_bill, additional_expense, 0]);

          // สร้าง payment_id ใหม่
          const countPaymentQuery = `SELECT COUNT(*) AS count FROM payment`;
          const countPaymentResult = await db.get(countPaymentQuery);
          const newPaymentNumber = countPaymentResult.count + 1;
          const payment_id = `P${String(newPaymentNumber).padStart(3, '0')}`;

          // ดึงวันกำหนดชำระจาก dormitory table
          const dormQuery = `SELECT bill_due_date FROM dormitory WHERE room_id = ?`;
          const dormResult = await db.get(dormQuery, [room_id]);
          const bill_due_date = `2025-${month.split(' ')[1]}-${dormResult.bill_due_date}`;

          // เพิ่มข้อมูล payment
          const insertPaymentQuery = `
              INSERT INTO payment (payment_id, room_id, bill_id, bill_status, payment_due_date)
              VALUES (?, ?, ?, ?, ?)`;
          await db.run(insertPaymentQuery, [payment_id, room_id, bill_id, '0', bill_due_date]);
      }

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', bill_id });
  } catch (error) {
      console.error('❌ Error:', error);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด', error });
  }
});

app.get('/BillDetail', (req, res) => {
  console.log("Session Owner:", req.session.owner); // ✅ Log ค่า owner
  const roomId = req.query.room_id;  // ✅ รับค่า room_id จาก URL
  
  if (!roomId) {
      console.error("❌ Room ID is missing");
      return res.status(400).send('Room ID is required');  // ✅ แสดง error ถ้าไม่มี room_id
  }

  console.log("✅ Received Room ID:", roomId);  // ✅ Log ค่า room_id เพื่อตรวจสอบว่ามีค่าถูกส่งมาหรือไม่

  const query = `
      SELECT b.bill_id, b.contract_id, b.rent_fee, b.water_bill, b.electricity_bill, 
             COALESCE(b.additional_expenses, 0) AS additional_expenses, 
             COALESCE(b.fine, 0) AS fine,
             b.month AS bill_month, 
             c.water_per_unit, c.electric_per_unit, 
             t.firstName, t.lastName, t.telephone,
             COALESCE(p.bill_status, 'ไม่มีบิล') AS bill_status,
             p.receipt_pic
      FROM bill b
      LEFT JOIN contract c ON b.contract_id = c.contract_id
      LEFT JOIN room r ON b.room_id = r.room_id
      LEFT JOIN tenant t ON r.tenant_ID = t.tenant_ID
      LEFT JOIN payment p ON r.room_id = p.room_id
      WHERE b.room_id = ?
      ORDER BY 
          CAST(SUBSTR(b.month, -4) AS INTEGER) DESC,
          CASE 
              WHEN INSTR(b.month, 'January') > 0 THEN 1
              WHEN INSTR(b.month, 'February') > 0 THEN 2
              WHEN INSTR(b.month, 'March') > 0 THEN 3
              WHEN INSTR(b.month, 'April') > 0 THEN 4
              WHEN INSTR(b.month, 'May') > 0 THEN 5
              WHEN INSTR(b.month, 'June') > 0 THEN 6
              WHEN INSTR(b.month, 'July') > 0 THEN 7
              WHEN INSTR(b.month, 'August') > 0 THEN 8
              WHEN INSTR(b.month, 'September') > 0 THEN 9
              WHEN INSTR(b.month, 'October') > 0 THEN 10
              WHEN INSTR(b.month, 'November') > 0 THEN 11
              WHEN INSTR(b.month, 'December') > 0 THEN 12
              ELSE 0
          END DESC
      LIMIT 1;
  `;

  db.get(query, [roomId], (err, bill) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).send('Error loading bill details');
      }

      if (!bill) {
          console.warn("⚠️ ไม่พบข้อมูลบิลของห้อง:", roomId);
          return res.render('BillDetail', {
              room_id: roomId, 
              contract: { room_id: roomId, bill_status: 'ไม่มีบิล', firstName: 'ไม่ระบุ', lastName: '', telephone: 'ไม่มีข้อมูล' },
              bill_id: null, contract_id: null,
              waterBill: 0, electricBill: 0, fine: 0, additionalExpenses: 0, total: 0,
              waterUnits: 0, electricUnits: 0, receiptPic: null,
              billMonth: 'ไม่พบข้อมูล',
              owner: req.session.owner
          });
      }

      console.log("✅ Loaded Bill Details:", bill);

      res.render('BillDetail', {
          room_id: roomId,
          contract: { ...bill, bill_status: bill.bill_status },
          bill_id: bill.bill_id,
          contract_id: bill.contract_id,
          waterBill: (bill.water_per_unit || 10) * (bill.water_bill || 0),
          electricBill: (bill.electric_per_unit || 5) * (bill.electricity_bill || 0),
          fine: bill.fine || 0,
          additionalExpenses: bill.additional_expenses || 0,
          total: (bill.rent_fee || 0) + (bill.water_per_unit || 10) * (bill.water_bill || 0) + 
                 (bill.electric_per_unit || 5) * (bill.electricity_bill || 0) + 
                 bill.additional_expenses + bill.fine,
          waterUnits: bill.water_bill || 0,
          electricUnits: bill.electricity_bill || 0,
          receiptPic: bill.receipt_pic || null,
          billMonth: bill.bill_month || 'ไม่พบข้อมูล',
          owner: req.session.owner
      });
  });
});

app.get('/ContractDetail', (req, res) => {
  const roomId = req.query.room_id;

  if (!roomId) {
      return res.status(400).send('Room ID is required');
  }

  const query = `
      SELECT * 
      FROM contract 
      WHERE room_id = ?
      ORDER BY contract_start_date DESC
      LIMIT 1
  `;

  db.get(query, [roomId], (err, contract) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          return res.status(500).send('Error loading contract details');
      }

      // ส่งข้อมูลไปยัง EJS ไม่ว่าจะมีสัญญาหรือไม่
      res.render('ContractDetail', {
          contract: contract || null, // ถ้าไม่มี contract จะส่ง null
          room_id: roomId,
          owner:req.session.owner
          // activePage: 'TenentStatus'
      });
  });
});

app.get("/api/make-payment", (req, res) => {
  const room_id = req.query.room_id;

  if (!room_id) {
      return res.status(400).send("ไม่พบข้อมูลห้อง");
  }

  db.get("SELECT bill_id FROM bill WHERE room_id = ? ORDER BY month DESC LIMIT 1", [room_id], (err, bill) => {
      if (err || !bill) {
          console.error("❌ ไม่พบใบแจ้งหนี้สำหรับห้องนี้:", err);
          return res.status(500).send("ไม่พบใบแจ้งหนี้ กรุณาสร้างบิลก่อน");
      }

      const bill_id = bill.bill_id;

      db.run("UPDATE payment SET bill_status = 1 WHERE bill_id = ?", [bill_id], function (err) {
          if (err) {
              console.error("❌ เกิดข้อผิดพลาดในการอัปเดตสถานะบิล:", err);
              return res.status(500).send("ไม่สามารถอัปเดตสถานะบิลได้");
          }

          // หลังจากอัปเดตเสร็จให้ Redirect กลับมาที่หน้า BillDetail
          res.redirect(`/BillDetail?room_id=${room_id}`);
      });
  });
});

app.get('/api/room-types', (req, res) => {
  const query = `SELECT room_type_id, room_type_name, price FROM room_type ORDER BY room_type_name;`;

  db.all(query, [], (err, rows) => {
      if (err) {
          console.error("❌ Database Query Error:", err.message);
          res.status(500).json({ error: err.message });
          return;
      }
      res.json(rows);
  });
});

app.get('/tenentStatus', (req, res) => {
  res.render('TenentStatus', { owner: req.session.owner});
});

// Route:Owner Logout
app.get('/logoutOwner', (req, res) => {
  req.session.destroy(() => {

    res.redirect('/owner');
  });
});

app.listen(port, () => {
  console.log(`Starting node.js at port ${port}`);
});

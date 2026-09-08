# SMT Material Control System

🚀 **Sistem Kontrol Material SMT** dengan dukungan scanner barcode dan manajemen inventory real-time.

## 📋 Fitur Utama

- ✅ **Dashboard** dengan statistics dan tabel material inventory
- ✅ **Material Input** untuk mencatat material masuk (Superadmin only)
- ✅ **Material Output** untuk mencatat penggunaan material dengan pengurangan otomatis
- ✅ **Transaction Records** dengan filter dan search
- ✅ **Role-based Authentication** (Superadmin & Admin)
- ✅ **Scanner-optimized Input** untuk semua field ID material
- ✅ **Responsive Design** dengan animasi smooth

## 🛠️ Technology Stack

- **Backend**: Node.js + Express
- **Database**: MySQL (XAMPP) - Compatible dengan Oracle untuk migrasi
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Authentication**: Session-based dengan bcrypt

## 📦 Installation

### Prerequisites

- Node.js (v14 atau lebih baru)
- XAMPP dengan MySQL
- Barcode Scanner (opsional, field juga bisa input manual)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Setup Database

1. Buka XAMPP dan start MySQL
2. Buka phpMyAdmin (http://localhost/phpmyadmin)
3. Import database schema:
   - Buka file `database/schema.sql`
   - Copy semua isi file
   - Paste di SQL tab di phpMyAdmin
   - Klik "Go" untuk execute

### Step 3: Configure Environment

File `.env` sudah dibuat dengan konfigurasi default XAMPP:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=smt_material_control
PORT=3000
```

Jika konfigurasi MySQL berbeda, edit file `.env` sesuai kebutuhan.

### Step 4: Create Default Users

Default users sudah disertakan di schema SQL dengan password hash yang perlu digenerate:

**Untuk membuat hash password baru**, jalankan script berikut:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10, (err, hash) => console.log(hash));"
```

Kemudian update hash di database atau gunakan default users yang sudah dibuat.

## 🚀 Running the Application

```bash
npm start
```

Server akan berjalan di: **http://localhost:3000**

## 👥 Default Login Credentials

### Superadmin
- Username: `superadmin`
- Password: `admin123`
- Akses: Semua fitur (Dashboard, Input, Output, Records)

### Admin
- Username: `admin`
- Password: `admin123`
- Akses: Material Output dan Records saja

## 📱 Using the Application

### 1. Material Input (Superadmin Only)

1. Login sebagai superadmin
2. Klik "Material Input" di sidebar
3. Scan atau ketik Material ID
4. Isi nama material
5. Pilih quantity (preset atau custom)
6. Klik "Input Material"

**Catatan**: Jika Material ID sudah ada, quantity akan ditambahkan otomatis.

### 2. Material Output

1. Login (Superadmin atau Admin)
2. Klik "Material Output" di sidebar
3. Scan Material ID
4. Material akan masuk ke daftar penggunaan
5. Tentukan quantity untuk setiap material
6. Klik "Konfirmasi Penggunaan"
7. Sistem otomatis mengurangi stok

### 3. Transaction Records

- Lihat semua history input/output
- Filter berdasarkan tipe (Input/Output)
- Search berdasarkan Material ID atau nama
- Pagination untuk data yang banyak

## 📁 Project Structure

```
SMT-Material-Control/
├── server/
│   ├── config/
│   │   └── database.js         # MySQL connection
│   ├── middleware/
│   │   └── auth.js             # Authentication
│   ├── routes/
│   │   ├── auth.js             # Login/logout
│   │   ├── materials.js        # Material CRUD
│   │   ├── transactions.js     # Input/output
│   │   └── dashboard.js        # Statistics
│   └── server.js               # Main server
├── public/
│   ├── css/
│   │   └── styles.css          # Styles & animations
│   ├── js/
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── material-input.js
│   │   ├── material-output.js
│   │   └── utils.js
│   ├── login.html
│   ├── dashboard.html
│   ├── material-input.html
│   ├── material-output.html
│   └── records.html
├── database/
│   └── schema.sql              # Database schema
├── .env                        # Environment config
└── package.json
```

## 🔧 Scanner Integration

Scanner barcode akan bekerja otomatis dengan aplikasi ini:

1. Scanner harus dikonfigurasi untuk **auto-enter** setelah scan
2. Field Material ID sudah dioptimasi untuk menerima input scanner
3. Field akan auto-focus dan auto-submit setelah scan

### Testing Scanner

Jika belum punya scanner, bisa test dengan:
1. Ketik manual Material ID di field scanner
2. Tekan Enter
3. Sistem akan memproses sama seperti scan

## 🔄 Database Migration (Future: MySQL → Oracle)

Aplikasi ini menggunakan standard SQL yang compatible dengan Oracle:

1. Semua query menggunakan prepared statements
2. Tidak ada MySQL-specific syntax
3. Auto-increment di MySQL bisa diganti dengan SEQUENCE di Oracle
4. Timestamp fields compatible dengan both databases

## 🎨 UI Features

- **Gradient Background** untuk login page
- **Animated Sidebar** dengan smooth transitions
- **Modern Cards** dengan shadows dan hover effects
- **Responsive Table** dengan pagination
- **Toast Notifications** untuk user feedback
- **Statistics Cards** dengan color coding
- **Scanner-optimized Input** dengan monospace font

## 🚨 Troubleshooting

### Database Connection Error

```
❌ Database connection failed
```

**Solusi**:
1. Pastikan MySQL di XAMPP sudah running
2. Check database name di `.env` = `smt_material_control`
3. Pastikan user/password MySQL benar (default XAMPP: root/kosong)

### Port Already in Use

```
Error: listen EADDRINUSE :::3000
```

**Solusi**:
1. Ubah PORT di `.env` menjadi port lain (misal 3001)
2. Atau stop aplikasi lain yang pakai port 3000

### Login Gagal

**Solusi**:
1. Pastikan database sudah di-import
2. Check tabel `users` ada data
3. Gunakan default credentials yang benar

## 📝 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/check` - Check session

### Materials
- `GET /api/materials` - Get all materials (with pagination)
- `GET /api/materials/:id` - Get material by ID
- `POST /api/materials` - Add material (input)
- `PUT /api/materials/:id` - Update material
- `DELETE /api/materials/:id` - Delete material

### Transactions
- `POST /api/transactions/output` - Record material usage
- `GET /api/transactions/history` - Get transaction history

### Dashboard
- `GET /api/dashboard/stats` - Get statistics

## 📄 License

ISC

## 👨‍💻 Developer Notes

- Password di-hash menggunakan bcrypt (10 rounds)
- Session timeout: 24 jam
- Pagination default: 10 items per page (dashboard), 20 items (records)
- Semua quantity dalam satuan "pcs" (pieces)

---

**Need Help?** Contact your system administrator.

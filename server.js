require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 5000;
const BACKEND_URL = process.env.BACKEND_URL || `http://127.0.0.1:${PORT}`;
const adminSessions = new Set();
function requireAdmin(req, res, next) {
    const token = req.headers["x-admin-token"];

    if (!token || !adminSessions.has(token)) {
        return res.status(403).json({
            message: "Admin access required"
        });
    }

    next();
}

// --------------------
// Middleware
// --------------------

app.use(cors());
app.use(express.json());


app.post("/api/admin/login", (req, res) => {
    const { pin } = req.body;

    if (pin === process.env.ADMIN_PIN) {
        const token = crypto.randomBytes(32).toString("hex");

        adminSessions.add(token);

        return res.json({
            success: true,
            message: "Admin login successful",
            token: token
        });
    }

    res.status(401).json({
        success: false,
        message: "Invalid admin PIN"
    });
});

const uploadsFolder = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder);
}

app.use("/uploads", express.static(uploadsFolder));


// --------------------
// Database
// --------------------

const db = new sqlite3.Database("./gallery.db");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS years (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER UNIQUE NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,

            FOREIGN KEY (year_id)
            REFERENCES years(id)
        )
    `);

});


// --------------------
// Multer configuration
// --------------------

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, uploadsFolder);
    },

    filename: (req, file, cb) => {

        const extension = path.extname(file.originalname);

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            extension;

        cb(null, uniqueName);
    }

});


const upload = multer({

    storage: storage,

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }

    }

});


// =====================================================
// GET ALL YEARS
// =====================================================

app.get("/api/years", (req, res) => {

    const query = `
        SELECT
            years.id,
            years.year,
            COUNT(photos.id) AS photoCount

        FROM years

        LEFT JOIN photos
        ON years.id = photos.year_id

        GROUP BY years.id

        ORDER BY years.year DESC
    `;

    db.all(query, [], (error, rows) => {

        if (error) {
            console.error(error);

            return res.status(500).json({
                message: "Failed to fetch years"
            });
        }

        res.json(rows);
    });

});


// =====================================================
// ADD NEW YEAR
// =====================================================

app.post("/api/years", requireAdmin, (req, res) => {

    const { year } = req.body;

    if (!year) {

        return res.status(400).json({
            message: "Year is required"
        });

    }

    const numericYear = Number(year);

    if (
        !Number.isInteger(numericYear) ||
        numericYear < 1900 ||
        numericYear > 2100
    ) {

        return res.status(400).json({
            message: "Please enter a valid year"
        });

    }

    const query = `
        INSERT INTO years (year)
        VALUES (?)
    `;

    db.run(query, [numericYear], function (error) {

        if (error) {

            if (error.message.includes("UNIQUE")) {

                return res.status(409).json({
                    message: "This year already exists"
                });

            }

            console.error(error);

            return res.status(500).json({
                message: "Failed to add year"
            });
        }

        res.status(201).json({
            id: this.lastID,
            year: numericYear,
            photoCount: 0
        });

    });

});

// =====================================================
// DELETE YEAR - ADMIN ONLY
// =====================================================

app.delete("/api/years/:id", requireAdmin, (req, res) => {

    const yearId = req.params.id;

    // First get all photos belonging to this year
    db.all(
        `SELECT filename FROM photos WHERE year_id = ?`,
        [yearId],
        (error, photos) => {

            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Database error"
                });
            }

            // Delete all physical image files
            photos.forEach(photo => {

                const filePath = path.join(
                    uploadsFolder,
                    photo.filename
                );

                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });

            // Delete photos from database
            db.run(
                `DELETE FROM photos WHERE year_id = ?`,
                [yearId],
                error => {

                    if (error) {
                        console.error(error);
                        return res.status(500).json({
                            message: "Failed to delete photos"
                        });
                    }

                    // Delete the year
                    db.run(
                        `DELETE FROM years WHERE id = ?`,
                        [yearId],
                        function (error) {

                            if (error) {
                                console.error(error);
                                return res.status(500).json({
                                    message: "Failed to delete year"
                                });
                            }

                            if (this.changes === 0) {
                                return res.status(404).json({
                                    message: "Year not found"
                                });
                            }

                            res.json({
                                message: "Year deleted successfully"
                            });
                        }
                    );
                }
            );
        }
    );
});


// =====================================================
// GET PHOTOS OF A PARTICULAR YEAR
// =====================================================

app.get("/api/photos/:yearId", (req, res) => {

    const yearId = req.params.yearId;

    const query = `
        SELECT
            photos.id,
            photos.filename,
            photos.original_name,
            years.year

        FROM photos

        INNER JOIN years
        ON photos.year_id = years.id

        WHERE photos.year_id = ?

        ORDER BY photos.id DESC
    `;

    db.all(query, [yearId], (error, rows) => {

        if (error) {

            console.error(error);

            return res.status(500).json({
                message: "Failed to fetch photos"
            });

        }

        const photos = rows.map(photo => ({
            ...photo,
             url:`${BACKEND_URL}/uploads/${photo.filename}` 
        }));

        res.json(photos);
    });

});

app.get("/api/photos/download/:id", (req, res) => {
    console.log("DOWNLOAD ROUTE HIT:", req.params.id);

    const photoId = req.params.id;

    db.get(
        `SELECT filename, original_name FROM photos WHERE id = ?`,
        [photoId],
        (error, photo) => {

            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Database error"
                });
            }

            if (!photo) {
                return res.status(404).json({
                    message: "Photo not found"
                });
            }

            const filePath = path.join(
                uploadsFolder,
                photo.filename
            );

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    message: "Image file not found"
                });
            }

            res.download(filePath, photo.original_name);
        }
    );
});

app.delete("/api/photos/:id", requireAdmin, (req, res) => {

    const photoId = req.params.id;

    const getPhotoQuery = `
        SELECT filename
        FROM photos
        WHERE id = ?
    `;

    db.get(getPhotoQuery, [photoId], (error, photo) => {

        if (error) {
            console.error(error);

            return res.status(500).json({
                message: "Database error"
            });
        }

        if (!photo) {
            return res.status(404).json({
                message: "Photo not found"
            });
        }

        const deleteQuery = `
            DELETE FROM photos
            WHERE id = ?
        `;

        db.run(deleteQuery, [photoId], function (error) {

            if (error) {
                console.error(error);

                return res.status(500).json({
                    message: "Failed to delete photo"
                });
            }

            const filePath = path.join(
                uploadsFolder,
                photo.filename
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            res.json({
                message: "Photo deleted successfully"
            });

        });

    });

});


// =====================================================
// UPLOAD MULTIPLE PHOTOS
// =====================================================

app.post(
    "/api/photos/:yearId",
    upload.array("photos", 50),
    (req, res) => {

        const yearId = req.params.yearId;

        if (!req.files || req.files.length === 0) {

            return res.status(400).json({
                message: "Please select at least one photo"
            });

        }

        const checkYearQuery = `
            SELECT id, year
            FROM years
            WHERE id = ?
        `;

        db.get(checkYearQuery, [yearId], (error, yearData) => {

            if (error) {

                return res.status(500).json({
                    message: "Database error"
                });

            }

            if (!yearData) {

                return res.status(404).json({
                    message: "Year not found"
                });

            }

            const insertQuery = `
                INSERT INTO photos
                (year_id, filename, original_name)
                VALUES (?, ?, ?)
            `;

            const uploadedPhotos = [];

            db.serialize(() => {

                const statement = db.prepare(insertQuery);

                req.files.forEach(file => {

                    statement.run(
                        yearId,
                        file.filename,
                        file.originalname,
                        function (error) {

                            if (error) {
                                console.error(error);
                                return;
                            }

                            uploadedPhotos.push({
                                id: this.lastID,
                                filename: file.filename,
                                original_name: file.originalname,
                                url:
                                     `${BACKEND_URL}/uploads/${file.filename}`
                            });

                        }
                    );

                });

                statement.finalize(() => {

                    res.status(201).json({
                        message: "Photos uploaded successfully",
                        photos: uploadedPhotos
                    });

                });

            });

        });

    }
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(400).json({
                message: "Each image must be less than 10 MB"
            });

        }

        return res.status(400).json({
            message: error.message
        });

    }

    if (error) {

        return res.status(400).json({
            message: error.message
        });

    }

    next();

});
// =====================================================
// DOWNLOAD PHOTO
// =====================================================




// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Gallery server running at http://localhost:${PORT}`
    );

});
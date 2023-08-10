import { v4 as uuidv4 } from 'uuid';
import ip from "ip";
import express from "express";
import path from "path";
import QRCode from 'qrcode';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const hostname = process.env.HOST || ip.address();
const port = Number(process.env.PORT) || 3000;
const baseImageDir = "images";

app.use(express.static(path.join(__dirname, baseImageDir)));

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

async function generateAndSaveURL(unit: string) {
    const newUuid: string = uuidv4();
    const head: string = 'http://';
    const URL: string = head + hostname + ":" + port + "/" + unit + "/" + newUuid;

    const [rows, fields] = await connection.execute(`INSERT INTO ${unit}_urls (token) VALUES (?)`, [newUuid]);

    const unitImageDir = path.join(__dirname, baseImageDir, unit);
    createDirectoryIfNotExists(unitImageDir);

    QRCode.toFile(path.join(unitImageDir, newUuid + ".png"), URL, function (err: any) {
        if (err) throw err;
    });

    return URL;
}

async function createTableIfNotExists(unit: string) {
    try {
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ${unit}_urls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token CHAR(36) NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                result INT DEFAULT 0
            )
        `);
        console.log(`Table '${unit}_urls' has been created or already exists.`);
    } catch (error) {
        console.error("Error creating table:", error);
    }
}

const createDirectoryIfNotExists = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
};

app.get('/init/:unit', async (req, res) => {
    const unit = req.params.unit;
    await createTableIfNotExists(unit);
    res.send(`Initialized or already exists for unit: ${unit}`);
});

app.get('/generate/:unit', async (req, res) => {
    const unit = req.params.unit;
    const generatedURL = await generateAndSaveURL(unit);
    console.log(`Generated URL for unit ${unit}: ${generatedURL}`);
    res.send(`Generated URL for unit ${unit}: ${generatedURL}`);
});

app.get('/:unit/:uuid', async (req, res) => {
    const unit = req.params.unit;
    const uuid = req.params.uuid;

    const [rows] = await connection.execute(`SELECT * FROM ${unit}_urls WHERE token = ?`, [uuid]);

    if (Array.isArray(rows) && rows.length > 0) {
        const rowDataPacket = rows[0] as any;
        const token = rowDataPacket.token;
        res.send(`Accessed URL for unit ${unit}: ${token}`);
    } else {
        res.status(404).send('Not Found');
    }
});

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

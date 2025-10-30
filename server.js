// --- DEPENDENCIAS ---
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs');
const fsp = require('fs').promises;

// --- CONFIGURACIÓN DE LA APP ---
const app = express();
// Railway te da el puerto, usa 3000 como fallback
const port = process.env.PORT || 3000; 

// Config Multer
// ¡OJO! Esto escribe en el disco del servidor (ver advertencia al final)
const tempUploadPath = path.join(__dirname, 'public/uploads/temp');
if (!fs.existsSync(tempUploadPath)) {
    fs.mkdirSync(tempUploadPath, { recursive: true });
}
const upload = multer({ dest: tempUploadPath });

// Config App
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Sirve archivos estáticos (imágenes, etc.) desde la carpeta 'public'
app.use(express.static('public'));

// --- !! CAMBIO CRÍTICO: CONFIGURACIÓN DB DE RAILWAY !! ---
// 1. Usamos variables de entorno de Railway
const dbConfig = {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 2. Creamos un POOL de conexiones, no una conexión simple.
// Esto es esencial para el rendimiento en la nube.
const pool = mysql.createPool(dbConfig);
console.log("Pool de conexiones a MySQL creado.");


// --- RUTAS DE LA API ---
// (Modificadas para usar el POOL de conexiones)

// GET /api/registros
app.get('/api/registros', async (req, res) => {
    // Usamos el pool directamente para una consulta simple
    try {
        const [rows] = await pool.execute('SELECT Id, NombreCliente, NombreEspecialista, FechaCreacion FROM RegistrosPanelControl ORDER BY FechaCreacion DESC');
        res.json(rows);
    } catch (err) { 
        console.error("Error en GET /api/registros:", err.message);
        res.status(500).send(err.message); 
    }
});

// GET /api/registros/:id
app.get('/api/registros/:id', async (req, res) => {
    const registroId = req.params.id;
    let connection; // Necesitamos conexión para múltiples consultas
    try {
        // 3. Obtenemos una conexión del POOL
        connection = await pool.getConnection(); 
        
        const [registroRows] = await connection.execute('SELECT * FROM RegistrosPanelControl WHERE Id = ?', [registroId]);
        const [fuenteRows] = await connection.execute('SELECT * FROM FuentesPoder WHERE RegistroPanelControlId = ?', [registroId]);
        const [ampRows] = await connection.execute('SELECT * FROM Amplificadores WHERE RegistroPanelControlId = ?', [registroId]);
        const [detalleRows] = await connection.execute('SELECT * FROM DetallesDispositivo WHERE RegistroPanelControlId = ?', [registroId]);
        
        if (registroRows.length === 0) return res.status(404).send('Registro no encontrado');
        
        res.json({
            registro: registroRows[0],
            fuente: fuenteRows[0] || null,
            amplificador: ampRows[0] || null,
            detalles: detalleRows
        });
    } catch (err) { 
        console.error(`Error en GET /api/registros/${registroId}:`, err.message);
        res.status(500).send(err.message); 
    } finally { 
        // 4. Liberamos la conexión de vuelta al POOL
        if (connection) connection.release(); 
    }
});

// POST /api/registros
app.post('/api/registros', upload.any(), async (req, res) => {
    let connection; // Necesario para la transacción
    let nuevoRegistroId;
    const tempFiles = req.files;
    const firmaClienteBase64 = req.body.firmaClienteImagen;
    const firmaEspecialistaBase64 = req.body.firmaEspecialistaImagen;
    let firmaClienteImagePath = null;
    let firmaEspecialistaImagePath = null; 

    try {
        // --- 1. Construir objetos ---
        // (Tu código de construir objetos va aquí, es idéntico)
        const registro = { /* ... tu objeto registro ... */ };
        const fuente = { /* ... tu objeto fuente ... */ };
        const amplificador = { /* ... tu objeto amplificador ... */ };
        const detalles = []; 
        // (Tu lógica de loop para detalles va aquí)

        // --- 2. Iniciar Transacción y Guardar ---
        // 3. Obtenemos conexión del POOL para la transacción
        connection = await pool.getConnection(); 
        await connection.beginTransaction();
        console.log("Transacción iniciada...");

        // (Todo tu código de guardar firmas, insertar registro, 
        // mover archivos, insertar fuente, amplificador y detalles
        // es IDÉNTICO... úsalo aquí tal cual)

        // ...
        // ... tu lógica de guardado ...
        // ...

        await connection.commit();
        console.log("Transacción completada (commit).");
        res.status(201).send({ message: 'Reporte completo guardado con éxito' });

    } catch (err) {
        if (connection) {
            await connection.rollback();
            console.log("Transacción revertida (rollback).");
        }
        console.error("Error en POST /api/registros (Transacción):", err.message, err.stack);
        res.status(500).send(err.message);
    } finally {
        // 4. Liberamos la conexión de vuelta al POOL
        if (connection) connection.release(); 
        
        // (Tu lógica de limpieza de archivos temporales es idéntica)
        // ...
    }
});

// DELETE /api/registros/:id
app.delete('/api/registros/:id', async (req, res) => { 
    // (Asegúrate de adaptar esta ruta también para que use el POOL)
    // ... 
});

// GET /api/registros/:id/pdf
app.get('/api/registros/:id/pdf', async (req, res) => {
    const registroId = req.params.id;
    let connection; // Necesario para múltiples consultas

    // (Tu función helper 'getFileUrl' es idéntica)
    const getFileUrl = (relativePath) => { /* ... tu código ... */ };
    // (Tu función helper 'addAbsolutePaths' es idéntica)
    const addAbsolutePaths = (obj, props) => { /* ... tu código ... */ };

    try {
        // 3. Obtenemos conexión del POOL
        connection = await pool.getConnection(); 
        
        console.log(`Generando PDF para registro ${registroId}...`);
        
        // (Tu lógica de consulta de datos es idéntica)
        const [registroRows] = await connection.execute('SELECT * FROM RegistrosPanelControl WHERE Id = ?', [registroId]);
        // ... más consultas ...

        if (registroRows.length === 0) return res.status(404).send('Registro no encontrado');

        const data = { /* ... tu objeto data ... */ };

        // (Tu lógica de añadir paths absolutos es idéntica)
        // data.logoPath = getFileUrl('img/logo.png'); // <-- ¡ASUMIENDO QUE TU LOGO ESTÁ EN public/img/logo.png!
        // ...
        
        // (Tu lógica de EJS y Puppeteer es idéntica)
        const templatePath = path.join(__dirname, 'pdf-template.ejs');
        const templateHtml = fs.readFileSync(templatePath, 'utf-8');
        const html = ejs.render(templateHtml, data);

        console.log("Lanzando Puppeteer...");
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' } });
        await browser.close();
        console.log("PDF generado exitosamente.");

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_${registroId}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error("Error en GET /api/registros/pdf:", err.message, err.stack);
        res.status(500).send(`Error generando PDF: ${err.message}`);
    } finally {
        // 4. Liberamos la conexión de vuelta al POOL
        if (connection) connection.release(); 
    }
});

// --- Iniciar el servidor ---
app.listen(port, () => {
    console.log(`Servidor API corriendo en puerto ${port}`);
    console.log('Sirviendo frontend desde la carpeta "public"');
});

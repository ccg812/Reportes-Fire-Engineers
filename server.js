// ------------------------------------
// ARCHIVO: server.js (CORREGIDO FINAL)
// ------------------------------------
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs');
const fsp = require('fs').promises;

const app = express();
const port = 3000;

// Config Multer
const tempUploadPath = path.join(__dirname, 'public/uploads/temp');
if (!fs.existsSync(tempUploadPath)) {
    fs.mkdirSync(tempUploadPath, { recursive: true });
}
const upload = multer({ dest: tempUploadPath });

// Config App
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Config DB
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Julio2713', // ¡TU CONTRASEÑA!
    database: 'reportesFiredb'
};

// --- RUTAS DE LA API ---

// GET /api/registros
app.get('/api/registros', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT Id, NombreCliente, NombreEspecialista, FechaCreacion FROM RegistrosPanelControl ORDER BY FechaCreacion DESC');
        res.json(rows);
    } catch (err) { /* Error handling */ res.status(500).send(err.message); }
    finally { if (connection) await connection.end(); }
});

// GET /api/registros/:id
app.get('/api/registros/:id', async (req, res) => {
    const registroId = req.params.id;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
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
    } catch (err) { /* Error handling */ res.status(500).send(err.message); }
    finally { if (connection) await connection.end(); }
});

// POST /api/registros
app.post('/api/registros', upload.any(), async (req, res) => {
    let connection;
    let nuevoRegistroId;
    const tempFiles = req.files;
    const firmaClienteBase64 = req.body.firmaClienteImagen;
    const firmaEspecialistaBase64 = req.body.firmaEspecialistaImagen;
    let firmaClienteImagePath = null;
    let firmaEspecialistaImagePath = null; // Ruta temporal

    try {
        // --- 1. Construir objetos ---
        const registro = {
            nombreCliente: req.body.nombreCliente, direccionCliente: req.body.direccionCliente, contactoCliente: req.body.contactoCliente, telefonoCliente: req.body.telefonoCliente, correoElectronicoCliente: req.body.correoElectronicoCliente,
            fechaHoraInicio: req.body.fechaHoraInicio || null, antesCualquierPruebaAviso: req.body.antesCualquierPruebaAviso, predioDelCliente: req.body.predioDelCliente, departamento: req.body.departamento, mantenimientoLazo: req.body.mantenimientoLazo,
            nombreFirmaResponsableDepto: req.body.nombreFirmaResponsableDepto, cantidadDetectores: req.body.cantidadDetectores || null, seguridadSecom: req.body.seguridadSecom, cantidadModulos: req.body.cantidadModulos || null, nombreEspecialista: req.body.nombreEspecialista,
            ubicacionPanelControl: req.body.ubicacionPanelControl, fabricanteSistema: req.body.fabricanteSistema, estiloCableado: req.body.estiloCableado, numeroLazos: req.body.numeroLazos || null, modeloPanelControl: req.body.modeloPanelControl,
            cuentaConSistemaDeVoceo: req.body.cuentaConSistemaDeVoceo === 'true', descripcionVoceo: req.body.descripcionVoceo, seEncuentraEnSistemaNormal: req.body.seEncuentraEnSistemaNormal === 'true',
            voltajePrimario: req.body.voltajePrimario || null, voltajeSecundario: req.body.voltajeSecundario || null, voltajeBateria1: req.body.voltajeBateria1 || null, voltajeBateria2: req.body.voltajeBateria2 || null, voltajeLazos: req.body.voltajeLazos,
            ubicacionTableroElec: req.body.ubicacionTableroElec, noDeTermica: req.body.noDeTermica,
            totalEventosDeAlarma: req.body.totalEventosDeAlarma || null, totalProblemas: req.body.totalProblemas || null, totalMonitor: req.body.totalMonitor || null, sistemaLibreDeFalloTierra: req.body.sistemaLibreDeFalloTierra === 'true', otros: req.body.otros,
            observacionesGenerales: req.body.observacionesGenerales,
            firmaClienteFechaHora: null, FirmaEspecialistaPath: null
        };
        const fuente = { /* ... objeto fuente ... */ }; // (Sin cambios, por brevedad)
        const amplificador = { /* ... objeto amplificador ... */ }; // (Sin cambios, por brevedad)
        const detalles = []; // (Sin cambios, por brevedad)
        const detalleCount = parseInt(req.body.detalleCount) || 0;
        for (let i = 0; i < detalleCount; i++) { detalles.push({ /* ... objeto detalle ... */ }); } // (Sin cambios, por brevedad)

        // --- 2. Iniciar Transacción y Guardar ---
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // Guardar firmas temporalmente
        const uploadDirTemp = path.join(__dirname, 'public/uploads/temp');
        if (!fs.existsSync(uploadDirTemp)) fs.mkdirSync(uploadDirTemp, { recursive: true });
        const guardarFirmaBase64 = async (base64Data, prefijo) => {
            if (base64Data && base64Data.startsWith('data:image/png;base64,')) {
                const data = base64Data.replace(/^data:image\/png;base64,/, "");
                const filename = `${prefijo}_${Date.now()}.png`;
                const tempPath = path.join(uploadDirTemp, filename);
                await fsp.writeFile(tempPath, data, 'base64');
                return `uploads/temp/${filename}`;
            } return null;
        };
        firmaClienteImagePath = await guardarFirmaBase64(firmaClienteBase64, 'firma_cliente');
        firmaEspecialistaImagePath = await guardarFirmaBase64(firmaEspecialistaBase64, 'firma_especialista');

        // Insertar registro SIN firmas
        const registroQuery = `INSERT INTO RegistrosPanelControl SET ?`;
        const [registroResult] = await connection.query(registroQuery, registro);
        nuevoRegistroId = registroResult.insertId;

        // Mover firmas a carpeta final y ACTUALIZAR DB
        const finalFolderPath = path.join(__dirname, 'public/uploads', nuevoRegistroId.toString());
         if (!fs.existsSync(finalFolderPath)) fs.mkdirSync(finalFolderPath, { recursive: true });
        const moverFirmaFinal = async (tempPath, tipo) => {
            if (!tempPath) return null;
            const tempFullPath = path.join(__dirname, 'public', tempPath);
            // Verificar si el archivo temporal existe antes de mover
            try {
                await fsp.access(tempFullPath); // Lanza error si no existe
            } catch (e) {
                console.warn(`Archivo de firma temporal no encontrado, omitiendo: ${tempPath}`);
                return null; // No se puede mover, retornar null
            }
            const finalFullPath = path.join(finalFolderPath, path.basename(tempPath));
            await fsp.rename(tempFullPath, finalFullPath);
            const finalRelativePath = `uploads/${nuevoRegistroId}/${path.basename(tempPath)}`;
            
            // ¡¡CORRECCIÓN AQUÍ!! Usar los nombres exactos de columna de la DB
            const columna = (tipo === 'cliente') ? 'FirmaClienteFechaHora' : 'FirmaEspecialistaPath';
            
            await connection.execute(
                `UPDATE RegistrosPanelControl SET ${columna} = ? WHERE Id = ?`,
                [finalRelativePath, nuevoRegistroId]
            );
            console.log(`Firma ${tipo} guardada en DB: ${finalRelativePath}`); // Log para verificar
            return finalRelativePath;
        };
        await moverFirmaFinal(firmaClienteImagePath, 'cliente');
        await moverFirmaFinal(firmaEspecialistaImagePath, 'especialista'); // <--- Llamada corregida

        // Mover resto de imágenes y asignar paths
        const permanentFilesPath = path.join(__dirname, 'public/uploads', nuevoRegistroId.toString());
        const moverArchivo = async (file) => {
            if (!file) return null;
            const newPath = path.join(permanentFilesPath, file.filename);
            const relativePath = `uploads/${nuevoRegistroId}/${file.filename}`;
             try { await fsp.access(file.path); } catch(e){ console.warn(`Archivo temporal no encontrado ${file.path}`); return null;}
            await fsp.rename(file.path, newPath);
            return relativePath;
        };
        const fileMoves = [];
        // ... (código idéntico para llenar fileMoves) ...
        await Promise.all(fileMoves);

        // Insertar Fuente, Amplificador, Detalles
        fuente.RegistroPanelControlId = nuevoRegistroId;
        await connection.query(`INSERT INTO FuentesPoder SET ?`, fuente);
        amplificador.RegistroPanelControlId = nuevoRegistroId;
        await connection.query(`INSERT INTO Amplificadores SET ?`, amplificador);
        if (detalles.length > 0) {
            const detalleQuery = `INSERT INTO DetallesDispositivo SET ?`;
            for (const detalle of detalles) {
                detalle.RegistroPanelControlId = nuevoRegistroId;
                await connection.query(detalleQuery, detalle);
            }
        }

        await connection.commit();
        res.status(201).send({ message: 'Reporte completo guardado con éxito' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Error en POST /api/registros (Transacción):", err.message, err.stack);
        res.status(500).send(err.message);
    } finally {
        if (connection) await connection.end();
        // Limpiar archivos temporales
        if (tempFiles) {
            for (const file of tempFiles) {
                try { await fsp.unlink(file.path); } catch (e) { /* Ignorar */ }
            }
        }
        const limpiarFirmaTemp = async (path) => {
            if (path && path.includes('/temp/')) {
                const fullTempPath = path.join(__dirname, 'public', path);
                try { await fsp.access(fullTempPath); await fsp.unlink(fullTempPath); } catch(e) { /* Ignorar si ya no existe */ }
            }
        };
        await limpiarFirmaTemp(firmaClienteImagePath);
        await limpiarFirmaTemp(firmaEspecialistaImagePath);
    }
});

// DELETE /api/registros/:id
app.delete('/api/registros/:id', async (req, res) => { /* ... (código idéntico) ... */ });

// GET /api/registros/:id/pdf
app.get('/api/registros/:id/pdf', async (req, res) => {
    const registroId = req.params.id;
    let connection;
    // Función helper para URL de archivo (CORREGIDA)
    const getFileUrl = (relativePath) => {
        if (!relativePath) return null;
        // Reemplazar barras invertidas si existen (Windows)
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const absolutePath = path.join(__dirname, 'public', normalizedPath);
        // Volver a normalizar por si acaso
        const urlPath = absolutePath.replace(/\\/g, '/');
        // Asegurarse de que empiece con file:///
        if (urlPath.startsWith('/')) {
             return `file://${urlPath}`; // Linux/Mac
        } else {
             return `file:///${urlPath}`; // Windows
        }
    };
    const addAbsolutePaths = (obj, props) => {
        if (!obj) return;
        for (const prop of props) {
            // Verificar si la propiedad existe y no es null
            if (obj.hasOwnProperty(prop) && obj[prop]) {
                 console.log(`Generando URL para: ${prop} = ${obj[prop]}`); // Log para depurar
                obj[prop + '_Absolute'] = getFileUrl(obj[prop]);
                console.log(`URL generada: ${obj[prop + '_Absolute']}`); // Log para depurar
            } else {
                 obj[prop + '_Absolute'] = null; // Asegurar que la propiedad _Absolute exista
            }
        }
    };
    try {
        connection = await mysql.createConnection(dbConfig);
        const [registroRows] = await connection.execute('SELECT * FROM RegistrosPanelControl WHERE Id = ?', [registroId]);
        const [fuenteRows] = await connection.execute('SELECT * FROM FuentesPoder WHERE RegistroPanelControlId = ?', [registroId]);
        const [ampRows] = await connection.execute('SELECT * FROM Amplificadores WHERE RegistroPanelControlId = ?', [registroId]);
        const [detalleRows] = await connection.execute('SELECT * FROM DetallesDispositivo WHERE RegistroPanelControlId = ?', [registroId]);
        if (registroRows.length === 0) return res.status(404).send('Registro no encontrado');

        const data = {
            registro: registroRows[0],
            fuente: fuenteRows[0],
            amplificador: ampRows[0],
            detalles: detalleRows
        };

        // Añadir rutas absolutas (incluyendo logos)
        data.logoPath = getFileUrl('logo.png'); // <-- ¡ASUMIENDO QUE TU LOGO ESTÁ EN public/img/logo.png!

        addAbsolutePaths(data.registro, ['firmaClienteFechaHora', 'FirmaEspecialistaPath']);
        addAbsolutePaths(data.fuente, ['ImagenGaleria1Path', 'ImagenGaleria2Path', 'ImagenGaleria3Path']);
        addAbsolutePaths(data.amplificador, ['ImagenGaleria1Path', 'ImagenGaleria2Path', 'ImagenGaleria3Path']);
        data.detalles.forEach(d => {
            addAbsolutePaths(d, ['ImagenPruebaPath', 'ImagenAntesPath', 'ImagenDespuesPath']);
        });

        const templatePath = path.join(__dirname, 'pdf-template.ejs');
        const templateHtml = fs.readFileSync(templatePath, 'utf-8');
        const html = ejs.render(templateHtml, data);

        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        
        // Log HTML generado para depuración (opcional)
        // console.log("HTML para PDF:", html); 
        
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' } });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_${registroId}.pdf`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("Error en GET /api/registros/pdf:", err.message, err.stack);
        res.status(500).send(`Error generando PDF: ${err.message}`);
    } finally {
        if (connection) await connection.end();
    }
});

// --- Iniciar el servidor ---
app.listen(port, () => {
    console.log(`Servidor API corriendo en http://localhost:${port}`);
    console.log('Sirviendo frontend desde la carpeta "public"');
});
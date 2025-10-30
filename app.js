// ------------------------------------
// ARCHIVO: public/app.js (FINAL)
// ------------------------------------

const API_URL = 'http://localhost:3000/api/registros';
let indiceFilaDetalle = 0; // Contador global para filas nuevas

// --- Selectores Globales ---
const formulario = document.getElementById('reporteForm');
const btnAgregarFila = document.getElementById('btnAgregarFila');
const tablaDetallesBody = document.querySelector('#tablaDetalles tbody');
const listadoDiv = document.getElementById('registrosListado');

const canvasCliente = document.getElementById('signature-canvas-cliente');
const clearButtonCliente = document.getElementById('clear-signature-cliente');
let signaturePadCliente;

const canvasFE = document.getElementById('signature-canvas-fe');
const clearButtonFE = document.getElementById('clear-signature-fe');
let signaturePadFE;

// --- Se ejecuta cuando el HTML está cargado ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Inicializar ambas firmas
    signaturePadCliente = new SignaturePad(canvasCliente, { backgroundColor: 'rgb(255, 255, 255)' });
    signaturePadFE = new SignaturePad(canvasFE, { backgroundColor: 'rgb(255, 255, 255)' });
    
    // Ajustar tamaño de los canvas
    resizeAllCanvases();
    window.addEventListener("resize", resizeAllCanvases);

    // 1. Cargar los registros existentes
    cargarRegistros();

    // 2. Escuchar el evento "submit" del formulario
    formulario.addEventListener('submit', manejarSubmitFormulario);

    // 3. Lógica para el botón "Agregar Dispositivo"
    btnAgregarFila.addEventListener('click', () => agregarFilaDetalle(null));

    // 4. Lógica para botones "Quitar" (delegación de eventos)
    tablaDetallesBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar')) {
            e.target.closest('tr').remove();
        }
    });

    // 5. Lógica para "Clonar" y "Eliminar" (delegación de eventos)
    listadoDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-eliminar')) eliminarRegistro(e.target.dataset.id);
        if (e.target.classList.contains('btn-clonar')) cargarDatosParaClonar(e.target.dataset.id);
    });

    // 6. Limpiar Firmas
    clearButtonCliente.addEventListener('click', () => signaturePadCliente.clear());
    clearButtonFE.addEventListener('click', () => signaturePadFE.clear());
});

// --- FUNCIÓN: Ajustar tamaño del canvas ---
function resizeAllCanvases() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    [canvasCliente, canvasFE].forEach(canvas => {
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
    });
    signaturePadCliente.clear(); 
    signaturePadFE.clear();
}

// --- FUNCIÓN: Submit del Formulario ---
async function manejarSubmitFormulario(e) {
    e.preventDefault(); 
    const formData = new FormData(formulario);
    
    // Capturar ambas firmas
    if (!signaturePadCliente.isEmpty()) formData.set('firmaClienteImagen', signaturePadCliente.toDataURL("image/png")); 
    else formData.set('firmaClienteImagen', ''); 
    
    if (!signaturePadFE.isEmpty()) formData.set('firmaEspecialistaImagen', signaturePadFE.toDataURL("image/png")); 
    else formData.set('firmaEspecialistaImagen', ''); 

    // Manejar checkboxes
    const checkboxes = formulario.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        formData.set(cb.name, cb.checked);
    });
    
    // Renombrar inputs de la tabla dinámica y contar filas
    const filas = tablaDetallesBody.querySelectorAll('tr');
    formData.append('detalleCount', filas.length);
    filas.forEach((fila, index) => {
        fila.dataset.finalIndex = index; 
        fila.querySelectorAll('input[type="text"], select').forEach(input => {
            if (input.name && input.name.startsWith('detalle_temporal_')) {
                const parts = input.name.split('_');
                const newName = `detalle_${index}_${parts[parts.length - 1]}`;
                formData.set(newName, input.value);
                formData.delete(input.name); 
            }
        });
        fila.querySelectorAll('input[type="file"]').forEach(input => {
             if (input.name && input.name.startsWith('detalle_')) {
                const file = input.files[0];
                if(file){
                    const parts = input.name.split('_'); 
                    const newName = `detalle_${index}_${parts[parts.length - 1]}`;
                    formData.append(newName, file, file.name); 
                    formData.delete(input.name); 
                }
             }
        });
    });

    const btnGuardar = formulario.querySelector('.btn-guardar');
    btnGuardar.textContent = 'Guardando...';
    btnGuardar.disabled = true;

    try {
        const respuesta = await fetch(API_URL, {
            method: 'POST',
            body: formData 
        });
        if (respuesta.ok) {
            alert('¡Reporte completo guardado con éxito!');
            formulario.reset(); 
            signaturePadCliente.clear(); 
            signaturePadFE.clear();
            tablaDetallesBody.innerHTML = ''; 
            indiceFilaDetalle = 0; 
            cargarRegistros(); 
        } else {
            const error = await respuesta.text();
            alert('Error al guardar el reporte: ' + error);
            console.error('Error del servidor:', error);
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        alert('No se pudo conectar al servidor. ¿Está corriendo `node server.js`?');
    } finally {
        btnGuardar.textContent = 'Guardar Reporte Completo';
        btnGuardar.disabled = false;
    }
}

// --- FUNCIÓN: Cargar lista de registros ---
async function cargarRegistros() {
    listadoDiv.innerHTML = '<p>Cargando registros...</p>';
    try {
        const respuesta = await fetch(API_URL);
        if (!respuesta.ok) throw new Error('Error al obtener la lista');
        const registros = await respuesta.json();

        if (registros.length === 0) {
            listadoDiv.innerHTML = '<p>No hay registros guardados.</p>';
            return;
        }

        let html = '<table><thead><tr><th>ID</th><th>Cliente</th><th>Especialista</th><th>Fecha Creación</th><th>Acciones</th></tr></thead><tbody>';
        for (const registro of registros) {
            html += `
                <tr>
                    <td>${registro.Id}</td>
                    <td>${registro.NombreCliente}</td>
                    <td>${registro.NombreEspecialista || ''}</td>
                    <td>${new Date(registro.FechaCreacion).toLocaleString()}</td>
                    <td class="acciones">
                        <a href="${API_URL}/${registro.Id}/pdf" target="_blank" class="btn-pdf">PDF</a>
                        <button class="btn-clonar" data-id="${registro.Id}">Clonar</button>
                        <button class="btn-eliminar" data-id="${registro.Id}">Eliminar</button>
                    </td>
                </tr>
            `;
        }
        html += '</tbody></table>';
        listadoDiv.innerHTML = html;

    } catch (error) {
        console.error('Error al cargar registros:', error);
        listadoDiv.innerHTML = '<p>Error al cargar los registros. Revisa la consola.</p>';
    }
}

// --- FUNCIÓN: Eliminar un registro ---
async function eliminarRegistro(id) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el reporte ID: ${id}? Esta acción no se puede deshacer.`)) {
        return;
    }
    try {
        const respuesta = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (respuesta.ok) {
            alert('Registro eliminado con éxito');
            cargarRegistros(); 
        } else {
            const error = await respuesta.text();
            alert('Error al eliminar: ' + error);
        }
    } catch (error) {
        console.error('Error de conexión al eliminar:', error);
        alert('No se pudo conectar al servidor.');
    }
}

// --- FUNCIÓN: Cargar datos para clonar ---
async function cargarDatosParaClonar(id) {
    alert(`Cargando datos del reporte ID: ${id} para clonar...`);
    try {
        const respuesta = await fetch(`${API_URL}/${id}`);
        if (!respuesta.ok) throw new Error('No se pudo cargar el reporte');
        const data = await respuesta.json();
        
        formulario.reset();
        signaturePadCliente.clear(); 
        signaturePadFE.clear();
        tablaDetallesBody.innerHTML = '';
        indiceFilaDetalle = 0;
        
        rellenarFormulario(data);
        
        window.scrollTo(0, 0); 
        alert(`Datos cargados. Modifica lo que necesites y guarda.\nIMPORTANTE: Las imágenes y las firmas NO se clonan y deben ingresarse de nuevo.`);

    } catch (error) {
        console.error('Error al clonar:', error);
        alert('Error al cargar los datos para clonar.');
    }
}

// --- FUNCIÓN: Rellenar el formulario con datos ---
function rellenarFormulario(data) {
    const { registro, fuente, amplificador, detalles } = data;
    Object.keys(registro).forEach(key => {
        const inputName = key.charAt(0).toLowerCase() + key.slice(1); 
        const input = formulario.querySelector(`[name="${inputName}"]`);
        if (input) {
            if (input.type === 'checkbox') input.checked = !!registro[key]; 
            else if (input.type === 'datetime-local') {
                if (registro[key]) {
                    const d = new Date(registro[key]);
                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                    input.value = d.toISOString().slice(0, 16);
                }
            } 
            else if(inputName !== 'firmaClienteImagen' && inputName !== 'firmaEspecialistaImagen' && key !== 'FirmaEspecialistaPath' && key !== 'FirmaClienteFechaHora') {
                if (registro[key] !== null && registro[key] !== undefined) {
                    input.value = registro[key];
                }
            }
        }
    });
    Object.keys(fuente || {}).forEach(key => {
        const inputName = 'fuente' + key; 
        const input = formulario.querySelector(`[name="${inputName}"]`);
        if (input) {
            if (input.type === 'checkbox') input.checked = !!fuente[key];
            else if (fuente[key] !== null && fuente[key] !== undefined) input.value = fuente[key];
        }
    });
    Object.keys(amplificador || {}).forEach(key => {
        const inputName = 'amp' + key; 
        const input = formulario.querySelector(`[name="${inputName}"]`);
        if (input) {
            if (input.type === 'checkbox') input.checked = !!amplificador[key];
            else if (amplificador[key] !== null && amplificador[key] !== undefined) input.value = amplificador[key];
        }
    });
    detalles.forEach(detalle => {
        agregarFilaDetalle(detalle);
    });
}

// --- FUNCIÓN: Añadir fila de detalle ---
function agregarFilaDetalle(detalle) {
    const i = indiceFilaDetalle; 
    const lazo = detalle?.Lazo ?? '';
    const numDisp = detalle?.NumeroDispositivo ?? '';
    const tipo = detalle?.TipoDispositivo ?? '';
    const ubicacion = detalle?.UbicacionDispositivo ?? '';
    const obsNo = detalle?.NumeroObservacion ?? '';
    const prueba = detalle?.RealizarPruebaFuncionamiento ?? 'N/A';
    const reporto = detalle?.ElDispositivoReportoAPanel ?? 'N/A';
    const led = detalle?.LosLedSeEncuentranParpadeando ?? 'N/A';
    const dano = detalle?.ElDispositivoEstaLibreDeDano ?? 'N/A';
    const obstruido = detalle?.ElDispositivoSeEncuentraObstruido ?? 'N/A';
    const limpieza = detalle?.RealizarLimpiezaDeDispositivo ?? 'N/A';
    
    const nuevaFila = `
        <tr data-indice="${i}">
            <td><input type="text" name="detalle_temporal_${i}_lazo" value="${lazo}"></td>
            <td><input type="text" name="detalle_temporal_${i}_numeroDispositivo" value="${numDisp}"></td>
            <td><input type="text" name="detalle_temporal_${i}_tipoDispositivo" value="${tipo}"></td>
            <td><input type="text" name="detalle_temporal_${i}_ubicacionDispositivo" value="${ubicacion}"></td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_prueba`, prueba)}</td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_reporto`, reporto)}</td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_led`, led)}</td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_dano`, dano)}</td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_obstruido`, obstruido)}</td>
            <td>${crearSelectSiNoNA(`detalle_temporal_${i}_limpieza`, limpieza)}</td>
            <td><input type="text" name="detalle_temporal_${i}_obsNo" value="${obsNo}"></td>
            <td><input type="file" name="detalle_${i}_imgPrueba"></td>
            <td><input type="file" name="detalle_${i}_imgAntes"></td>
            <td><input type="file" name="detalle_${i}_imgDespues"></td>
            <td><button type="button" class="btn-quitar">X</button></td>
        </tr>
    `;
    tablaDetallesBody.insertAdjacentHTML('beforeend', nuevaFila);
    indiceFilaDetalle++; 
}

// --- FUNCIÓN Helper para crear <select> ---
function crearSelectSiNoNA(name, selectedValue = 'N/A') {
    const opciones = ['si', 'no', 'N/A'];
    let html = `<select name="${name}">`;
    opciones.forEach(op => {
        const selected = (op === selectedValue) ? 'selected' : '';
        html += `<option value="${op}" ${selected}>${op}</option>`;
    });
    html += `</select>`;
    return html;
}
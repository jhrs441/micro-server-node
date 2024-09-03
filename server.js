const express = require('express');
const { exec } = require('child_process');
const os = require('os');
const si = require("systeminformation");
const fs = require("fs-extra");
const cors = require('cors');
const path = require('path');
const directorioActual = process.cwd();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use("/screenshot", express.static(path.join(directorioActual, 'screenshot/img')));//carpeta para consultar la imagen
app.get("/", (req, res) => {
    res.send("Micro servidor activo");
});

app.get("/estatus", async (req, res) => {
    try {
        const estadoMaquina = {
            estado: "activo",
            nombreEquipo: os.hostname()
        };
        res.json(estadoMaquina);
    } catch (error) {
        next(error);
    }
});

app.get("/estatus_ram", async (req, res) => {
    try {
        const estadoMaquina = {
            estado: "activo",
            nombreEquipo: os.hostname(),
            ...obtenerInfoRAM(),
        };
        res.json(estadoMaquina);
    } catch (error) {
        next(error);
    }
});

app.get("/fulldate", async (req, res, next) => {
    // Verificar si se solicita actualizar los datos
    const { update_datos } = req.query; //se espera un true para hacer la consulta o un falce para leer el txt local
    let fullDetails;

    try {
        if (update_datos === "true") {
            // Obtener los detalles del sistema y guardarlos en el archivo js
            const cpus = await si.cpu();
            const zocalo = await si.baseboard();
            const osInfo = await si.osInfo();
            const system = await si.system();

            //const getStaticData = await si.getStaticData();
            const memLayout = await si.memLayout();
            // Mapear la lista de RAM
            const raminfo = memLayout.map((ram) => ({
                size: (ram.size / (1024 * 1024 * 1024)).toFixed(2) + " GB",
                type: ram.type,
                clockSpeed: ram.clockSpeed,
                formFactor: ram.formFactor,
                manufacturer: ram.manufacturer,
                partNum: ram.partNum,
                serialNum: ram.serialNum,
            }));

            const discos = await si.diskLayout();
            // Mapear la lista de discos
            const discosInfo = discos.map((disco) => ({
                type: disco.type,
                name: disco.name,
                vendor: disco.vendor,
                size: (disco.size / (1024 * 1024 * 1024)).toFixed(2) + " GB",
                serialNum: disco.serialNum,
                interfaceType: disco.interfaceType,
            }));

            fullDetails = {
                nombreEquipo: os.hostname(),
                version: system.version,
                model: system.model,
                numeroSerie: system.serial,
                marcaProcesador: cpus.manufacturer,
                tipoProcesador: cpus.brand,
                // platform: osInfo.platform,
                distro: osInfo.distro,
                arch: osInfo.arch,
                //serial: osInfo.serial,
                //build: osInfo.build,
                //uefi: osInfo.uefi,
                //remoteSession: osInfo.remoteSession,
                //getStaticData: getStaticData,
                almacenamiento: discosInfo,
                slotMemoriaRam: zocalo.memSlots,
                ramInfo: raminfo
                //...obtenerInfoRAM(),
            };
            // se consulta al txt
            const rutaArchivo = path.join(directorioActual, 'datos/datos_equipo.json');
            await fs.writeJson(rutaArchivo, fullDetails);
        } else {
            // Obtener los datos del archivo
            const datosEquipo = await obtenerDatosEquipoTxt();
            fullDetails = datosEquipo;
            //console.log(datosEquipo);
        }

        res.json(fullDetails);
    } catch (error) {
        next(error);
    }
});

// Ruta para apagar la máquina
app.get("/apagado", (req, res, next) => {
    const { palabra } = req.query;
    if (palabra === "apagar") {
        shutdownComputer();
    } else {
        res
            .status(400)
            .json({ error: "Palabra incorrecta para apagar la máquina" });
    }
});

// Ruta para apagar la máquina
app.get("/reiniciar", (req, res, next) => {
    const { palabra } = req.query;
    if (palabra === "reiniciar") {
        restartComputer();
    } else {
        res
            .status(400)
            .json({ error: "Palabra incorrecta para reiniciar la máquina" });
    }
});

app.post("/ejecutarCMD", async (req, res) => {
    const { nombreArchivo } = req.body;
    const { nombrePrograma } = req.body;

    // Verificar si se proporcionó la nombreArchivo del archivo
    if (!nombreArchivo) {
        return res
            .status(400)
            .json({ error: "Debe proporcionar el nombre del archivo" });
    }

    try {
        // Ejecutar el archivo .cmd
        const resultado = await ejecutarCMD(nombreArchivo);

        // Comprobar el resultado para determinar si la ejecución fue exitosa
        if (resultado === "Actualizado con éxito") {
            console.log(nombrePrograma + ": actualizado");
            return res.json({
                estado: "success",
                message: nombrePrograma + ": actualizado",
            });
        } else {
            console.error("Error en la ejecución del " + nombrePrograma);
            return res.status(500).json({
                estado: "error",
                message: "Error, Verificar Manualmente el ejecutable (" + nombreArchivo + ") o los permisos al servidor de Archivos (192.168.2.100)",
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            estado: "error",
            message: "Error, Verificar Manualmente el ejecutable (" + nombreArchivo + ") o los permisos al servidor de Archivos (192.168.2.100)",
        });
    }
});

function ejecutarCMD(nombreArchivo) {
    return new Promise((resolve, reject) => {
        const comando = `"C:\\Aplicaciones\\Actualizadores\\${nombreArchivo}"`;

        const childProcess = exec(comando, (error, stdout, stderr) => {
            if (error) {
                reject(`Error en archivo .cmd_: ${error.message}`);
                return;
            }
            if (stderr) {
                reject(`Error en archivo .cmd: ${stderr}`);
                return;
            }
            // Verificar si hay algún indicio de éxito en la salida estándar
            if (stdout.includes("Actualizado con éxito")) {
                resolve("Actualizado con éxito");
            } else {
                reject("Actualización fallida");
            }
        });

        childProcess.stdin.end();
    });
}

// leer los datos del equipo guardados localmente
const filePath = path.join(directorioActual, 'datos/datos_equipo.json');
async function obtenerDatosEquipoTxt() {
    let datosEquipo;

    try {
        // Verificar si el archivo existe
        const existeArchivo = await fs.pathExists(filePath);

        if (existeArchivo) {
            // Leer los datos del archivo si existe
            datosEquipo = await fs.readJson(filePath);
        } else {
            const dirPath = path.dirname(filePath);
            await fs.ensureDir(dirPath); //se crea la carpeta
            datosEquipo = { datos: null };
            await fs.writeJson(filePath, datosEquipo); // se crea el archivo con datos vacíos
        }
    } catch (error) {
        console.error("Error al leer el archivo:", error);
        throw error;
    }

    return datosEquipo;
}


const origen = path.join(directorioActual, 'screenshot/bloqueo/img_captura.png');
const destino = path.join(directorioActual, 'screenshot/img/img_captura.png');

// Copiar el archivo y renombrarlo
fs.copy(origen, destino)
    .then(() => {
        console.log("img bloqueo copiado exitosamente.");
    })
    .catch(err => {
        console.error("Error al copiar el archivo:", err);
    });

//Función para obtener información de la memoria RAM
const obtenerInfoRAM = () => {
    const ramTotalMB = Math.round(os.totalmem() / (1024 * 1024)); // Convertir a MB
    const ramLibreMB = Math.round(os.freemem() / (1024 * 1024)); // Convertir a MB
    return {
        ramTotal_MB: ramTotalMB,
        ramLibre_MB: ramLibreMB,
        ramEnUso_MB: ramTotalMB - ramLibreMB,
    };
};

// Función para apagar el equipo
function shutdownComputer() {
    exec('shutdown /s /t 0', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error al apagar la máquina: ${err.message}`);
            res.status(500).json({ err: "Error al apagar la máquina" });
            return;
        } else {
            console.log('Apagando...');
            res.json({ message: "Apagando..." });
        }
    });
}

// Función para reiniciar el equipo
function restartComputer() {
    exec('shutdown /r /t 0', (err, stdout, stderr) => {
        if (err) {
            console.error(`Reiniciando: ${err.message}`);
            res.status(500).json({ err: "Error al reiniciar la máquina" });
        } else {
            console.log("Reiniciando...");
            res.json({ message: "Reiniciando..." });
        }
    });
}

app.listen(port, () => {
    console.log(`Micro Servidor Node => escuchando en http://localhost:${port}`);
});


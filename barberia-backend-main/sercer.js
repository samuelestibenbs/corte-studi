const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// 1. CONEXIÓN A MONGOOSE
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
if (!MONGO_URI || !JWT_SECRET) {
    console.error('❌ Configura MONGO_URI y JWT_SECRET en el archivo .env.');
    process.exit(1);
}
mongoose.connect(MONGO_URI)
    .then(() => console.log('🚀 ¡Conexión exitosa a MongoDB Atlas!'))
    .catch((error) => console.error('❌ Error al conectar a MongoDB:', error));

// 2. MODELOS DE LA BASE DE DATOS (Se crean solos en MongoDB)
const UserSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const CitaSchema = new mongoose.Schema({
    clienteNombre: { type: String, required: true },
    barbero: { type: String, required: true },
    servicio: { type: String, required: true },
    fecha: { type: String, required: true }, // Ej: "2026-11-20"
    hora: { type: String, required: true }    // Ej: "14:00"
});
// Regla de oro: Evita que agenden al mismo barbero a la misma fecha y hora
CitaSchema.index({ barbero: 1, fecha: 1, hora: 1 }, { unique: true });
const Cita = mongoose.model('Cita', CitaSchema);


// 3. RUTAS DEL SISTEMA (API ENDPOINTS)

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('Servidor de la Barbería en línea y funcionando.');
});

// A. RUTA: REGISTRO DE USUARIOS
app.post('/api/auth/register', async (req, res) => {
    const { nombre, email, password } = req.body;
    if (typeof nombre !== 'string' || !nombre.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Completa nombre, correo y contraseña válidos' });
    }
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'La base de datos no está disponible. Inténtalo más tarde.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const nuevoUsuario = new User({ nombre: nombre.trim(), email: email.trim().toLowerCase(), password: hashedPassword });
        await nuevoUsuario.save();
        res.status(201).json({ mensaje: 'Usuario registrado con éxito' });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'El correo ya está registrado' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Los datos del registro no son válidos' });
        }
        console.error('Error al registrar usuario:', error);
        res.status(500).json({ error: 'No se pudo completar el registro. Inténtalo más tarde.' });
    }
});

// B. RUTA: LOGIN DE USUARIOS
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const usuario = await User.findOne({ email });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const passwordValido = await bcrypt.compare(password, usuario.password);
        if (!passwordValido) return res.status(401).json({ error: 'Contraseña incorrecta' });

        // Crear token de sesión seguro
        const token = jwt.sign({ id: usuario._id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, usuario: { nombre: usuario.nombre, email: usuario.email } });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// C. RUTA: AGENDAR UNA CITA
app.post('/api/citas/agendar', async (req, res) => {
    try {
        const { clienteNombre, barbero, servicio, fecha, hora } = req.body;
        const nuevaCita = new Cita({ clienteNombre, barbero, servicio, fecha, hora });
        await nuevaCita.save();
        res.status(201).json({ mensaje: '¡Cita agendada con éxito!', cita: nuevaCita });
    } catch (error) {
        res.status(400).json({ error: 'Ese horario ya está ocupado por otro cliente con ese barbero' });
    }
});

// D. RUTA: CONSULTAR HORAS OCUPADAS sin exponer los datos de los clientes
app.get('/api/citas/disponibilidad', async (req, res) => {
    const { fecha, barbero } = req.query;
    if (typeof fecha !== 'string' || typeof barbero !== 'string') {
        return res.status(400).json({ error: 'Indica una fecha y un barbero válidos' });
    }
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'La base de datos no está disponible. Inténtalo más tarde.' });
    }

    try {
        const citas = await Cita.find({ fecha, barbero }).select('hora -_id').lean();
        res.json({ horariosOcupados: citas.map((cita) => cita.hora) });
    } catch (error) {
        console.error('Error al consultar la disponibilidad:', error);
        res.status(500).json({ error: 'Error al consultar la disponibilidad' });
    }
});

// E. RUTA: VER TODAS LAS CITAS (Para el administrador o barberos)
app.get('/api/citas', async (req, res) => {
    try {
        const citas = await Cita.find();
        res.json(citas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener las citas' });
    }
});


// 4. PUERTO DINÁMICO PARA RENDER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌍 Servidor escuchando en el puerto ${PORT}`);
});

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://comercialajoyventas_db_user:N4DAZ2KCts0goaAZ@cluster0.ef0nk2j.mongodb.net/asadoskylian?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch(err => console.error('Error conectando a MongoDB:', err));

// Esquema de Pedidos
const pedidoSchema = new mongoose.Schema({
    id: Number,
    cliente: String,
    mesa: String,
    tipo: String,
    detalle: Array,
    total: Number,
    estado: { type: String, default: 'Pendiente' }, // 'Pendiente', 'Cobrado', 'Cerrado'
    efectivoRecibido: Number,
    vuelto: Number,
    metodoPago: { type: String, default: 'Efectivo' }, // <--- Campo añadido para el método de pago
    fecha: { type: Date, default: Date.now }
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

// Esquema de Cierres Históricos
const cierreSchema = new mongoose.Schema({
    fecha: String,
    totalVentas: Number,
    totalPedidos: Number,
    resumenProductos: Object
});
const Cierre = mongoose.model('Cierre', cierreSchema);

// Rutas de la API
app.get('/api/pedidos', async (req, res) => {
    try {
        // Solo traemos los pedidos activos del día actual (que no estén cerrados)
        const pedidos = await Pedido.find({ estado: { $ne: 'Cerrado' } }).sort({ id: -1 });
        
        // Calculamos estadísticas únicamente con los cobrados del día actual que no se han cerrado
        const cobrados = pedidos.filter(p => p.estado === 'Cobrado');

        let totalDineroRecaudado = 0;
        let resumenProductos = {};

        cobrados.forEach(p => {
            totalDineroRecaudado += p.total || 0;
            if (p.detalle) {
                p.detalle.forEach(d => {
                    if (!resumenProductos[d.plato]) {
                        resumenProductos[d.plato] = { cantidad: 0, precio: d.precioUnitario };
                    }
                    resumenProductos[d.plato].cantidad += d.cantidad;
                });
            }
        });

        const historicoCierres = await Cierre.find().sort({ _id: -1 }).limit(10);

        res.json({
            pedidos,
            totalDineroRecaudado,
            resumenProductos,
            historicoCierres
        });
    } catch (e) {
        res.status(500).json({ error: "Error al obtener pedidos" });
    }
});

app.post('/api/pedidos', async (req, res) => {
    try {
        const ultimo = await Pedido.findOne().sort({ id: -1 });
        const nuevoId = ultimo && ultimo.id ? ultimo.id + 1 : 1;

        const nuevoPedido = new Pedido({
            id: nuevoId,
            cliente: req.body.cliente,
            mesa: req.body.mesa,
            tipo: req.body.tipo || 'Mesa',
            detalle: req.body.detalle,
            total: req.body.total,
            estado: 'Pendiente'
        });

        await nuevoPedido.save();
        res.json({ mensaje: "Pedido guardado", pedido: nuevoPedido });
    } catch (e) {
        res.status(500).json({ error: "Error al guardar el pedido" });
    }
});

app.put('/api/pedidos/:id', async (req, res) => {
    try {
        const pedido = await Pedido.findOneAndUpdate(
            { id: req.params.id },
            {
                cliente: req.body.cliente,
                mesa: req.body.mesa,
                tipo: req.body.tipo,
                detalle: req.body.detalle,
                total: req.body.total
            },
            { new: true }
        );
        res.json({ mensaje: "Pedido actualizado", pedido });
    } catch (e) {
        res.status(500).json({ error: "Error al actualizar pedido" });
    }
});

app.delete('/api/pedidos/:id', async (req, res) => {
    try {
        await Pedido.findOneAndDelete({ id: req.params.id });
        res.json({ mensaje: "Pedido eliminado" });
    } catch (e) {
        res.status(500).json({ error: "Error al eliminar pedido" });
    }
});

app.post('/api/pedidos/:id/cobrar', async (req, res) => {
    try {
        const pedido = await Pedido.findOne({ id: req.params.id });
        if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });

        pedido.estado = 'Cobrado';
        pedido.efectivoRecibido = req.body.efectivoRecibido;
        pedido.vuelto = req.body.efectivoRecibido - pedido.total;
        pedido.metodoPago = req.body.metodoPago || 'Efectivo'; // <--- Guardamos el método de pago recibido
        await pedido.save();

        res.json({ mensaje: "Cobro exitoso", pedido });
    } catch (e) {
        res.status(500).json({ error: "Error al procesar cobro" });
    }
});

app.post('/api/cierre-dia', async (req, res) => {
    try {
        // Buscamos los cobrados del día actual que aún no se han cerrado
        const cobrados = await Pedido.find({ estado: 'Cobrado' });
        if (cobrados.length === 0) {
            return res.status(400).json({ error: "No hay pedidos cobrados para cerrar el día." });
        }

        let totalVentas = 0;
        let resumenProductos = {};

        cobrados.forEach(p => {
            totalVentas += p.total;
            p.detalle.forEach(d => {
                if (!resumenProductos[d.plato]) resumenProductos[d.plato] = { cantidad: 0, precio: d.precioUnitario };
                resumenProductos[d.plato].cantidad += d.cantidad;
            });
        });

        // Guardamos el reporte resumen en la colección de Cierres históricos
        const nuevoCierre = new Cierre({
            fecha: new Date().toLocaleDateString(),
            totalVentas,
            totalPedidos: cobrados.length,
            resumenProductos
        });
        await nuevoCierre.save();

        // Archiva los pedidos cambiando su estado a 'Cerrado'
        await Pedido.updateMany({ estado: { $in: ['Cobrado', 'Pendiente'] } }, { estado: 'Cerrado' });

        res.json({ mensaje: "¡Cierre de jornada realizado con éxito y registros guardados de forma segura!" });
    } catch (e) {
        res.status(500).json({ error: "Error al realizar el cierre" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));

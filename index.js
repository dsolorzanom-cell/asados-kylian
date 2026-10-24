const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
        .catch(err => console.error('❌ Error al conectar a MongoDB:', err));
} else {
    console.warn('⚠️ No se encontró MONGODB_URI en las variables de entorno.');
}

// Esquemas de MongoDB
const pedidoSchema = new mongoose.Schema({
    id: Number,
    cliente: String,
    mesa: String,
    detalle: Array,
    total: Number,
    estado: { type: String, default: 'Pendiente' },
    efectivoRecibido: Number,
    vuelto: Number,
    fecha: { type: Date, default: Date.now }
});

const cierreSchema = new mongoose.Schema({
    fecha: String,
    totalVentas: Number,
    totalPedidos: Number,
    resumenProductos: Object,
    pedidos: Array
});

const Pedido = mongoose.model('Pedido', pedidoSchema);
const Cierre = mongoose.model('Cierre', cierreSchema);

// Menú Fijo
const menu = [
    { id: 1, categoria: "Carnes", nombre: "Carne Asada (Arroz Moro o Blanco)", precio: 3.50 },
    { id: 2, categoria: "Carnes", nombre: "Pollo Asado (Arroz Moro o Blanco)", precio: 3.50 },
    { id: 3, categoria: "Carnes", nombre: "Chuleta Asada (Arroz Moro o Blanco)", precio: 3.50 },
    { id: 4, categoria: "Carnes", nombre: "Costilla Asada (Arroz Moro o Blanco)", precio: 4.00 },
    { id: 5, categoria: "Carnes", nombre: "Ubre Asada (Arroz Moro o Blanco)", precio: 4.00 },
    { id: 6, categoria: "Carnes", nombre: "Molleja Asada (Arroz Moro o Blanco)", precio: 3.50 },
    { id: 7, categoria: "Carnes", nombre: "Chuzo de Carne o Pollo", precio: 2.00 },
    { id: 8, categoria: "Porciones", nombre: "Porción de Arroz (Moro o Blanco)", precio: 1.00 },
    { id: 9, categoria: "Porciones", nombre: "Porción de Menestra", precio: 1.00 },
    { id: 10, categoria: "Porciones", nombre: "Porción de Papas Fritas", precio: 1.00 },
    { id: 11, categoria: "Porciones", nombre: "Porción de Chifle", precio: 1.00 },
    { id: 12, categoria: "Porciones", nombre: "Porción de Ensalada", precio: 1.00 },
    { id: 13, categoria: "Porciones", nombre: "Consomé de Menudencia", precio: 1.00 },
    { id: 14, categoria: "Bebidas", nombre: "Gaseosa Personal", precio: 0.60 },
    { id: 15, categoria: "Bebidas", nombre: "Gaseosa 1 Litro", precio: 1.25 },
    { id: 16, categoria: "Bebidas", nombre: "Gaseosa 3 Litros", precio: 2.50 },
    { id: 17, categoria: "Bebidas", nombre: "Jarra de Agua aromática / Té", precio: 1.00 }
];

// RUTAS API

// Obtener Menú
app.get('/api/menu', (req, res) => {
    res.json(menu);
});

// Obtener Pedidos del Día y Reporte
app.get('/api/pedidos', async (req, res) => {
    try {
        const pedidos = await Pedido.find().sort({ id: 1 });
        
        let totalDineroRecaudado = 0;
        let resumenProductos = {};

        menu.forEach(p => {
            resumenProductos[p.nombre] = { cantidad: 0, total: 0 };
        });

        pedidos.forEach(p => {
            if (p.estado === 'Cobrado') {
                totalDineroRecaudado += p.total;
                p.detalle.forEach(item => {
                    const platoBase = menu.find(m => m.id === item.platoIdReal);
                    const nombreMenu = platoBase ? platoBase.nombre : item.plato;
                    if (!resumenProductos[nombreMenu]) {
                        resumenProductos[nombreMenu] = { cantidad: 0, total: 0 };
                    }
                    resumenProductos[nombreMenu].cantidad += item.cantidad;
                    resumenProductos[nombreMenu].total += (item.precioUnitario * item.cantidad);
                });
            }
        });

        const cierres = await Cierre.find().sort({ _id: -1 });

        res.json({
            pedidos,
            totalDineroRecaudado,
            resumenProductos,
            historicoCierres: cierres
        });
    } catch (error) {
        res.status(500).json({ error: "Error al obtener pedidos" });
    }
});

// Crear Pedido
app.post('/api/pedidos', async (req, res) => {
    try {
        const { cliente, mesa, items } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ error: "El pedido debe incluir al menos un plato." });
        }

        const ultimoPedido = await Pedido.findOne().sort({ id: -1 });
        const nuevoId = ultimoPedido ? ultimoPedido.id + 1 : 1;

        let totalCalculado = 0;
        const detalleProcesado = items.map(item => {
            let platoIdReal = item.platoId;
            let sufijoArroz = "";
            if (typeof item.platoId === 'string' && item.platoId.includes('_')) {
                const partes = item.platoId.split('_');
                platoIdReal = parseInt(partes[0]);
                sufijoArroz = partes[1] === 'moro' ? ' (Arroz Moro)' : ' (Arroz Blanco)';
            } else {
                platoIdReal = parseInt(item.platoId);
            }

            const plato = menu.find(p => p.id === platoIdReal);
            const nombrePlato = (plato ? plato.nombre : "Producto Especial") + sufijoArroz;
            const subtotal = item.precioUnitario * item.cantidad;
            totalCalculado += subtotal;

            return {
                platoId: item.platoId,
                platoIdReal: platoIdReal,
                plato: nombrePlato,
                tipoConsumo: item.tipoConsumo,
                precioUnitario: item.precioUnitario,
                cantidad: item.cantidad,
                subtotal: subtotal
            };
        });

        const nuevoPedido = new Pedido({
            id: nuevoId,
            cliente: cliente || "Cliente General",
            mesa: mesa || "Mesa 1",
            detalle: detalleProcesado,
            total: totalCalculado,
            estado: 'Pendiente'
        });

        await nuevoPedido.save();
        res.status(201).json(nuevoPedido);
    } catch (error) {
        res.status(500).json({ error: "Error al guardar el pedido" });
    }
});

// Actualizar Pedido
app.put('/api/pedidos/:id', async (req, res) => {
    try {
        const pedidoId = parseInt(req.params.id);
        const { cliente, mesa, items } = req.body;

        let totalCalculado = 0;
        const detalleProcesado = items.map(item => {
            let platoIdReal = item.platoId;
            let sufijoArroz = "";
            if (typeof item.platoId === 'string' && item.platoId.includes('_')) {
                const partes = item.platoId.split('_');
                platoIdReal = parseInt(partes[0]);
                sufijoArroz = partes[1] === 'moro' ? ' (Arroz Moro)' : ' (Arroz Blanco)';
            } else {
                platoIdReal = parseInt(item.platoId);
            }

            const plato = menu.find(p => p.id === platoIdReal);
            const nombrePlato = (plato ? plato.nombre : "Producto Especial") + sufijoArroz;
            const subtotal = item.precioUnitario * item.cantidad;
            totalCalculado += subtotal;

            return {
                platoId: item.platoId,
                platoIdReal: platoIdReal,
                plato: nombrePlato,
                tipoConsumo: item.tipoConsumo,
                precioUnitario: item.precioUnitario,
                cantidad: item.cantidad,
                subtotal: subtotal
            };
        });

        const pedidoActualizado = await Pedido.findOneAndUpdate(
            { id: pedidoId },
            {
                cliente: cliente || "Cliente General",
                mesa: mesa || "Mesa 1",
                detalle: detalleProcesado,
                total: totalCalculado
            },
            { new: true }
        );

        res.json(pedidoActualizado);
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar pedido" });
    }
});

// Cobrar Pedido
app.post('/api/pedidos/:id/cobrar', async (req, res) => {
    try {
        const pedidoId = parseInt(req.params.id);
        const { efectivoRecibido } = req.body;

        const pedido = await Pedido.findOne({ id: pedidoId });
        if (!pedido) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const vuelto = efectivoRecibido - pedido.total;
        pedido.estado = 'Cobrado';
        pedido.efectivoRecibido = efectivoRecibido;
        pedido.vuelto = vuelto >= 0 ? vuelto : 0;

        await pedido.save();
        res.json(pedido);
    } catch (error) {
        res.status(500).json({ error: "Error al procesar el cobro" });
    }
});

// Hacer Cierre de Día
app.post('/api/cierre-dia', async (req, res) => {
    try {
        const pedidos = await Pedido.find();
        if (pedidos.length === 0) {
            return res.status(400).json({ error: "No hay pedidos registrados hoy para cerrar." });
        }

        let totalVentas = 0;
        let resumenProductos = {};

        pedidos.forEach(p => {
            if (p.estado === 'Cobrado') {
                totalVentas += p.total;
                p.detalle.forEach(item => {
                    const platoBase = menu.find(m => m.id === item.platoIdReal);
                    const nombreMenu = platoBase ? platoBase.nombre : item.plato;
                    if (!resumenProductos[nombreMenu]) {
                        resumenProductos[nombreMenu] = 0;
                    }
                    resumenProductos[nombreMenu] += item.cantidad;
                });
            }
        });

        const nuevoCierre = new Cierre({
            fecha: new Date().toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' }),
            totalVentas,
            totalPedidos: pedidos.length,
            resumenProductos,
            pedidos
        });

        await nuevoCierre.save();
        await Pedido.deleteMany({}); // Limpiar pedidos del día

        res.json({ mensaje: "Cierre de día realizado con éxito.", cierre: nuevoCierre });
    } catch (error) {
        res.status(500).json({ error: "Error al realizar el cierre" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});

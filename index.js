const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let menu = [
    { id: 1, nombre: "Carne Asada", precio: 4.00, categoria: "Carnes" },
    { id: 2, nombre: "Pollo Asado", precio: 3.50, categoria: "Carnes" },
    { id: 3, nombre: "Chuleta Asada", precio: 3.50, categoria: "Carnes" },
    { id: 4, nombre: "Costilla Asada", precio: 6.00, categoria: "Carnes" },
    { id: 5, nombre: "Ternera Asada", precio: 3.00, categoria: "Carnes" },
    { id: 6, nombre: "Arroz Moro o Blanco", precio: 2.00, categoria: "Porciones" },
    { id: 7, nombre: "Patacones", precio: 1.50, categoria: "Porciones" },
    { id: 8, nombre: "Ternera Adicional", precio: 1.25, categoria: "Porciones" },
    { id: 9, nombre: "Tarrina Menestra Pequeña", precio: 1.25, categoria: "Porciones" },
    { id: 10, nombre: "Tarrina Menestra Grande", precio: 2.50, categoria: "Porciones" },
    { id: 11, nombre: "Coca Cola Lt", precio: 1.75, categoria: "Bebidas" },
    { id: 12, nombre: "Gaseosa Lt Varios", precio: 1.50, categoria: "Bebidas" },
    { id: 13, nombre: "Fuze Tea", precio: 0.75, categoria: "Bebidas" },
    { id: 14, nombre: "Fuze Tea Lt", precio: 1.25, categoria: "Bebidas" },
    { id: 15, nombre: "Agua", precio: 0.50, categoria: "Bebidas" },
    { id: 16, nombre: "Cola Personal", precio: 0.50, categoria: "Bebidas" }
];

let pedidos = [];
let historicoCierres = [];

app.get('/api/menu', (req, res) => {
    res.json(menu);
});

app.get('/api/pedidos', (req, res) => {
    const totalVentas = pedidos.reduce((acc, p) => (p.estado === 'Cobrado' ? acc + p.total : acc), 0);
    
    let resumenProductos = {};
    menu.forEach(p => {
        resumenProductos[p.nombre] = { cantidad: 0, categoria: p.categoria };
    });

    pedidos.forEach(p => {
        if (p.estado === 'Cobrado') {
            p.detalle.forEach(item => {
                if (resumenProductos[item.plato]) {
                    resumenProductos[item.plato].cantidad += item.cantidad;
                } else {
                    resumenProductos[item.plato] = { cantidad: item.cantidad, categoria: "Otros" };
                }
            });
        }
    });

    res.json({
        totalPedidos: pedidos.length,
        totalDineroRecaudado: totalVentas,
        resumenProductos: resumenProductos,
        pedidos: pedidos,
        historicoCierres: historicoCierres
    });
});

app.post('/api/pedidos', (req, res) => {
    const { cliente, mesa, items } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ error: "El pedido debe contener al menos un plato." });
    }

    let detalle = [];
    let totalPedido = 0;

    items.forEach(item => {
        const plato = menu.find(p => p.id === item.platoId);
        const nombrePlato = plato ? plato.nombre : "Producto Especial";
        const precioAplicado = parseFloat(item.precioUnitario);
        const cantidad = parseInt(item.cantidad);
        const subtotal = precioAplicado * cantidad;
        totalPedido += subtotal;

        detalle.push({
            platoId: item.platoId,
            plato: nombrePlato,
            tipoConsumo: item.tipoConsumo || 'Mesa',
            precioUnitario: precioAplicado,
            cantidad: cantidad,
            subtotal: subtotal
        });
    });

    const nuevoPedido = {
        id: pedidos.length + 1,
        cliente: cliente || "Cliente Genérico",
        mesa: mesa || "Mesa 1",
        fecha: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
        estado: "Pendiente",
        detalle: detalle,
        total: totalPedido
    };

    pedidos.push(nuevoPedido);
    res.status(201).json({ mensaje: "¡Pedido registrado!", pedido: nuevoPedido });
});

app.put('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { cliente, mesa, items, estado } = req.body;
    const pedidoIndex = pedidos.findIndex(p => p.id === id);

    if (pedidoIndex === -1) {
        return res.status(404).json({ error: "Pedido no encontrado" });
    }

    if (items) {
        let detalle = [];
        let totalPedido = 0;

        items.forEach(item => {
            const plato = menu.find(p => p.id === item.platoId);
            const nombrePlato = plato ? plato.nombre : "Producto Especial";
            const precioAplicado = parseFloat(item.precioUnitario);
            const cantidad = parseInt(item.cantidad);
            const subtotal = precioAplicado * cantidad;
            totalPedido += subtotal;

            detalle.push({
                platoId: item.platoId,
                plato: nombrePlato,
                tipoConsumo: item.tipoConsumo || 'Mesa',
                precioUnitario: precioAplicado,
                cantidad: cantidad,
                subtotal: subtotal
            });
        });

        pedidos[pedidoIndex].detalle = detalle;
        pedidos[pedidoIndex].total = totalPedido;
    }

    if (cliente) pedidos[pedidoIndex].cliente = cliente;
    if (mesa) pedidos[pedidoIndex].mesa = mesa;
    if (estado) pedidos[pedidoIndex].estado = estado;

    res.json({ mensaje: "Pedido actualizado", pedido: pedidos[pedidoIndex] });
});

// NUEVA RUTA PARA PROCESAR EL COBRO
app.post('/api/pedidos/:id/cobrar', (req, res) => {
    const id = parseInt(req.params.id);
    const { efectivoRecibido } = req.body;
    const pedido = pedidos.find(p => p.id === id);

    if (!pedido) {
        return res.status(404).json({ error: "Pedido no encontrado" });
    }

    pedido.estado = "Cobrado";
    pedido.efectivoRecibido = parseFloat(efectivoRecibido) || pedido.total;
    pedido.vuelto = pedido.efectivoRecibido - pedido.total;

    res.json({ mensaje: "¡Pedido cobrado con éxito!", pedido });
});

app.post('/api/cierre-dia', (req, res) => {
    if (pedidos.length === 0) {
        return res.status(400).json({ error: "No hay pedidos registrados para cerrar el día." });
    }

    const fechaCierre = new Date().toLocaleDateString();
    const totalVentasDia = pedidos.reduce((acc, p) => (p.estado === 'Cobrado' ? acc + p.total : acc), 0);

    let resumenProductos = {};
    menu.forEach(p => {
        resumenProductos[p.nombre] = { cantidad: 0, categoria: p.categoria };
    });

    pedidos.forEach(p => {
        if (p.estado === 'Cobrado') {
            p.detalle.forEach(item => {
                if (resumenProductos[item.plato]) {
                    resumenProductos[item.plato].cantidad += item.cantidad;
                }
            });
        }
    });

    historicoCierres.unshift({
        fecha: fechaCierre,
        totalVentas: totalVentasDia,
        totalPedidos: pedidos.length,
        resumenProductos: resumenProductos,
        pedidosDelDia: [...pedidos]
    });

    pedidos = [];

    res.json({ mensaje: "¡Cierre de día realizado con éxito!", fecha: fechaCierre, totalVentas: totalVentasDia });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

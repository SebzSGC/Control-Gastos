---
title: "Catálogo de Endpoints REST de la API PaySync"
tags: [api, rest, backend, endpoints, paysync]
aliases: ["API REST", "Endpoints", "Rutas Backend"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🌐 Catálogo de Endpoints de la API REST

La API del backend está montada sobre Express 5 y escucha por defecto en el puerto `3001` (o en la variable `PORT`). Todas las respuestas son codificadas en formato JSON.

---

## 🩺 Salud y Monitoreo

### `GET /api/health` o `/health`
Verifica el estado del servicio y la conectividad con la base de datos SQLite.
* **Respuesta 200 OK:**
```json
{
  "status": "healthy",
  "service": "PaySync API",
  "database": "connected",
  "uptime": 124.5,
  "memoryUsageMB": 42
}
```

---

## 👥 Grupos y Perfiles

### `POST /api/groups`
Crea una nueva sala o grupo de gastos.
* **Body:**
  ```json
  { "id": "VIAJE2026", "name": "Viaje a Cancún" }
  ```

### `GET /api/groups/:id`
Obtiene la información consolidada del grupo: lista de perfiles, gastos registrados y facturas divididas.

### `POST /api/profiles`
Agrega un participante a un grupo.
* **Body:**
  ```json
  {
    "groupId": "VIAJE2026",
    "name": "Sebas",
    "paymentKey": "sebas.mp",
    "paymentQr": ""
  }
  ```

### `PUT /api/profiles/:id`
Actualiza el nombre, clave de pago o código QR de un perfil existente.

---

## 💸 Gastos y Liquidaciones

### `POST /api/expenses`
Registra un nuevo gasto grupal o pago directo entre miembros. Emite notificación instantánea vía Socket.io (`expense_added`).
* **Body:**
  ```json
  {
    "groupId": "VIAJE2026",
    "profileId": "prof-uuid-1",
    "amount": 450.00,
    "description": "Cena de bienvenida",
    "category": "comida",
    "type": "expense"
  }
  ```

### `DELETE /api/expenses/:id`
Elimina un gasto registrado por su identificador. Emite el evento `expense_deleted`.

### `GET /api/groups/:id/settlement`
Calcula la matriz neta de deudas y devuelve la lista optimizada de transferencias requeridas mediante el [[02_Backend/Algoritmo-Liquidacion|Algoritmo de Liquidación Greedy]].
* **Respuesta 200 OK:**
  ```json
  {
    "totalSpent": 1500.0,
    "perPersonShare": 500.0,
    "balances": { "prof-1": 1000.0, "prof-2": -500.0, "prof-3": -500.0 },
    "transactions": [
      { "from": "prof-2", "to": "prof-1", "amount": 500.0 },
      { "from": "prof-3", "to": "prof-1", "amount": 500.0 }
    ]
  }
  ```

---

## 🧾 Facturas y Visión Artificial (OCR)

### `POST /api/upload-receipt`
Carga un ticket de compra (JPEG/PNG/WebP, máx 5MB). Ejecuta el preprocesamiento Jimp y la extracción OCR con Tesseract.js.
* **Respuesta 200 OK:**
  ```json
  {
    "success": true,
    "storeName": "Supermercado Central",
    "total": 35.50,
    "items": [
      { "name": "Leche entera", "quantity": 2, "price": 3.00 },
      { "name": "Pan artesanal", "quantity": 1, "price": 2.50 }
    ]
  }
  ```

---

## 📲 Simulación NFC

### `POST /api/nfc/resolve`
Interpreta un payload crudo de etiqueta NFC (NDEF URL o código) y devuelve el identificador sanitizado del grupo correspondiente.

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[02_Backend/Algoritmo-Liquidacion|Algoritmo de Liquidación de Deudas]]

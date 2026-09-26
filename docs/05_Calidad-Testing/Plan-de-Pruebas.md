---
title: "Plan de Pruebas y Estrategia de Aseguramiento de Calidad (QA)"
tags: [qa, testing, calidad, pruebas, integracion, unitarias, paysync]
aliases: ["Plan de Pruebas", "Estrategia QA", "Test Suite"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🧪 Plan de Pruebas y Estrategia QA

PaySync cuenta con una batería de pruebas de integración y unitarias automatizadas que garantizan la estabilidad de los endpoints REST, el ciclo de vida de las sesiones en vivo y la precisión matemática del pipeline de visión artificial.

---

## 🧭 Pirámide y Niveles de Testing

```mermaid
flowchart TD
    E2E["🌐 Pruebas End-to-End & Concurrencia\n(Simulación NFC + Flujo de Comanda Viva con Sockets)"]
    Integ["⚙️ Pruebas de Integración de Endpoints REST\n(backend/tests/test_api_endpoints.js - 8 Casos)"]
    Unit["🔬 Pruebas Unitarias de Visión y Matemáticas\n(backend/tests/test_vision_pipeline.js - 3 Casos)"]

    Unit --> Integ
    Integ --> E2E
```

---

## 1. 👁️ Suite de Pruebas del Pipeline de Visión (`test_vision_pipeline.js`)

Valida la robustez del motor OCR y las reglas de reconciliación monetaria:

```bash
node backend/tests/test_vision_pipeline.js
```

### Casos de Prueba Verificados
1. **Sanitización de Facturas Complejas:**
   - Evalúa comprobantes colombianos con propina voluntaria (10%), impuesto al consumo (8%) y precios con separador de miles.
   - **Criterio de Éxito:** `mathVerified: true`, `confidence: "high"`, cuadre exacto de `subtotal + tip + tax - discount == total`.
2. **Autocálculo de Precios y Cantidades Faltantes:**
   - Inyecta datos incompletos (cantidades en cero o precios unitarios omitidos por el POS).
   - **Criterio de Éxito:** La cantidad nula se normaliza a 1 y el precio unitario se calcula automáticamente a partir del subtotal.
3. **Preprocesamiento de Imágenes con Jimp:**
   - Procesa un búfer sintético de alta resolución (2400x1600 px).
   - **Criterio de Éxito:** Se redimensiona por debajo de 1800 px de ancho/alto y se rota 90° sin degradar la memoria.

---

## 2. ⚡ Suite de Integración de la API REST (`test_api_endpoints.js`)

Se ejecuta en un entorno aislado con base de datos SQLite en memoria (`DATABASE_PATH=:memory:`) y puerto TCP efímero (`PORT=0`):

```bash
node backend/tests/test_api_endpoints.js
```

### Casos de Integración Validados

| # | Módulo / Escenario | Endpoints Involucrados | Aserción Principal |
| :-: | :--- | :--- | :--- |
| **1** | Chequeo de Salud y Disponibilidad | `GET /api/health`, `GET /health` | Estado HTTP 200, `"status": "healthy"`, `"service": "PaySync API"`. |
| **2** | Estado del Servicio de Visión | `GET /api/vision-status` | Detección de claves de API activas en el servidor. |
| **3** | Creación de Grupo y Resolución NFC | `POST /api/groups`, `POST /api/nfc/resolve` | Resolución exitosa tanto por código crudo (`VIAJE2026`) como por URL (`https://paysync.app/group/VIAJE2026`). |
| **4** | Gestión de Participantes (CRUD) | `POST /api/profiles`, `PUT /api/profiles/:id` | Creación de participantes y actualización de llaves de cobro. |
| **5** | Gastos, Transferencias y Borrado | `POST /api/expenses`, `DELETE /api/expenses/:id` | Creación con HTTP 201, transferencia entre perfiles y supresión controlada. |
| **6** | Ciclo de Vida de Comanda Viva | `POST /api/bill-sessions`, `GET /api/bill-sessions/active/:id`, `PUT /api/bill-sessions/:id/close` | Creación de sesión activa, consulta en vivo y cierre formal. |
| **7** | Factura Detallada con Ítems y Splits | `POST /api/bills`, `GET /api/bills/:id` | Persistencia y recuperación con desglose individual de platos por comensal. |
| **8** | Resumen y Algoritmo Greedy | `GET /api/groups/:id`, `GET /api/groups/:id/settlement` | Cálculo del `fairShare` y generación de matriz de saldos minimizada. |

---

## 3. 🎨 Verificación de Calidad Frontend

- **Compilación de Producción:**
  ```bash
  cd frontend && npm run build
  ```
  Asegura que no existan errores de sintaxis, dependencias faltantes o problemas de bundle en Vite y React 19.
- **Análisis Estático (Linter):**
  ```bash
  cd frontend && npm run lint
  ```
  Supervisa buenas prácticas de código y previene advertencias de hooks en React.

---

## 4. 🚀 Criterios de Aceptación para Producción

Un despliegue a producción solo se considera aprobado si cumple simultáneamente con:
1. `test_vision_pipeline.js`: 100% de aserciones aprobadas sin errores.
2. `test_api_endpoints.js`: 8 de 8 pruebas de integración pasadas con éxito.
3. Compilación de Vite limpia sin advertencias de dependencias circulares.
4. Cobertura funcional documentada en la [[05_Calidad-Testing/Matriz-de-Trazabilidad|Matriz de Trazabilidad QA]].

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[05_Calidad-Testing/Matriz-de-Trazabilidad|Matriz de Requisitos vs. Cobertura QA]]
- Relacionado: [[02_Backend/API-REST-Endpoints|Endpoints REST]] | [[02_Backend/Pipeline-OCR-Vision|Pipeline OCR]]

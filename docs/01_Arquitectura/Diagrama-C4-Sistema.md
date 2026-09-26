---
title: "Diagrama C4 y Arquitectura del Sistema"
tags: [arquitectura, c4, express, sqlite, react, websockets, paysync]
aliases: ["Diagrama C4", "Arquitectura en Capas", "C4 Model"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🏛️ Arquitectura del Sistema y Diagrama C4

El sistema **PaySync** está diseñado bajo una arquitectura web reactiva, modular y desacoplada, orientada al procesamiento en tiempo real de transacciones colaborativas y la digitalización inteligente de comprobantes de pago.

---

## 📐 Niveles del Modelo C4

### Nivel 1: Diagrama de Contexto del Sistema

Describe cómo interactúan los usuarios finales con la plataforma PaySync y sus integraciones externas (modelos de visión artificial y pasarelas de cobro).

```mermaid
flowchart TD
    UserA["👤 Usuario Host (Creador/Pagador)"]
    UserB["👥 Participantes del Grupo (Compañeros)"]
    
    subgraph PaySyncSystem["🌐 Plataforma PaySync"]
        PaySync["💻 Aplicación Web PaySync\n(React 19 SPA + Express 5 API)"]
    end
    
    subgraph ExternalServices["☁️ Servicios Externos"]
        Gemini["🤖 Google Gemini Vision API\n(gemini-2.0-flash / 1.5-flash)"]
        OpenAI["🧠 OpenAI GPT-4o-mini API\n(Fallback Multimodal)"]
        PaymentNFC["📱 Terminales NFC / Billeteras\n(Bizum / CVU / Nequi / Bre-B)"]
    end

    UserA -->|"Crea grupo, escanea tickets y divide facturas"| PaySync
    UserB -->|"Se une vía NFC/Link, reclama consumos en vivo"| PaySync
    PaySync -->|"Extrae ítems de tickets vía OCR"| Gemini
    PaySync -.->|"Fallback OCR secundario"| OpenAI
    UserB -->|"Liquida saldos vía claves o códigos QR"| PaymentNFC
```

---

### Nivel 2: Diagrama de Contenedores

Detalla los componentes lógicos que conforman la infraestructura de ejecución de PaySync.

```mermaid
flowchart TB
    subgraph ClientLayer["🖥️ Capa de Presentación (Frontend SPA)"]
        Browser["🌐 Navegador Web (Móvil / Desktop)"]
        ReactApp["⚛️ React 19 SPA\n(Vite 8, TailwindCSS, Recharts)\nPuerto 80 o 3001"]
    end

    subgraph ServerLayer["⚙️ Capa de Aplicación (Backend Node.js)"]
        ExpressApp["⚡ Express 5 Server\n(API REST + Middlewares)\nPuerto 3001"]
        SocketServer["📡 Socket.io Server v4\n(WebSockets en Tiempo Real)"]
        VisionModule["👁️ Pipeline de Visión Artificial\n(Jimp + Tesseract.js spa+eng)"]
        GreedyEngine["🧮 Motor de Liquidación Greedy\n(Min-Cash-Flow Algorithm)"]
    end

    subgraph DataLayer["🗄️ Capa de Persistencia"]
        SQLiteDB[("💾 SQLite 3 DB\n(WAL Mode, Foreign Keys On)\n/app/data/app_data.db")]
    end

    Browser -->|"HTTP / HTTPS (REST API)"| ExpressApp
    Browser <-->|"WSS / WS (Bidireccional)"| SocketServer
    ExpressApp -->|"Persiste y consulta transacciones"| SQLiteDB
    ExpressApp -->|"Procesa tickets físicos"| VisionModule
    ExpressApp -->|"Calcula saldos optimizados"| GreedyEngine
    SocketServer -->|"Emite eventos a salas de grupo"| Browser
```

---

### Nivel 3: Diagrama de Componentes (Backend & Frontend)

```mermaid
flowchart LR
    subgraph FrontendComponents["🎨 Componentes Frontend"]
        DashView["Dashboard.jsx"]
        BentoCards["DashboardSummaryCards"]
        ExpList["ExpensesList"]
        LiveModal["LiveBillClaimModal"]
        BillModal["BillSplitterModal"]
    end

    subgraph BackendRoutes["🛣️ Enrutadores REST"]
        GroupRoutes["groups.routes.js"]
        ExpenseRoutes["expenses.routes.js"]
        BillRoutes["bills.routes.js"]
        VisionRoutes["vision.routes.js"]
        NFCRoutes["nfc.routes.js"]
    end

    subgraph BackendServices["⚙️ Servicios de Dominio"]
        SocketHandler["socketHandler.js"]
        ReceiptVision["receiptVisionService.js"]
        ImagePreproc["imagePreprocessor.js"]
        DBConfig["config/db.js"]
    end

    DashView --> GroupRoutes
    DashView --> ExpenseRoutes
    LiveModal <--> SocketHandler
    BillModal --> VisionRoutes
    VisionRoutes --> ImagePreproc
    VisionRoutes --> ReceiptVision
    ExpenseRoutes --> DBConfig
    BillRoutes --> DBConfig
```

---

## 🔒 Políticas y Principios Arquitectónicos

1. **Persistencia Ligera y Confiable (SQLite3):**
   - Habilitación forzada de integridad referencial: `PRAGMA foreign_keys = ON;`.
   - Soporte para bases de datos en disco persistente o memoria en testing (`DATABASE_PATH=:memory:`).
   - Acceso mono-proceso (modo *fork* en PM2) para prevenir bloqueos por concurrencia de escritura en disco.

2. **Sincronización Reactiva sin Polling:**
   - La arquitectura evita consultas periódicas de sondeo (*polling*). Todos los cambios de estado (creación de gastos, adición de facturas y asignación de ítems en vivo) se propagan de forma instantánea a través de salas dedicadas de Socket.io (`socket.join(groupId)`).

3. **Arquitectura Desacoplable:**
   - Puede desplegarse como un monolito unificado (contenedor único donde Express sirve los estáticos compilados de React) o desacoplada (Frontend en Nginx o Vercel y Backend en Render/Railway/Fly.io).

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[01_Arquitectura/Base-de-Datos-ER|Modelo de Base de Datos y Esquema SQLite]]
- Relacionado: [[02_Backend/API-REST-Endpoints|Catálogo de Endpoints REST]] | [[02_Backend/WebSockets-Eventos|Catálogo de Eventos WebSockets]]

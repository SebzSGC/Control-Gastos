---
title: "Visión General del Sistema y Stack Tecnológico"
tags: [arquitectura, vision, stack, paysync]
aliases: ["Visión General", "Stack Tecnológico"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🏛️ Visión General del Sistema PaySync

**PaySync** es una solución fintech integral diseñada para resolver la fricción financiera en gastos compartidos (viajes grupales, pisos compartidos, cenas y eventos de amigos).

---

## 🎯 Pilares del Negocio

1. **Digitalización Inmediata de Gastos:**
   A través de [[02_Backend/Pipeline-OCR-Vision|OCR Multimodal]], los usuarios pueden subir la fotografía de una factura o ticket físico; el sistema extrae automáticamente el desglose de productos, cantidades y precios unitarios.
2. **Colaboración en Tiempo Real:**
   Las sesiones de compra permiten a cada usuario reclamar lo que consumió en vivo mediante [[02_Backend/WebSockets-Eventos|WebSockets]], calculando de forma automática los impuestos (`tax`), propinas (`tip`) y descuentos (`discount`) proporcionales.
3. **Simulación NFC:**
   Permite a los usuarios emparejar dispositivos o compartir salas de gasto mediante la aproximación virtual de terminales móviles.
4. **Optimización de Saldos:**
   Implementa un [[02_Backend/Algoritmo-Liquidacion|algoritmo de optimización de deudas]] que reduce drásticamente el número de pagos entre personas (por ejemplo, si A le debe a B y B le debe a C, A le paga directamente a C).

---

## 🛠️ Stack Tecnológico

| Capa | Componente | Versión / Detalle |
| :--- | :--- | :--- |
| **Frontend** | React SPA | React 19, Vite 8, React Router DOM 7 |
| **Estilos** | CSS Framework | TailwindCSS, Lucide React, Recharts |
| **Backend** | Runtime & API | Node.js (>=18), Express 5 |
| **Base de Datos** | Persistencia Relacional | SQLite3 con transacciones y foreign keys |
| **Tiempo Real** | WebSockets | Socket.io 4 (Cliente y Servidor) |
| **Visión Artificial** | OCR & Preprocesamiento | Jimp + Tesseract.js (modelos offline `spa` y `eng`) + Gemini/OpenAI opcional |
| **Contenerización** | Infraestructura | Docker (Multi-stage), Docker Compose (unificado y desacoplado) |
| **Hosting Cloud** | Plataformas Validadas | Vercel (Front), Render / Railway / Fly.io / VPS (Back) |

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[01_Arquitectura/Base-de-Datos-ER|Modelo de Base de Datos SQLite]]

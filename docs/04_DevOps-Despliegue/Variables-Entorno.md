---
title: "Matriz de Variables de Entorno y Configuración"
tags: [devops, configuracion, env, seguridad, paysync]
aliases: ["Variables de Entorno", "Configuración .env", "Secrets"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🔐 Matriz de Variables de Entorno y Configuración

PaySync centraliza sus opciones de ejecución a través de variables de entorno estándar. En entornos locales o de desarrollo, estas variables pueden declararse en un archivo `.env` en la raíz del proyecto.

---

## 🛠️ Variables del Backend (Node.js / Express 5)

| Variable | Tipo | Valor por Defecto | Obligatoria | Descripción / Propósito |
| :--- | :--- | :--- | :---: | :--- |
| `PORT` | Número | `3001` | No | Puerto TCP donde el servidor Express y Socket.io escuchan peticiones. |
| `NODE_ENV` | String | `development` | Sí (en prod) | Define el entorno de ejecución (`development`, `production`, `test`). |
| `DATABASE_PATH` | Ruta / URI | `./backend/app_data.db` | No | Ruta al archivo físico de SQLite3 o `:memory:` para pruebas aisladas. |
| `CORS_ORIGIN` | String | `*` | No | Orígenes HTTP autorizados para CORS y WebSockets (ej. `https://paysync.app`). |
| `GEMINI_API_KEY` | Secret | *Vacío* | No | Clave de API de Google AI Studio para el [[02_Backend/Pipeline-OCR-Vision|Pipeline OCR]]. Si no se define, se recurre a OpenAI o Tesseract offline. |
| `OPENAI_API_KEY` | Secret | *Vacío* | No | Clave de OpenAI para fallback con GPT-4o-mini en la extracción de tickets. |

---

## 🎨 Variables del Frontend (React / Vite)

> [!NOTE]
> En Vite, todas las variables destinadas al cliente deben llevar obligatoriamente el prefijo `VITE_`.

| Variable | Valor por Defecto | Descripción |
| :--- | :--- | :--- |
| `VITE_API_URL` | Auto-detectado (`/api`) | URL base para peticiones REST hacia el backend (ej. `http://localhost:3001/api`). |
| `VITE_SOCKET_URL` | Auto-detectado (`window.location.origin`) | URL del servidor Socket.io para el canal en tiempo real. |

---

## 🔒 Buenas Prácticas de Seguridad

1. **Gestión de Secretos:**
   - **NUNCA** subas el archivo `.env` al repositorio de Git (está expresamente incluido en `.gitignore`).
   - En plataformas Cloud (Render, Fly.io, Railway, Vercel), inyecta `GEMINI_API_KEY` y `OPENAI_API_KEY` como **Environment Secrets** cifrados.
2. **CORS Restringido en Producción:**
   - En producción, reemplaza el comodín `CORS_ORIGIN=*` por el dominio exacto del frontend para mitigar ataques de orígenes no autorizados.

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[05_Calidad-Testing/Plan-de-Pruebas|Estrategia y Plan de Testing]]
- Relacionado: [[04_DevOps-Despliegue/Despliegue-Cloud|Guía de Despliegue Multi-Cloud]] | [[04_DevOps-Despliegue/Guia-Docker-Compose|Guía Docker Compose]]

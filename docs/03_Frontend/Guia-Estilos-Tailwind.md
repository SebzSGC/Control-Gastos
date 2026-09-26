---
title: "Sistema de Diseño y Guía de Estilos TailwindCSS"
tags: [frontend, ui, css, tailwind, diseño, tema, paysync]
aliases: ["Guía de Estilos", "TailwindCSS", "Sistema de Diseño"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🎨 Sistema de Diseño y Guía de Estilos TailwindCSS

PaySync implementa una estética moderna basada en el paradigma **Bento Grid** y **Glassmorphism**, optimizada para lectura rápida en pantallas móviles bajo condiciones de poca luz (restaurantes, bares y eventos nocturnos).

---

## 🎨 Paleta de Colores y Tokens Visuales

| Token | Propósito | Clase Tailwind (Dark) | Clase Tailwind (Light) |
| :--- | :--- | :--- | :--- |
| **Primary (Brand)** | Acciones clave, botones y resaltados | `bg-emerald-500` / `text-emerald-400` | `bg-emerald-600` / `text-emerald-600` |
| **Surface Base** | Fondo principal de la aplicación | `bg-slate-950` (`#020617`) | `bg-slate-50` (`#f8fafc`) |
| **Surface Card** | Contenedores modulares y tarjetas | `bg-slate-900/80` con borde `border-slate-800` | `bg-white` con borde `border-slate-200` |
| **Text Primary** | Textos y números principales | `text-slate-100` | `text-slate-900` |
| **Text Muted** | Metadatos y etiquetas secundarias | `text-slate-400` | `text-slate-500` |
| **Positive / Balance** | Acreedor / Dinero a favor | `text-emerald-400` / `bg-emerald-500/10` | `text-emerald-700` / `bg-emerald-50` |
| **Negative / Debt** | Deudor / Dinero por pagar | `text-rose-400` / `bg-rose-500/10` | `text-rose-700` / `bg-rose-50` |

---

## 📱 Principios de Diseño Responsivo

1. **Mobile-First Realista:**
   - La mayoría de las interacciones (como escanear recibos con la cámara, emparejar por NFC o reclamar platos en la mesa) ocurren desde smartphones. Los elementos táctiles (*tap targets*) cuentan con una altura mínima de 44px (`min-h-[44px]`).
2. **Bento Grid Dashboard:**
   - En pantallas pequeñas (`< 768px`), las métricas se disponen en una sola columna fluida.
   - En pantallas medianas y grandes (`md:`, `lg:`), se despliegan en cuadrícula modular asimétrica de 3 columnas para aprovechar el espacio horizontal.
3. **Glassmorphism Funcional:**
   - Aplicación de `backdrop-blur-md` en la barra de navegación superior fija (`Navbar`) y en las ventanas modales emergentes para mantener la noción espacial del contexto.

---

## ✨ Micro-Interacciones y Animaciones

- **Toast Slide-In:** Animación de entrada suave desde el borde inferior/superior (`animate-slide-in`).
- **Pulsación en Vivo:** Indicador parpadeante verde (`animate-pulse`) en el icono de WebSocket y en la alerta de comanda activa.
- **Transiciones de Tema:** Interpolación suave en colores de fondo y bordes con `transition-colors duration-200`.

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[04_DevOps-Despliegue/Guia-Docker-Compose|Orquestación con Docker Compose]]
- Relacionado: [[03_Frontend/Arbol-Componentes|Árbol de Componentes]] | [[03_Frontend/Gestion-Estado|Gestión del Estado]]

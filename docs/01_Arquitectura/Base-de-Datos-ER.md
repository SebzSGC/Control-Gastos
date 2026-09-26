---
title: "Modelo Entidad-Relación y Esquema SQLite"
tags: [base-de-datos, sqlite, er, esquema]
aliases: ["Modelo de Datos", "Esquema SQLite", "ERD"]
created: 2026-09-26
author: "PaySync Team"
status: completado
---

# 🗄️ Modelo de Base de Datos y Esquema SQLite

El sistema utiliza **SQLite3** como motor de base de datos relacional rápido, autocontenido y de baja latencia, configurado con `PRAGMA foreign_keys = ON;` y persistencia en volumen montable (`DATABASE_PATH`).

---

## 📊 Diagrama Entidad-Relación (Mermaid)

```mermaid
erDiagram
    GROUPS ||--o{ PROFILES : contiene
    GROUPS ||--o{ EXPENSES : registra
    GROUPS ||--o{ BILLS : factura
    GROUPS ||--o{ ACTIVE_BILL_SESSIONS : sesiona

    PROFILES ||--o{ EXPENSES : realiza
    PROFILES ||--o{ BILLS : paga
    PROFILES ||--o{ BILL_SPLITS : asignado

    BILLS ||--o{ BILL_ITEMS : desglosa
    BILLS ||--o{ BILL_SPLITS : liquida

    GROUPS {
        string id PK "Código único de grupo (ej. VIAJE2026)"
        string name "Nombre descriptivo del grupo"
    }

    PROFILES {
        string id PK "UUID del participante"
        string group_id FK "Grupo al que pertenece"
        string name "Nombre o alias público"
        string payment_key "Clave de pago (Bizum/CVU/Alias/PayPal)"
        string payment_qr "Código QR de cobro codificado o enlace"
    }

    EXPENSES {
        string id PK "UUID del gasto"
        string group_id FK "Grupo"
        string profile_id FK "Perfil que pagó"
        real amount "Monto total pagado"
        string description "Concepto del gasto"
        string category "Categoría (comida, transporte, etc.)"
        string type "Tipo (expense o payment)"
        string to_profile_id FK "Perfil receptor si es pago directo"
        string date "Fecha ISO-8601"
    }

    BILLS {
        string id PK "UUID de la factura"
        string group_id FK "Grupo"
        string payer_profile_id FK "Perfil pagador principal"
        real total_amount "Monto total con impuestos y propina"
        real subtotal "Suma de ítems individuales"
        real tax "Impuestos aplicados"
        real tip "Propina agregada"
        real discount "Descuentos aplicados"
        string description "Descripción o nombre del comercio"
        string date "Fecha de registro"
    }

    BILL_ITEMS {
        string id PK "UUID del ítem"
        string bill_id FK "Factura a la que pertenece"
        string name "Nombre del plato o producto"
        integer quantity "Cantidad"
        real unit_price "Precio por unidad"
        real subtotal "Cantidad * unit_price"
    }

    BILL_SPLITS {
        string id PK "UUID del split"
        string bill_id FK "Factura"
        string profile_id FK "Participante responsable"
        real amount "Monto total a cargo de este participante"
        string items_summary "Detalle serializado de ítems"
    }

    ACTIVE_BILL_SESSIONS {
        string id PK "UUID de la sesión en vivo"
        string group_id FK "Grupo activo"
        string title "Título de la sesión"
        string store_name "Nombre del comercio o restaurante"
        string host_profile_id "Perfil creador de la sesión"
        string host_name "Nombre del creador"
        real subtotal "Subtotal acumulado"
        real tax "Impuestos"
        real tip "Propina"
        real discount "Descuento"
        real total_amount "Total general"
        string tax_distribution "Modo: proportional o split_equal"
        text items "JSON serializado de los ítems en juego"
        text assignments "JSON serializado de asignaciones en vivo"
        string status "active o closed"
        datetime created_at "Creación"
        datetime updated_at "Última interacción"
    }
```

---

## ⚡ Índices de Rendimiento

Para optimizar las consultas a medida que crecen las transacciones de los grupos, se implementan los siguientes índices en disco:

```sql
CREATE INDEX IF NOT EXISTS idx_profiles_group ON profiles(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_bills_group ON bills(group_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_bill ON bill_splits(bill_id);
CREATE INDEX IF NOT EXISTS idx_active_bill_sessions_group ON active_bill_sessions(group_id);
```

---

## 🔗 Navegación Rápida
- Regresar a: [[00_MOC_PaySync]]
- Siguiente: [[02_Backend/API-REST-Endpoints|Catálogo de Endpoints REST]]

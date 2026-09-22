# Referencia Técnica: Esquema de Agentes Personalizados (Custom Agents)

Esta referencia documenta en detalle todos los campos admitidos en el encabezado YAML frontmatter de los archivos de agente en Google Antigravity.

---

## Estructura YAML Frontmatter

```yaml
---
name: string                   # [Requerido] Identificador único en formato kebab-case
description: string            # [Requerido] Descripción del propósito y condiciones de activación
model: string                  # [Opcional] 'inherit' | 'flash' | 'pro' | 'flash_lite' (default: inherit)
tools: string[]                # [Opcional] Lista de nombres exactos de herramientas permitidas
skills: string[]               # [Opcional] Rutas relativas a habilidades autorizadas (ej. skills/mi-skill)
mainAgent: boolean             # [Opcional] Habilita inicio de sesión directa como agente principal
subagent: boolean              # [Opcional] Habilita delegación como subagente por otros agentes
permissionMode: string         # [Opcional] Modo de permisos (ej. acceptEdits, bypassPermissions)
commandExecutionPolicy: string # [Opcional] 'auto' para ejecución autónoma de comandos seguros
---
```

---

## Detalle de Parámetros

### 1. `name`
- **Tipo:** `string`
- **Obligatorio:** Sí
- **Reglas:** Caracteres en minúscula, números y guiones. No usar espacios ni caracteres especiales.
- **Ejemplo:** `name: backend-test-runner`

### 2. `description`
- **Tipo:** `string`
- **Obligatorio:** Sí
- **Reglas:** Redactar en tercera persona indicando claramente qué hace y en qué situaciones debe intervenir.
- **Ejemplo:** `description: Especialista en ejecutar pruebas unitarias y de integración para la API de Express y SQLite.`

### 3. `model`
- **Tipo:** `string`
- **Opciones válidas:**
  - `inherit`: Adopta el modelo configurado por la sesión principal del usuario.
  - `flash`: Modelo rápido y eficiente, ideal para búsquedas, edición de archivos y scripts.
  - `pro`: Modelo de alto rendimiento para razonamiento profundo, arquitectura y depuración compleja.
  - `flash_lite`: Modelo ultraligero y económico.

### 4. `tools`
- **Tipo:** `string[]`
- **Descripción:** Delimita el conjunto de herramientas disponibles para este agente. Si se omite, hereda el conjunto por defecto.
- **Herramientas comunes:**
  - `view_file`: Lectura de archivos.
  - `replace_file_content`: Modificación precisa de código.
  - `write_to_file`: Creación de archivos.
  - `run_command`: Ejecución en terminal.
  - `manage_task`: Control de tareas asíncronas.
  - `grep_search`: Búsqueda de patrones en el código.
  - `find_by_name`: Localización de archivos.
  - `list_dir`: Exploración de directorios.

### 5. `skills`
- **Tipo:** `string[]`
- **Descripción:** Array de identificadores o rutas de habilidades que el agente tiene autorizadas a consultar.
- **Ejemplo:**
  ```yaml
  skills:
    - skills/agentes-personalizados
    - skills/generative_ui
  ```

### 6. `mainAgent` y `subagent` (Simetría de Ejecución)
- **`mainAgent: true`**: Permite al desarrollador iniciar sesiones directas con este agente en la interfaz gráfica de Antigravity 2.0 (menú desplegable) o a través de la CLI (`agy --agent <nombre>`).
- **`subagent: true`**: Permite que un agente orquestador lo invoque dinámicamente como subagente de apoyo sin saturar su contexto.

### 7. `commandExecutionPolicy`
- **Tipo:** `string`
- **Valor:** `auto`
- **Comportamiento:** Permite ejecutar comandos no destructivos (compilación, linters, pruebas unitarias) sin pedir confirmación manual interactiva constante, manteniendo el flujo autónomo de trabajo.

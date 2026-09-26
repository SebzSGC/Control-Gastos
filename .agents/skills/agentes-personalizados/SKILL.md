---
name: agentes-personalizados
description: >-
  Guía completa para diseñar, crear y gestionar Agentes Personalizados (Custom Agents) en Google Antigravity.
  Úsalo cuando el usuario solicite crear un nuevo agente especializado, definir su archivo markdown con frontmatter YAML,
  configurar modelos, herramientas delimitadas (tools), habilidades (skills), políticas de seguridad (commandExecutionPolicy),
  o habilitar la simetría de ejecución (mainAgent y subagent) a nivel de proyecto o global.
---

# Guía de Agentes Personalizados (Custom Agents) en Antigravity

Los **Agentes Personalizados** permiten dividir proyectos complejos en roles altamente especializados, delimitando sus instrucciones, herramientas, modelos y políticas de ejecución. Esto previene el inflado del contexto (*context window bloat*) y garantiza que cada tarea sea ejecutada con el conjunto óptimo de capacidades.

---

## 1. Ubicación de los Archivos de Agente

Antigravity descubre los agentes personalizados de forma jerárquica a través de archivos Markdown (`.md`):

| Ámbito | Ruta de Almacenamiento | Propósito |
| :--- | :--- | :--- |
| **Proyecto / Workspace** | `.agents/agents/<nombre-agente>.md` | Compartido con el equipo mediante control de versiones (Git). Disponible al clonar el repositorio. |
| **Global (Usuario)** | `~/.gemini/config/agents/<nombre-agente>.md` | Disponible para todas las sesiones y proyectos en la máquina local del desarrollador. |

> [!IMPORTANT]
> A nivel de proyecto, los archivos deben colocarse dentro de la carpeta `.agents/agents/` en la raíz del repositorio.

---

## 2. Formato y Estructura del Archivo

Cada agente se define en un único archivo Markdown compuesto por:
1. **Encabezado YAML Frontmatter:** Metadatos de configuración, delimitación de herramientas y políticas de ejecución.
2. **Cuerpo Markdown:** Las instrucciones del sistema (*Core Instructions*) que se compilan directamente en el System Prompt del agente.

### Esquema Base (Blueprint 101)

```markdown
---
name: nombre-del-agente
description: Explicación breve en tercera persona de qué hace el agente y cuándo debe usarse.
model: flash # Opciones: flash, pro, flash_lite, inherit
tools:
  - view_file
  - replace_file_content
  - run_command
skills:
  - skills/nombre-de-habilidad
mainAgent: true
subagent: true
permissionMode: acceptEdits
commandExecutionPolicy: auto
---

# Core Instructions
Eres un agente especializado en [rol]. Tu objetivo es [objetivo principal].

## Responsabilidades
- Tarea 1...
- Tarea 2...

## Reglas de Ejecución
1. Siempre verificar los resultados antes de finalizar.
2. Mantener un estilo de código limpio y consistente.
```

---

## 3. Campos del YAML Frontmatter

| Campo | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :--- |
| `name` | `string` | **Sí** | Identificador único del agente (en minúsculas y con guiones, ej. `code-reviewer`). |
| `description` | `string` | **Sí** | Describe el rol del agente y cuándo debe ser activado. Clave para el descubrimiento progresivo y delegación. |
| `model` | `string` | No | Modelo a utilizar: `inherit` (predeterminado), `flash` (rápido y ligero), `pro` (razonamiento profundo), `flash_lite`. |
| `tools` | `string[]` | No | Lista explícita de herramientas a las que tiene acceso el agente (ej. `view_file`, `replace_file_content`, `run_command`, `manage_task`). Evita confusión de herramientas y sobrecarga de contexto. |
| `skills` | `string[]` | No | Lista de habilidades (skills) accesibles por el agente (ej. `skills/package-upgrade-rules`). |
| `mainAgent` | `boolean` | No | Si es `true`, permite interactuar directamente con este agente como sesión principal. |
| `subagent` | `boolean` | No | Si es `true`, permite que agentes coordinadores lo invoquen dinámicamente como subagente. |
| `permissionMode` | `string` | No | Nivel de permisos de ejecución (ej. `acceptEdits`, `bypassPermissions`). |
| `commandExecutionPolicy` | `string` | No | Política de ejecución de comandos. `auto` permite ejecutar comandos de compilación y pruebas de forma autónoma en segundo plano, solicitando confirmación solo para acciones de alto riesgo (como borrado). |

---

## 4. Características Exclusivas en Antigravity

### 4.1 Simetría de Ejecución (Main Agent vs. Subagent)
A diferencia de otras plataformas donde los agentes personalizados solo pueden actuar como subagentes secundarios:
- **Como Agente Principal (`mainAgent: true`)**: Puedes seleccionarlo directamente en el desplegable de la interfaz de **Antigravity 2.0** o iniciarlo desde la terminal con:
  ```bash
  agy --agent <nombre-agente>
  ```
- **Como Subagente (`subagent: true`)**: Un agente coordinador puede delegarle tareas dinámicamente según la necesidad.

### 4.2 Políticas de Seguridad Acotadas (`commandExecutionPolicy`)
Al definir `commandExecutionPolicy: auto`, el agente ejecuta ciclos de prueba, compilación y validación sin bloquear constantemente al usuario con solicitudes de confirmación repetitivas, manteniendo protegidas las operaciones destructivas.

### 4.3 Reducción de Ruido con `tools` y `skills` Curados
En lugar de cargar decenas de herramientas y reglas globales en el contexto, el agente solo recibe aquellas estrictamente necesarias para su labor.

---

## 5. Procedimiento Paso a Paso para Crear un Agente

1. **Definir el propósito:** Identificar el rol específico (ej. optimizador de dependencias, auditor de accesibilidad, diseñador de UI).
2. **Crear el directorio:** Asegurarse de que exista `.agents/agents/` en el proyecto.
3. **Redactar el archivo:** Crear `.agents/agents/<nombre>.md` con el frontmatter y las instrucciones detalladas.
4. **Verificar:**
   - Para uso como agente principal: Comprobar que aparezca en el selector de Antigravity 2.0 o ejecutar `agy --agent <nombre>`.
   - Para uso como subagente: Solicitar al agente principal que delegue una tarea al nuevo agente.

---

## 6. Recursos Adicionales

- [Referencia completa del esquema y campos](./references/custom-agent-schema.md)
- [Ejemplo oficial del blog: Dependency Modernizer](./examples/dependency-modernizer.md)
- [Ejemplo avanzado: Agente especialista en frontend y UI](./examples/frontend-redesign-agent.md)


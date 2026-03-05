---
name: jira-summary
description: Genera un resumen conciso de un PRD para pegar en Jira. Tres secciones fijas: Objetivo, Qué pasa ahora, Qué tiene que pasar.
disable-model-invocation: false
user-invocable: true
---

# /jira-summary - Resumen de PRD para Jira

Genera un resumen conciso de un PRD para pegar directamente en un ticket de Jira. No es el PRD completo: es lo mínimo que necesita alguien que lee el ticket para entender qué se está construyendo y por qué.

## Cuándo usar esta skill

- Antes de crear un epic o historia en Jira a partir de un PRD
- Cuando el equipo pide contexto en el ticket sin tener que leer el doc completo
- Para acompañar un PRD adjunto con un resumen ejecutivo en el propio ticket

---

## Cómo funciona

### Paso 1: Identificar el PRD

Si el PM ya está trabajando sobre un PRD en la conversación, lo uso directamente. Si no, pregunto:

```
¿Sobre qué PRD generamos el resumen?
Dime el nombre o pégame el contenido y lo preparo.
```

### Paso 2: Leer el PRD

Leo las secciones clave:
- **Problema e Hipótesis** → para el Objetivo
- **Scope y Non-Goals** → para Qué pasa ahora y Qué tiene que pasar
- **Modelo / Solución** → para los detalles de Qué tiene que pasar
- **Fases de implementación** → para estructurar el párrafo de fases

### Paso 3: Generar el resumen

Tres secciones fijas, en español:

```
[Nombre de la feature]

---

**Objetivo**
[1-2 frases. Qué problema resuelve y para quién. Sin jerga.]

---

**Qué pasa ahora**
[2-3 frases. Estado actual del producto. Por qué esto es un problema hoy.]

---

**Qué tiene que pasar**
[Fases de implementación en bullets. Párrafo final con los roles/modelo
y sus acciones clave, si aplica.]
```

---

## Reglas de estilo

- **Corto.** El resumen tiene que caber en la descripción de un ticket sin hacer scroll.
- **Específico.** Nombres reales, números reales, frases concretas.
- **Sin jerga de producto.** Nada de "hipótesis", "north star", "OKR" en el ticket.
- **El párrafo de roles** (si el PRD define un modelo de permisos o flujos de usuario) incluye qué puede hacer cada rol, no solo su nombre.
- **Tono neutro.** No es un pitch, es una descripción técnica para el equipo.

---

## Ejemplo de output

```
Roles y Permisos en Vault

---

**Objetivo**
Convertir Vault de herramienta individual a espacio de trabajo colaborativo,
con control granular sobre quién puede hacer qué dentro de cada expediente.

---

**Qué pasa ahora**
Vault solo soporta un usuario (el creador). No es posible trabajar en equipo
sobre un mismo vault ni compartir resultados con partes externas. Esto bloquea
el trabajo colaborativo real en cualquier caso legal.

---

**Qué tiene que pasar**
Implementar un modelo de roles y permisos en tres fases:

- Fase 1 — Colaboración interna: el Gestor puede invitar a miembros de la
  organización con rol Editor o Consultor.
- Fase 2 — Compartir con externos: generación de links protegidos para compartir
  consultas específicas. Sin membresía en el vault.
- Fase 3 — Admin: panel transversal, transferencia de ownership, audit log y
  expiración de links.

El modelo contempla cinco roles. El Admin administra todo el sistema de vaults
de la organización. El Gestor gestiona un vault concreto: invita miembros,
cambia permisos y tiene acceso completo. El Editor sube y elimina documentos
y usa la IA. El Consultor consulta la IA y los documentos pero no puede
modificar ni generar nuevas consultas o documentos. El Lector accede por link
a una consulta específica compartida, sin membresía en el vault. Los roles
Gestor, Editor y Consultor son solo para internos; los externos solo pueden
ser Lectores.
```

---

## Checklist de calidad

Antes de presentar el output, verificar:

- [ ] **Objetivo en 1-2 frases:** no es un párrafo, no es una lista
- [ ] **Qué pasa ahora describe el problema real:** no la solución ni el contexto estratégico
- [ ] **Fases en bullets:** una línea por fase, sin subcasos
- [ ] **Párrafo de roles/modelo:** si el PRD define roles o un modelo de datos, se incluye con acciones concretas por rol
- [ ] **Sin PRD completo:** no copiar secciones enteras, no incluir evidencia, alternativas ni edge cases
- [ ] **Sin palabras prohibidas:** nada de "robusto", "aprovechar", "potenciar", "optimizar", "delve"
- [ ] **Longitud total:** cabe en una pantalla sin scroll

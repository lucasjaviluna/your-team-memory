# TeamMemory Patch V4.8
## Cambio: Protocolos actualizados para auth, roles y delete_memory

### Archivos modificados (2)

```
packages/installer/protocol-short.md
packages/installer/protocol-skill.md
```

Estos archivos son los que el instalador copia en cada herramienta de IA
(CLAUDE.md, copilot-instructions.md, protocol-skill.md de OpenCode, etc.)

### Qué cambió

**protocol-short.md:**
- Lista de tools actualizada — incluye `get_memory_stats` y `delete_memory (solo admin)`
- Nota sobre auth: "tu token está configurado automáticamente — no necesitás hacer nada"
- Comportamiento ante error 403 (operación requiere rol superior)
- Reglas para `delete_memory`: a pedido explícito, irreversible, `confirm: true`
- "dev" → "usuario" en todo el texto (el sistema no es solo para devs)

**protocol-skill.md:**
- Tabla de tools con columna de rol mínimo requerido (reader/writer/admin)
- Nueva sección "Autenticación — transparente para el agente":
  - Roles y qué puede hacer cada uno
  - Cómo manejar error 403
  - Cómo manejar server no disponible
- Nueva sección "Eliminación de entradas":
  - Flujo completo: search → mostrar → confirmar → delete
  - Nunca autónomo
  - Si 403: informar que requiere admin
  - Proponer compact_memory cuando el usuario quiere "limpiar" sin ser admin
- "dev" → "usuario" en todo el texto

### Cómo aplicar (sobre cualquier V4.x)

```bash
tar -xzf TeamMemoryPatchV4.8.tar.gz
cp patch-v4.8/packages/installer/protocol-short.md packages/installer/protocol-short.md
cp patch-v4.8/packages/installer/protocol-skill.md packages/installer/protocol-skill.md
```

Los cambios toman efecto la próxima vez que un usuario corra:
```bash
npx github:tu-org/team-memory install
```
Esto re-escribe los bloques en CLAUDE.md, copilot-instructions.md, etc.
con el nuevo contenido de los protocolos.

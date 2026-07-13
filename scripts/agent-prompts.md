# team-memory Agent

## Cómo usar este archivo

1. Copiá el **System Prompt** de abajo y configuralo en tu herramienta de IA (Claude Code, Cursor, etc.)
2. Asegurate de que el MCP server `team-memory` esté conectado y corriendo
3. Usá cualquiera de los **prompts de usuario** listados para probar la interacción

---

## System Prompt

```
Sos un asistente de desarrollo senior integrado al sistema de memoria persistente del equipo (team-memory MCP).

Tu comportamiento al inicio de CADA sesión:
1. Llamá a list_projects para ver qué proyectos tienen conocimiento guardado
2. Llamá a get_context con el proyecto relevante para cargar el contexto base
3. Informá brevemente al dev qué encontraste: cuántas entradas, qué tipos predominan, si hay SUMMARYs recientes o tareas en progreso

Durante la sesión:
- Antes de responder cualquier pregunta técnica sobre el proyecto, llamá a search_memory para buscar si ya existe conocimiento relevante
- Si encontrás algo útil, citalo explícitamente: "Según la memoria del equipo [tipo/área]: ..."
- Si encontrás un ANTI_PATTERN relacionado con lo que el dev está por hacer, advertilo proactivamente
- Si encontrás un TASK_CONTEXT activo relacionado, mencionalo

Cuándo guardar conocimiento (save_memory):
- Cuando se toma una decisión técnica con razonamiento → type: DECISION
- Cuando se resuelve un bug no obvio → type: FIX (y opcionalmente type: BUG para documentar el problema)
- Cuando se descubre algo no obvio sobre el sistema → type: INSIGHT
- Cuando se identifica algo que no debe hacerse → type: ANTI_PATTERN
- Cuando hay trabajo que queda incompleto → type: TASK_CONTEXT
- Al finalizar una sesión importante → type: SUMMARY

Reglas para save_memory:
- Nunca guardes información trivial o que ya esté en la documentación oficial
- El campo content debe ser técnicamente específico: incluir versiones, comandos exactos, rutas de archivos
- Siempre proponer al dev antes de guardar, mostrar el contenido completo y esperar confirmación
- Si el dev confirma, guardá y mostrá el ID asignado

Reglas para compact_memory:
- Solo ejecutar cuando el dev lo pida explícitamente
- SIEMPRE correr dry_run: true primero y mostrar el preview completo
- Explicar qué se compactaría y por qué (criterios: antigüedad + acceso bajo + sin uso reciente)
- Esperar confirmación explícita antes de ejecutar con dry_run: false
- Nunca compactar SUMMARY ni TASK_CONTEXT

Formato de respuestas:
- Sé conciso cuando el dev hace preguntas directas
- Sé detallado cuando analizás resultados de memoria (explicá scores, relevancia, por qué un resultado es mejor que otro)
- Usá bloques de código para mostrar implementaciones o comandos
- Cuando citás una entrada de memoria, siempre mostrá: [TIPO/área] título — y el contenido relevante
```

---

## Prompts de prueba

Los prompts están organizados por escenario. Podés ejecutarlos en orden o de manera independiente.

---

### 🟣 Inicio de sesión

```
Iniciá una nueva sesión de trabajo en el proyecto ecommerce-platform.
```

```
Comenzamos a trabajar. ¿Qué sabe el equipo sobre este proyecto hasta ahora?
```

```
Cargá el contexto del proyecto ecommerce-platform enfocado en el área de backend.
```

```
¿Qué tareas quedaron pendientes de sesiones anteriores?
```

---

### 🔍 Búsqueda de conocimiento

```
¿Hubo algún problema con autenticación JWT en el proyecto? ¿Cómo se resolvió?
```

```
¿Qué decidió el equipo sobre el manejo de estado en el frontend? Necesito saber por qué eligieron esa solución.
```

```
Busco información sobre optimización de performance en React. ¿Qué sabe el equipo?
```

```
¿Hay algo que NO debo hacer cuando trabajo con la base de datos en este proyecto?
```

```
Necesito implementar un sistema de caché. ¿El equipo ya tomó decisiones al respecto?
```

```
¿Qué patrones probados hay para manejo de errores en este proyecto?
```

```
Busco bugs resueltos relacionados con pagos o Stripe. ¿Hay algo documentado?
```

```
¿Cómo está organizado el repositorio? Particularmente la carpeta de componentes compartidos.
```

---

### 💾 Guardar conocimiento

```
Tomamos la decisión de usar React Query en lugar de SWR para el fetching de datos.
Lo elegimos porque tiene mejor soporte para mutations, cache invalidation más granular,
y el equipo ya tenía experiencia con la v3. SWR quedó descartado por su manejo
limitado de estados de error en casos complejos.
¿Lo guardamos en memoria?
```

```
Encontré y resolví un bug: los webhooks de Stripe llegaban duplicados porque el endpoint
no verificaba el header Stripe-Signature antes de procesar. El fix fue agregar
stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET) al inicio
del handler y retornar 400 si falla. Guardalo como BUG y como FIX por separado.
```

```
Descubrí algo importante: cuando el carrito tiene más de 50 items, la query de checkout
hace un N+1 con los productos. En desarrollo no se nota pero en staging con datos reales
tarda 8 segundos. Todavía no lo arreglé. Guardalo como INSIGHT.
```

```
Nunca usar findOne() de TypeORM sin un timeout explícito — en producción tuvimos
queries colgadas por 30 minutos bloqueando el pool completo. Siempre usar
{ timeout: 5000 } en las opciones. Guardalo como ANTI_PATTERN.
```

```
Estoy a mitad de la migración del módulo de notificaciones a una queue con BullMQ.
Completé el producer y la queue definition, pero falta el consumer y los retry handlers.
La rama es feat/notifications-queue. Guardalo como TASK_CONTEXT.
```

---

### 📋 Resumen de sesión

```
Terminamos la sesión de hoy. Trabajamos en:
- Resolver el bug de tokens JWT duplicados en el refresh flow
- Decidir usar Resend en lugar de SendGrid para emails transaccionales
- Documentar la convención de naming para los nuevos API routes v2

Generá un SUMMARY completo de la sesión y guardalo.
```

```
Al final de la jornada: hicimos deploy de la versión 2.3.0, migramos la base de datos
con 3 nuevas tablas para el módulo de reviews, y encontramos un memory leak en el
worker de procesamiento de imágenes (todavía sin resolver). Guardá el resumen.
```

---

### 🗜️ Compactación

```
Hace varios meses que el proyecto está activo. ¿Vale la pena compactar la memoria?
Analizá qué habría que compactar sin ejecutar nada todavía.
```

```
Mostrame qué entradas del área de backend serían candidatas a compactación.
```

```
Ejecutá la compactación del área de infra. Primero mostrame el preview,
y si me parece bien lo confirmo.
```

```
Quiero compactar solo los BUGs y FIXes que tienen más de 6 meses y menos de 3 accesos.
¿Cuántas entradas serían?
```

---

### 📊 Estadísticas y estado

```
¿Cuántas entradas tiene cada proyecto en memoria? Mostrá el desglose por tipo.
```

```
¿Qué entradas del proyecto son las más consultadas? ¿Cuáles nunca fueron consultadas?
```

```
¿Hay entradas marcadas como review_needed o deprecated?
```

---

### 🔬 Análisis de calidad del retrieval

```
Buscá "authentication" y "JWT" como queries separadas y compará los resultados.
¿Por qué difieren los scores? ¿Qué nos dice eso sobre la búsqueda híbrida?
```

```
Buscá algo muy específico y técnico: "pg pool max connections configuration".
Luego buscá algo semántico: "por qué el servidor se queda sin conexiones".
Compará los resultados y explicá la diferencia entre búsqueda por keywords y semántica.
```

```
Hacé tres búsquedas sobre el mismo tema pero con frases distintas:
1. "React state"
2. "gestión de estado en el frontend"
3. "Zustand vs Redux decisión"
¿Los resultados son consistentes? ¿El RRF está funcionando bien?
```

---

### 🧪 Edge cases

```
Buscá algo que probablemente no exista en memoria: "implementación de blockchain en el checkout".
¿Qué devuelve el sistema? ¿Cómo manejás ese caso?
```

```
Intentá guardar esto en memoria: "hola mundo".
¿Lo guardás? ¿Por qué sí o por qué no?
```

```
¿Qué pasa si intento compactar entradas de tipo SUMMARY? ¿El sistema lo permite?
```

```
Cargá el contexto del área de infra y del área de frontend al mismo tiempo.
¿Cómo organizás esa información para presentármela?
```

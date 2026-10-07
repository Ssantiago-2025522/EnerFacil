# EnerFácil – Backend

API REST (Node.js + TypeScript + Express + MySQL con `mysql2`, sin ORM) para estimar y controlar el consumo eléctrico doméstico.

**Implementado:** autenticación, viviendas, ambientes, electrodomésticos, catálogo, consumo (lecturas del medidor y registros de uso) y proyección de kWh por periodo, tarifas y montos.
Tarifas y cálculo monetario también están implementados, además de presupuestos (`/api/presupuesto`), alertas (`/api/alertas`), notificaciones (`/api/notificaciones`) y los `jobs/` con `node-cron` (frecuencia en `CRON_SCHEDULE`). Las recomendaciones de ahorro (`/api/recomendaciones`) también. El dashboard (`/api/dashboard`) agrega todo en una sola respuesta. Las facturas se agregarán después.

## Puesta en marcha

1. Crear la base de datos (MySQL 8+):
   ```bash
   mysql -u root -p < sql/schema.sql
   ```
   > El script hace `DROP DATABASE IF EXISTS enerFacil_in5bm`. Úsalo solo en desarrollo.
2. Configurar variables de entorno:
   ```bash
   cp .env.example .env     # y edita DB_PASSWORD y JWT_SECRET
   ```
3. Instalar y ejecutar:
   ```bash
   npm install
   npm run dev              # desarrollo (tsx watch)
   npm run build && npm start   # producción
   ```
La API queda en `http://localhost:3000/api` (health check: `GET /api/health`).

## Estructura

```
src/
├── config/        env.ts (variables validadas), database.ts (pool mysql2 + helpers)
├── controllers/   reciben la petición y responden
├── services/      lógica de negocio y SQL
├── routes/        endpoints y middlewares por ruta
├── middlewares/   auth (JWT), validación (Zod), errores
├── validators/    schemas Zod de entrada
├── types/         interfaces y tipos compartidos
└── utils/         jwt.ts, responses.ts (AppError + formato de respuesta)
```

## Seguridad

- Contraseñas con **bcrypt** (`bcryptjs`, hash `$2b$`), nunca en texto plano.
- El usuario sale **siempre del JWT** (`req.user`), nunca de un `id_usuario` del body/query.
- **Control de propiedad**: cada consulta filtra por `viviendas.id_usuario` (con `JOIN` para ambientes y electrodomésticos). Un recurso ajeno responde **404**, igual que uno inexistente.
- Consultas parametrizadas (`?`) en todo el código; los nombres de columna de los `UPDATE` salen de listas blancas.
- Login con mensaje genérico ("Credenciales inválidas").

## Formato de respuesta

```json
{ "success": true, "message": "opcional", "data": { } }
{ "success": false, "message": "Datos inválidos", "errors": [{ "campo": "email", "mensaje": "Email inválido" }] }
```

Todas las rutas, salvo `register`, `login` y `health`, requieren `Authorization: Bearer <token>`.

## Endpoints

### Auth
| Método | Ruta | Body |
|---|---|---|
| POST | `/api/auth/register` | `nombre`, `email`, `password` (mín. 8) → devuelve `usuario` y `token` |
| POST | `/api/auth/login` | `email`, `password` → `token` + `usuario` |
| GET | `/api/auth/me` | — |

### Viviendas
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/viviendas` | Viviendas del usuario autenticado |
| GET | `/api/viviendas/:id` | |
| POST | `/api/viviendas` | `nombre` (oblig.), `direccion`, `region`, `num_habitantes`, `dia_corte` (1-28), `id_tarifa` |
| PUT | `/api/viviendas/:id` | Cualquier subconjunto de los campos anteriores |
| DELETE | `/api/viviendas/:id` | Borra en cascada ambientes, electrodomésticos, etc. |

### Ambientes
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/ambientes` | Opcional `?id_vivienda=` |
| GET | `/api/ambientes/:id` | |
| POST | `/api/ambientes` | `nombre`, `tipo` (`SALA`, `COCINA`, `DORMITORIO`, `BANO`, `COMEDOR`, `LAVANDERIA`, `OFICINA`, `EXTERIOR`, `OTRO`), `id_vivienda` |
| PUT | `/api/ambientes/:id` | `nombre`, `tipo` |
| DELETE | `/api/ambientes/:id` | Sus electrodomésticos quedan sin ambiente |

`id_vivienda` es opcional al crear si el usuario tiene **una sola** vivienda; con varias es obligatorio. Siempre se verifica que sea suya.

### Electrodomésticos
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/electrodomesticos/catalogo` | Filtros `?id_categoria=` `?q=` |
| GET | `/api/electrodomesticos/catalogo/:id` | |
| GET | `/api/electrodomesticos` | Filtros `?id_vivienda=` `?id_ambiente=` `?activo=true|false` |
| GET | `/api/electrodomesticos/:id` | |
| POST | `/api/electrodomesticos` | Ver abajo |
| PUT | `/api/electrodomesticos/:id` | `id_ambiente`, `nombre`, `potencia_w`, `cantidad`, `horas_uso_dia`, `dias_uso_mes`, `factor_uso`, `activo` |
| DELETE | `/api/electrodomesticos/:id` | |

**Crear desde el catálogo** (los valores promedio son iniciales; lo que envíes los sobrescribe):
```json
{ "id_catalogo": 1, "id_ambiente": 3, "horas_uso_dia": 6 }
```
**Crear manualmente** (`nombre` y `potencia_w` obligatorios):
```json
{ "nombre": "Bomba de agua", "potencia_w": 750, "horas_uso_dia": 2, "dias_uso_mes": 30, "factor_uso": 0.8 }
```
`kwh_mes_estimado` lo calcula MySQL (columna generada) y la API solo lo lee; nunca se escribe ni se recalcula en Node.

### Consumo (`/api/consumo`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/lecturas` | `fecha_lectura`, `lectura_kwh`, `observacion?`, `id_vivienda?`. Debe ser ≥ la lectura anterior y ≤ la posterior; no puede ser futura; una por vivienda y día |
| GET | `/lecturas` · `/lecturas/:id` | Filtros `?id_vivienda=&desde=&hasta=&limit=` |
| DELETE | `/lecturas/:id` | |
| POST | `/usos` | `id_electrodomestico`, `fecha`, `horas_uso` (0-24). Uno por electrodoméstico y día (409 si existe) |
| GET | `/usos` · `/usos/:id` | Filtros `?id_vivienda=&id_electrodomestico=&desde=&hasta=&limit=` |
| PUT | `/usos/:id` | Solo `horas_uso` |
| DELETE | `/usos/:id` | |
| GET | `/proyeccion` | `?id_vivienda=&fecha=` Calcula sin guardar |
| POST | `/periodos/calcular` | `{ id_vivienda?, fecha? }` Calcula y hace upsert en `periodos_consumo` y `consumo_electrodomestico_periodo` |
| GET | `/periodos` · `/periodos/:id` | Periodos guardados (el detalle incluye el desglose por electrodoméstico) |

`kwh_calculado` lo calculan los triggers de MySQL; la API nunca lo envía. Ojo: el trigger usa la potencia, cantidad y factor **actuales** del electrodoméstico; un registro ya guardado solo se recalcula al editarlo con `PUT`.

**Periodo:** ciclo mensual según `viviendas.dia_corte` (ej. corte 15 → del 15 al 14 del mes siguiente).

**Proyección** (`fuente` indica cuál se usó, en este orden de prioridad; el detalle de cada una viene en `fuentes`):
1. `LECTURAS`: consumo = última lectura − lectura base (la última en/antes del inicio del periodo, o la primera dentro de él). Promedio diario = consumo / días entre ambas; si la base es anterior al inicio, solo se atribuye al periodo la parte proporcional. Requiere ≥ 2 lecturas en fechas distintas.
2. `REGISTROS_USO`: suma de `kwh_calculado`; promedio = suma / días que tienen algún registro (un día sin registro no se asume como consumo cero).
3. `ESTIMACION`: suma de `kwh_mes_estimado` de los electrodomésticos activos (sin consumo real acumulado).
4. `SIN_DATOS`: todo en 0.

`kwh_proyectado = promedio_diario × días_totales_del_periodo`. El desglose por electrodoméstico guarda el consumo real acumulado desde `registros_uso` (su `monto_estimado` aún no se calcula y queda en 0).

**Montos:** se calculan con la tarifa de la vivienda (`viviendas.id_tarifa`) invocando la función SQL `fn_calcular_monto(id_tarifa, kwh, 0)`; Node no replica la fórmula. `kw_contratados` es 0 porque `viviendas` no tiene ese dato.
- `monto_proyectado = fn(kwh_proyectado)`: estimación de la factura del periodo completo.
- `monto_acumulado = fn(kwh_acumulado)`: ojo, incluye el cargo fijo mensual completo y los tramos se aplican a ese consumo parcial.
- Sin tarifa asignada, la API devuelve `null` y la tabla guarda 0. Con `SIN_DATOS` (o sin consumo real acumulado en `monto_acumulado`) el monto es 0, para no mostrar solo el cargo fijo.
- Se usa la tarifa **actual** de la vivienda, también al recalcular periodos pasados.

### Tarifas (`/api/tarifas`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/` | Tarifas activas disponibles: predefinidas + propias. Filtros `?region=&tipo=` |
| GET | `/actual` | Tarifa asignada a la vivienda (con tramos) o `null`. `?id_vivienda=` |
| GET | `/:id` | Tarifa con sus `tramos` |
| POST | `/` | Crea una tarifa **PERSONALIZADA** del usuario (ver abajo) |
| PUT | `/:id` | Solo tarifas propias; si envías `tramos`, reemplazan a los existentes. También `activa` |
| DELETE | `/:id` | Solo propias. Las viviendas que la usaban quedan sin tarifa |
| POST | `/:id/asignar` | `{ id_vivienda? }` asigna la tarifa a la vivienda |

Las predefinidas (`id_usuario` NULL) son de solo lectura (403 al modificar); las personalizadas de otro usuario responden 404. `PUT /api/viviendas/:id` con `id_tarifa` sigue funcionando igual.

```json
{ "nombre": "Mi tarifa", "moneda": "GTQ", "cargo_fijo": 5, "impuesto_pct": 12, "vigente_desde": "2026-01-01",
  "tramos": [ { "kwh_desde": 0, "kwh_hasta": 100, "precio_kwh": 1.2 }, { "kwh_desde": 100, "kwh_hasta": null, "precio_kwh": 1.8 } ] }
```
Validación de tramos: empiezan en 0, son contiguos y sin traslapes, y el último no tiene límite (`kwh_hasta: null`), para que `fn_calcular_monto` facture todo el consumo. Máximo 2 decimales en kWh y 4 en precios.

### Recomendaciones (`/api/recomendaciones`)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/` | Lista las del usuario. Filtros `?id_vivienda=&estado=&activas=true\|false&id_categoria=&limit=` |
| POST | `/generar` | `{ id_vivienda? }` analiza la vivienda y crea/actualiza recomendaciones |
| PUT | `/:id` | `{ "estado": "NUEVA" \| "VISTA" \| "APLICADA" \| "DESCARTADA" }` |

`activas=true` devuelve las pendientes (`NUEVA`/`VISTA`); `activas=false`, las cerradas (`APLICADA`/`DESCARTADA`). Cada recomendación incluye `titulo` y `categoria` (de la plantilla) y el nombre del `electrodomestico`. Una vivienda ajena o una recomendación ajena responde 404.

**Generación.** Reglas simples y deterministas (sin IA); se apoyan en las plantillas de `recomendaciones_plantilla`, que se asignan por la categoría del electrodoméstico (`catalogo_electrodomesticos.id_categoria`). Los umbrales son constantes al inicio de `services/recomendacion.service.ts`.

1. **Aparato de alto consumo:** un electrodoméstico activo que representa ≥ 15 % del consumo mensual estimado de la vivienda (vista `v_consumo_por_electrodomestico`) recibe las plantillas de su categoría. Prioridad 1 si pasa del 40 %, si no 2.
2. **Muchas horas de uso:** promedia ≥ 8 h/día y menos de 24 (usa el promedio de `registros_uso` de los últimos 30 días; si no hay registros, `horas_uso_dia`). Mismas plantillas de su categoría, prioridad 3.
3. **Presupuesto en riesgo:** si el semáforo (`alerta.service`) está en AMARILLO o ROJO se agregan las plantillas generales (sin categoría), prioridad 2 o 1.

`ahorro_kwh_mes` = kWh del aparato (o de la vivienda, en las generales) × `ahorro_estimado_pct` de la plantilla. `ahorro_monto_mes` es la diferencia de facturar el consumo actual y el consumo menos ese ahorro con `fn_calcular_monto` (0 si la vivienda no tiene tarifa). Los electrodomésticos sin `id_catalogo` no tienen categoría, así que solo les aplican las reglas generales.

**Sin duplicados.** Una recomendación se identifica por (vivienda, electrodoméstico, plantilla). Si ya existe `NUEVA`/`VISTA` se actualiza solo si cambió algo; si está `APLICADA`/`DESCARTADA` no se toca. La respuesta indica `creadas`, `actualizadas` y `omitidas`, y las pendientes de la vivienda. Las que dejan de aplicar no se borran: el usuario las descarta con `PUT`.

### Dashboard (`/api/dashboard`)
`GET /api/dashboard?id_vivienda=` — estado energético de la vivienda en **una sola respuesta** (`id_vivienda` es opcional si el usuario tiene una sola; una vivienda ajena responde 404). Es solo lectura y no guarda nada: agrega lo que ya calculan los demás módulos.

| Sección | Contenido | De dónde sale |
|---|---|---|
| `vivienda` | datos básicos y `dia_corte` | `vivienda.service` |
| `resumen` | ciclo actual: fechas, `dias_transcurridos`/`dias_restantes`, `kwh_acumulado`, `kwh_proyectado`, `monto_acumulado`, `monto_proyectado`, `fuente`, `id_periodo` (si ya se guardó), `moneda` | `proyeccion.service` (los montos usan `fn_calcular_monto`; son `null` sin tarifa y los kWh son `0` sin datos) |
| `presupuesto` | `monto_mensual`, `monto_proyectado`, `porcentaje_proyectado`, `porcentaje_utilizado`, `nivel` (VERDE/AMARILLO/ROJO) | `presupuesto.service` + `alerta.service.evaluarSemaforo` (mismos umbrales que las alertas). `null` si no hay presupuesto vigente; `nivel` es `null` con `motivo` (`SIN_TARIFA`/`SIN_DATOS`) si falta base |
| `consumo_por_ambiente` | `id_ambiente`, `nombre`, `kwh`, `porcentaje` | agregado del desglose por aparato; solo ambientes con consumo; los aparatos sin ambiente van a "Sin ambiente" (`id_ambiente: null`) |
| `consumo_por_electrodomestico` | top 5 con `kwh`, `porcentaje`, `ambiente` | kWh reales del periodo (`registros_uso`); si no hay registros, el consumo mensual estimado. `origen_desglose` indica cuál (`REGISTROS_USO`, `ESTIMACION` o `null`). Los porcentajes son sobre el total, no sobre el top |
| `comparacion` | `kwh_actual` (proyectado), `kwh_anterior`, `diferencia_kwh`, `diferencia_pct`, `tendencia` (`SUBE`/`BAJA`/`IGUAL`, ±1 %) | ciclo anterior recalculado con `proyeccion.service`; todo `null` si alguno de los dos ciclos no tiene lecturas ni registros de uso |
| `alertas` | `nivel`, umbrales, presupuesto/proyección, `no_leidas`, 5 `recientes`, `configuracion` | `alerta.service` y `notificacion.service` |
| `recomendaciones` | hasta 5 pendientes (`NUEVA`/`VISTA`) por prioridad | `recomendacion.service.listar`; no las genera, para eso está `POST /api/recomendaciones/generar` |

Una vivienda nueva, sin lecturas, presupuesto ni alertas, responde igual: números en `0`, `null` donde no hay información y `[]` en las listas.

## Notas

- Se mantiene `bcryptjs` (implementación en JS puro del mismo algoritmo bcrypt, sin compilación nativa) y `zod` para validar, ambos ya presentes en el `package.json` original.
- El usuario demo de `sql/schema.sql` tiene un hash de marcador (`REEMPLAZAR_CON_HASH_REAL`): no puede iniciar sesión. Regístrate con `/api/auth/register` o reemplaza el hash.

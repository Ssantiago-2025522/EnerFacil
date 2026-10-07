# EnerFacil

Sistema web para la gestión del consumo eléctrico del hogar. Permite administrar viviendas, ambientes y electrodomésticos, registrar consumos, consultar proyecciones, establecer presupuestos y configurar alertas sobre el consumo energético.

## Tecnologías utilizadas

### Frontend
- Angular 22
- TypeScript
- HTML5
- CSS3

### Backend
- Node.js
- Express
- TypeScript
- JWT
- bcrypt
- Zod

### Base de datos
- MySQL 8.0

---

## Requisitos

Antes de ejecutar el proyecto necesitas tener instalado:

- Node.js 22 o superior
- npm
- MySQL 8.0 o compatible
- Angular CLI 22

Puedes comprobar las versiones instaladas con:

```bash
node --version
npm --version
mysql --version
ng version
```

---

## Estructura del proyecto

```text
EnerFacil/
├── backend/
│   ├── src/
│   ├── sql/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── angular.json
│
└── README.md
```

---

# Instalación y configuración

## 1. Clonar el repositorio

```bash
git clone https://github.com/Ssantiago-2025522/EnerFacil.git
cd EnerFacil
```

---

## 2. Configurar la base de datos

Asegúrate de tener MySQL instalado y ejecutándose.

En la carpeta `backend`, crea un archivo `.env` utilizando `.env.example` como referencia.

El archivo debe contener:

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

DB_HOST=localhost
DB_PORT=3306
DB_USER=TU_USUARIO
DB_PASSWORD=TU_CONTRASEÑA
DB_NAME=enerFacil_in5bm

JWT_SECRET=TU_CLAVE_SECRETA
```

Configura `DB_USER` y `DB_PASSWORD` con las credenciales de tu instalación local de MySQL.

El `JWT_SECRET` debe ser una clave secreta propia para la generación y validación de tokens de autenticación.

> **Importante:** el archivo `.env` no debe subirse al repositorio. Utiliza `.env.example` como plantilla.

---

## 3. Instalar dependencias del backend

Desde la raíz del proyecto:

```bash
cd backend
npm install
```

---

## 4. Inicializar la base de datos

Una vez configurado el archivo `.env` y con MySQL ejecutándose, inicializa la base de datos con:

```bash
npm run db:init
```

Este comando crea y configura las tablas, relaciones, datos iniciales y demás elementos necesarios para el funcionamiento de EnerFacil.

---

## 5. Ejecutar el backend

Desde la carpeta `backend`:

```bash
npm run dev
```

El backend estará disponible en:

```text
http://localhost:3000
```

La API utiliza como ruta base:

```text
http://localhost:3000/api
```

---

## 6. Instalar dependencias del frontend

Abre una segunda terminal y desde la raíz del proyecto:

```bash
cd frontend
npm install
```

---

## 7. Ejecutar el frontend

Desde la carpeta `frontend`:

```bash
ng serve
```

La aplicación estará disponible en:

```text
http://localhost:4200
```

---

# Uso

1. Inicia MySQL.
2. Configura el archivo `.env` del backend.
3. Inicializa la base de datos con `npm run db:init`.
4. Ejecuta el backend con `npm run dev`.
5. Ejecuta el frontend con `ng serve`.
6. Abre `http://localhost:4200` en el navegador.
7. Registra una cuenta o inicia sesión.
8. Configura una vivienda.
9. Agrega ambientes y electrodomésticos.
10. Registra y consulta el consumo eléctrico.

---

# Funcionalidades principales

- Registro e inicio de sesión.
- Autenticación mediante JWT.
- Gestión de viviendas.
- Gestión de ambientes.
- Gestión de electrodomésticos.
- Registro y consulta de consumo eléctrico.
- Proyección de consumo.
- Consulta de tarifas.
- Gestión de presupuestos.
- Sistema de alertas de consumo.
- Notificaciones.
- Dashboard con información del consumo.
- Cálculo estimado del costo energético.
- Selección entre diferentes viviendas.
- Cálculo de consumo de electrodomésticos.
- Seguimiento del presupuesto energético.

---

# Módulos principales

### Viviendas
Permite crear, consultar, editar y eliminar viviendas asociadas al usuario.

### Ambientes
Permite organizar los electrodomésticos de acuerdo con los diferentes ambientes de cada vivienda.

### Electrodomésticos
Permite registrar electrodomésticos, potencia, cantidad y tiempo de uso para estimar su consumo energético.

### Consumo
Permite registrar lecturas del medidor y registros de uso, consultar períodos de consumo y obtener proyecciones.

### Presupuesto
Permite establecer un presupuesto mensual y consultar el monto utilizado, disponible y proyectado.

### Alertas
Permite configurar umbrales de consumo y determinar el estado del presupuesto mediante diferentes niveles de alerta.

### Tarifas
Permite consultar la tarifa eléctrica asociada a la vivienda y sus diferentes tramos de consumo.

### Dashboard
Muestra un resumen del consumo, presupuesto, alertas y distribución del consumo de la vivienda seleccionada.

### Notificaciones
Muestra las notificaciones generadas por el sistema y permite marcarlas como leídas.

---

# API

El backend expone una API REST organizada por módulos:

```text
/api/auth
/api/viviendas
/api/ambientes
/api/electrodomesticos
/api/consumo
/api/presupuesto
/api/alertas
/api/tarifas
/api/notificaciones
/api/dashboard
```

Las rutas protegidas requieren un token JWT enviado mediante el encabezado:

```text
Authorization: Bearer <token>
```

---

# Variables de entorno

Las principales variables utilizadas por el backend son:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto utilizado por el backend |
| `NODE_ENV` | Entorno de ejecución |
| `CORS_ORIGIN` | URL permitida para el frontend |
| `DB_HOST` | Host de MySQL |
| `DB_PORT` | Puerto de MySQL |
| `DB_USER` | Usuario de MySQL |
| `DB_PASSWORD` | Contraseña de MySQL |
| `DB_NAME` | Nombre de la base de datos |
| `JWT_SECRET` | Clave utilizada para los tokens JWT |

---

# Notas

- El proyecto está configurado para ejecutarse localmente durante el desarrollo.
- El backend y el frontend deben ejecutarse simultáneamente.
- MySQL debe estar activo antes de iniciar el backend.
- Cada instalación debe utilizar sus propias credenciales de MySQL.
- El archivo `.env` contiene información sensible y no debe compartirse ni subirse al repositorio.
- El archivo `.env.example` sirve como referencia para configurar las variables necesarias.

---

## Autores

**Proyecto EnerFacil**

Proyecto académico de desarrollo Full Stack utilizando Node.js, TypeScript, Angular y MySQL.

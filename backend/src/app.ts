import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import viviendaRoutes from './routes/vivienda.routes';
import ambienteRoutes from './routes/ambiente.routes';
import electrodomesticoRoutes from './routes/electrodomestico.routes';
import consumoRoutes from './routes/consumo.routes';
import tarifaRoutes from './routes/tarifa.routes';
import presupuestoRoutes from './routes/presupuesto.routes';
import alertaRoutes from './routes/alerta.routes';
import notificacionRoutes from './routes/notificacion.routes';
import recomendacionRoutes from './routes/recomendacion.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();

app.use(cors({ origin: env.corsOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/viviendas', viviendaRoutes);
app.use('/api/ambientes', ambienteRoutes);
app.use('/api/electrodomesticos', electrodomesticoRoutes);
app.use('/api/consumo', consumoRoutes);
app.use('/api/tarifas', tarifaRoutes);
app.use('/api/presupuesto', presupuestoRoutes);
app.use('/api/alertas', alertaRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/recomendaciones', recomendacionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

import { z } from 'zod';
import { idOpcional } from './comunes';

export const dashboardQuerySchema = z.object({ id_vivienda: idOpcional });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

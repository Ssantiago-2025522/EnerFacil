-- =====================================================================
--  BASE DE DATOS: enerFacil_in5bm  (MySQL 8.0+)
--  Proyecto: Aplicación web para monitoreo, estimación y optimización
--            del consumo eléctrico doméstico
-- =====================================================================

DROP DATABASE IF EXISTS enerFacil_in5bm;
CREATE DATABASE enerFacil_in5bm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE enerFacil_in5bm;

-- =====================================================================
-- 1. USUARIOS
-- =====================================================================
CREATE TABLE usuarios (
  id_usuario      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email)
) ENGINE=InnoDB;

-- =====================================================================
-- 2. TARIFAS ELÉCTRICAS (estructura tarifaria)
--    id_usuario NULL  -> tarifa predefinida por región/distribuidora
--    id_usuario != NULL -> tarifa personalizada del usuario
-- =====================================================================
CREATE TABLE tarifas (
  id_tarifa            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario           INT UNSIGNED NULL,
  nombre               VARCHAR(120) NOT NULL,
  distribuidora        VARCHAR(120) NULL,
  region               VARCHAR(120) NULL,
  tipo                 ENUM('SOCIAL','RESIDENCIAL','PERSONALIZADA') NOT NULL DEFAULT 'RESIDENCIAL',
  cargo_fijo           DECIMAL(10,2) NOT NULL DEFAULT 0,      -- cargo fijo mensual
  cargo_potencia_kw    DECIMAL(10,4) NOT NULL DEFAULT 0,      -- cargo por kW contratado
  impuesto_pct         DECIMAL(5,2)  NOT NULL DEFAULT 0,      -- impuestos / tasas (%)
  moneda               CHAR(3) NOT NULL DEFAULT 'USD',
  vigente_desde        DATE NOT NULL,
  vigente_hasta        DATE NULL,
  activa               TINYINT(1) NOT NULL DEFAULT 1,
  creado_en            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tarifas_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  CONSTRAINT ck_tarifas_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  INDEX idx_tarifas_region (region, activa)
) ENGINE=InnoDB;

-- Tramos de precio por kWh (escalonado). kwh_hasta NULL = sin límite superior.
CREATE TABLE tarifa_tramos (
  id_tramo    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_tarifa   INT UNSIGNED NOT NULL,
  kwh_desde   DECIMAL(10,2) NOT NULL DEFAULT 0,
  kwh_hasta   DECIMAL(10,2) NULL,
  precio_kwh  DECIMAL(10,4) NOT NULL,
  CONSTRAINT fk_tramos_tarifa FOREIGN KEY (id_tarifa)
    REFERENCES tarifas(id_tarifa) ON DELETE CASCADE,
  CONSTRAINT ck_tramos_rango CHECK (kwh_hasta IS NULL OR kwh_hasta > kwh_desde),
  CONSTRAINT uq_tramos UNIQUE (id_tarifa, kwh_desde)
) ENGINE=InnoDB;

-- =====================================================================
-- 3. VIVIENDAS Y AMBIENTES
-- =====================================================================
CREATE TABLE viviendas (
  id_vivienda     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario      INT UNSIGNED NOT NULL,
  id_tarifa       INT UNSIGNED NULL,
  nombre          VARCHAR(100) NOT NULL,
  direccion       VARCHAR(255) NULL,
  region          VARCHAR(120) NULL,
  num_habitantes  TINYINT UNSIGNED NULL,
  dia_corte       TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- día de inicio del ciclo de facturación
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_viviendas_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_viviendas_tarifa FOREIGN KEY (id_tarifa)
    REFERENCES tarifas(id_tarifa) ON DELETE SET NULL,
  CONSTRAINT ck_viviendas_corte CHECK (dia_corte BETWEEN 1 AND 28),
  INDEX idx_viviendas_usuario (id_usuario)
) ENGINE=InnoDB;

CREATE TABLE ambientes (
  id_ambiente  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda  INT UNSIGNED NOT NULL,
  nombre       VARCHAR(80) NOT NULL,
  tipo         ENUM('SALA','COCINA','DORMITORIO','BANO','COMEDOR','LAVANDERIA','OFICINA','EXTERIOR','OTRO')
               NOT NULL DEFAULT 'OTRO',
  CONSTRAINT fk_ambientes_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT uq_ambiente UNIQUE (id_vivienda, nombre)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. CATÁLOGO Y ELECTRODOMÉSTICOS
-- =====================================================================
CREATE TABLE categorias_electrodomestico (
  id_categoria  SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(60) NOT NULL UNIQUE,
  descripcion   VARCHAR(255) NULL
) ENGINE=InnoDB;

-- Catálogo preconfigurado con valores promedio
CREATE TABLE catalogo_electrodomesticos (
  id_catalogo              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_categoria             SMALLINT UNSIGNED NOT NULL,
  nombre                   VARCHAR(100) NOT NULL UNIQUE,
  potencia_w_promedio      DECIMAL(10,2) NOT NULL,
  horas_uso_dia_promedio   DECIMAL(4,2)  NOT NULL,
  factor_uso_promedio      DECIMAL(3,2)  NOT NULL DEFAULT 1.00,  -- ciclo de trabajo (ej. refrigerador ~0.35)
  CONSTRAINT fk_catalogo_categoria FOREIGN KEY (id_categoria)
    REFERENCES categorias_electrodomestico(id_categoria)
) ENGINE=InnoDB;

-- Electrodomésticos reales de cada vivienda
CREATE TABLE electrodomesticos (
  id_electrodomestico    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda            INT UNSIGNED NOT NULL,
  id_ambiente            INT UNSIGNED NULL,
  id_catalogo            INT UNSIGNED NULL,
  nombre                 VARCHAR(100) NOT NULL,
  potencia_w             DECIMAL(10,2) NOT NULL,
  cantidad               SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  horas_uso_dia          DECIMAL(4,2) NOT NULL DEFAULT 1,
  dias_uso_mes           TINYINT UNSIGNED NOT NULL DEFAULT 30,
  factor_uso             DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  activo                 TINYINT(1) NOT NULL DEFAULT 1,
  creado_en              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- consumo mensual estimado (kWh) calculado automáticamente
  kwh_mes_estimado       DECIMAL(10,3) GENERATED ALWAYS AS
      (ROUND(potencia_w * cantidad * horas_uso_dia * dias_uso_mes * factor_uso / 1000, 3)) STORED,
  CONSTRAINT fk_electro_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT fk_electro_ambiente FOREIGN KEY (id_ambiente)
    REFERENCES ambientes(id_ambiente) ON DELETE SET NULL,
  CONSTRAINT fk_electro_catalogo FOREIGN KEY (id_catalogo)
    REFERENCES catalogo_electrodomesticos(id_catalogo) ON DELETE SET NULL,
  CONSTRAINT ck_electro_potencia CHECK (potencia_w > 0),
  CONSTRAINT ck_electro_horas CHECK (horas_uso_dia BETWEEN 0 AND 24),
  CONSTRAINT ck_electro_dias CHECK (dias_uso_mes BETWEEN 0 AND 31),
  CONSTRAINT ck_electro_factor CHECK (factor_uso BETWEEN 0 AND 1),
  INDEX idx_electro_vivienda (id_vivienda, activo),
  INDEX idx_electro_ambiente (id_ambiente)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. REGISTRO DE CONSUMO
-- =====================================================================
-- 5.1 Lecturas manuales del medidor
CREATE TABLE lecturas_medidor (
  id_lectura     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda    INT UNSIGNED NOT NULL,
  fecha_lectura  DATE NOT NULL,
  lectura_kwh    DECIMAL(12,2) NOT NULL,       -- valor acumulado del medidor
  observacion    VARCHAR(255) NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lecturas_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT uq_lectura UNIQUE (id_vivienda, fecha_lectura),
  INDEX idx_lecturas_fecha (id_vivienda, fecha_lectura)
) ENGINE=InnoDB;

-- 5.2 Horas de uso por electrodoméstico (kWh se calcula por trigger)
CREATE TABLE registros_uso (
  id_registro          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_electrodomestico  INT UNSIGNED NOT NULL,
  fecha                DATE NOT NULL,
  horas_uso            DECIMAL(4,2) NOT NULL,
  kwh_calculado        DECIMAL(10,4) NOT NULL DEFAULT 0,
  creado_en            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uso_electro FOREIGN KEY (id_electrodomestico)
    REFERENCES electrodomesticos(id_electrodomestico) ON DELETE CASCADE,
  CONSTRAINT ck_uso_horas CHECK (horas_uso BETWEEN 0 AND 24),
  CONSTRAINT uq_uso UNIQUE (id_electrodomestico, fecha),
  INDEX idx_uso_fecha (fecha)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. PERIODOS, CONSUMO AGREGADO Y FACTURAS
-- =====================================================================
-- Resumen calculado por las tareas programadas (cron) por periodo
CREATE TABLE periodos_consumo (
  id_periodo         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda        INT UNSIGNED NOT NULL,
  tipo               ENUM('SEMANAL','MENSUAL') NOT NULL DEFAULT 'MENSUAL',
  fecha_inicio       DATE NOT NULL,
  fecha_fin          DATE NOT NULL,
  kwh_acumulado      DECIMAL(12,3) NOT NULL DEFAULT 0,
  kwh_proyectado     DECIMAL(12,3) NOT NULL DEFAULT 0,
  monto_acumulado    DECIMAL(12,2) NOT NULL DEFAULT 0,
  monto_proyectado   DECIMAL(12,2) NOT NULL DEFAULT 0,
  cerrado            TINYINT(1) NOT NULL DEFAULT 0,
  calculado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_periodos_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT ck_periodos_fechas CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT uq_periodo UNIQUE (id_vivienda, tipo, fecha_inicio),
  INDEX idx_periodos_fecha (id_vivienda, fecha_inicio)
) ENGINE=InnoDB;

-- Desglose del periodo por electrodoméstico (para gráficas por aparato/ambiente)
CREATE TABLE consumo_electrodomestico_periodo (
  id_periodo           INT UNSIGNED NOT NULL,
  id_electrodomestico  INT UNSIGNED NOT NULL,
  kwh                  DECIMAL(12,3) NOT NULL DEFAULT 0,
  monto_estimado       DECIMAL(12,2) NOT NULL DEFAULT 0,
  porcentaje_total     DECIMAL(5,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id_periodo, id_electrodomestico),
  CONSTRAINT fk_cep_periodo FOREIGN KEY (id_periodo)
    REFERENCES periodos_consumo(id_periodo) ON DELETE CASCADE,
  CONSTRAINT fk_cep_electro FOREIGN KEY (id_electrodomestico)
    REFERENCES electrodomesticos(id_electrodomestico) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Facturas reales ingresadas por el usuario (para comparar con la estimación)
CREATE TABLE facturas (
  id_factura       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda      INT UNSIGNED NOT NULL,
  id_periodo       INT UNSIGNED NULL,
  periodo_inicio   DATE NOT NULL,
  periodo_fin      DATE NOT NULL,
  kwh_facturados   DECIMAL(12,2) NOT NULL,
  monto_total      DECIMAL(12,2) NOT NULL,
  observacion      VARCHAR(255) NULL,
  creado_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_facturas_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT fk_facturas_periodo FOREIGN KEY (id_periodo)
    REFERENCES periodos_consumo(id_periodo) ON DELETE SET NULL,
  CONSTRAINT ck_facturas_fechas CHECK (periodo_fin >= periodo_inicio),
  CONSTRAINT uq_factura UNIQUE (id_vivienda, periodo_inicio),
  INDEX idx_facturas_fecha (id_vivienda, periodo_inicio)
) ENGINE=InnoDB;

-- =====================================================================
-- 7. PRESUPUESTOS Y ALERTAS
-- =====================================================================
CREATE TABLE presupuestos (
  id_presupuesto  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda     INT UNSIGNED NOT NULL,
  monto_mensual   DECIMAL(12,2) NOT NULL,
  vigente_desde   DATE NOT NULL,
  vigente_hasta   DATE NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_presupuestos_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT ck_presupuesto_monto CHECK (monto_mensual > 0),
  INDEX idx_presupuestos_vigencia (id_vivienda, vigente_desde)
) ENGINE=InnoDB;

-- Configuración de alertas definida por el usuario
CREATE TABLE alertas_config (
  id_alerta_config  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda       INT UNSIGNED NOT NULL,
  tipo              ENUM('UMBRAL_PROXIMO','UMBRAL_SUPERADO','CONSUMO_ANOMALO') NOT NULL,
  porcentaje_umbral DECIMAL(5,2) NOT NULL,       -- % del presupuesto (ej. 80 = aviso al 80%)
  canal             ENUM('APP','EMAIL') NOT NULL DEFAULT 'APP',
  activa            TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_alertacfg_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT ck_alertacfg_pct CHECK (porcentaje_umbral > 0),
  CONSTRAINT uq_alertacfg UNIQUE (id_vivienda, tipo, canal)
) ENGINE=InnoDB;

-- Notificaciones generadas por las tareas programadas
CREATE TABLE notificaciones (
  id_notificacion   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario        INT UNSIGNED NOT NULL,
  id_vivienda       INT UNSIGNED NOT NULL,
  id_alerta_config  INT UNSIGNED NULL,
  id_periodo        INT UNSIGNED NULL,
  nivel             ENUM('VERDE','AMARILLO','ROJO') NOT NULL,   -- semáforo de consumo
  titulo            VARCHAR(150) NOT NULL,
  mensaje           TEXT NOT NULL,
  leida             TINYINT(1) NOT NULL DEFAULT 0,
  enviada_en        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_notif_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT fk_notif_config FOREIGN KEY (id_alerta_config)
    REFERENCES alertas_config(id_alerta_config) ON DELETE SET NULL,
  CONSTRAINT fk_notif_periodo FOREIGN KEY (id_periodo)
    REFERENCES periodos_consumo(id_periodo) ON DELETE SET NULL,
  INDEX idx_notif_usuario (id_usuario, leida, enviada_en)
) ENGINE=InnoDB;

-- =====================================================================
-- 8. RECOMENDACIONES DE AHORRO
-- =====================================================================
CREATE TABLE recomendaciones_plantilla (
  id_plantilla         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_categoria         SMALLINT UNSIGNED NULL,      -- NULL = recomendación general
  titulo               VARCHAR(150) NOT NULL,
  descripcion          TEXT NOT NULL,
  ahorro_estimado_pct  DECIMAL(5,2) NOT NULL DEFAULT 0,  -- % de ahorro sobre el consumo del aparato
  CONSTRAINT fk_plantilla_categoria FOREIGN KEY (id_categoria)
    REFERENCES categorias_electrodomestico(id_categoria) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE recomendaciones (
  id_recomendacion     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_vivienda          INT UNSIGNED NOT NULL,
  id_electrodomestico  INT UNSIGNED NULL,
  id_plantilla         INT UNSIGNED NULL,
  mensaje              TEXT NOT NULL,
  ahorro_kwh_mes       DECIMAL(10,2) NOT NULL DEFAULT 0,
  ahorro_monto_mes     DECIMAL(10,2) NOT NULL DEFAULT 0,
  prioridad            TINYINT UNSIGNED NOT NULL DEFAULT 3,   -- 1 = más alta
  estado               ENUM('NUEVA','VISTA','APLICADA','DESCARTADA') NOT NULL DEFAULT 'NUEVA',
  generada_en          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reco_vivienda FOREIGN KEY (id_vivienda)
    REFERENCES viviendas(id_vivienda) ON DELETE CASCADE,
  CONSTRAINT fk_reco_electro FOREIGN KEY (id_electrodomestico)
    REFERENCES electrodomesticos(id_electrodomestico) ON DELETE CASCADE,
  CONSTRAINT fk_reco_plantilla FOREIGN KEY (id_plantilla)
    REFERENCES recomendaciones_plantilla(id_plantilla) ON DELETE SET NULL,
  INDEX idx_reco_vivienda (id_vivienda, estado, prioridad)
) ENGINE=InnoDB;

-- =====================================================================
-- 9. FUNCIÓN: cálculo de factura estimada a partir de kWh
--    monto = (Σ tramos + cargo_fijo + cargo_potencia_kw * kw) * (1 + impuesto)
-- =====================================================================
DELIMITER $$

CREATE FUNCTION fn_calcular_monto(p_id_tarifa INT UNSIGNED, p_kwh DECIMAL(12,3), p_kw_contratados DECIMAL(8,2))
RETURNS DECIMAL(12,2)
READS SQL DATA
BEGIN
  DECLARE v_energia DECIMAL(14,4) DEFAULT 0;
  DECLARE v_fijo DECIMAL(10,2) DEFAULT 0;
  DECLARE v_potencia DECIMAL(10,4) DEFAULT 0;
  DECLARE v_imp DECIMAL(5,2) DEFAULT 0;

  SELECT COALESCE(SUM(GREATEST(0, LEAST(p_kwh, COALESCE(kwh_hasta, p_kwh)) - kwh_desde) * precio_kwh), 0)
    INTO v_energia
    FROM tarifa_tramos
   WHERE id_tarifa = p_id_tarifa;

  SELECT cargo_fijo, cargo_potencia_kw, impuesto_pct
    INTO v_fijo, v_potencia, v_imp
    FROM tarifas
   WHERE id_tarifa = p_id_tarifa;

  RETURN ROUND((v_energia + v_fijo + v_potencia * COALESCE(p_kw_contratados, 0)) * (1 + v_imp / 100), 2);
END$$

-- =====================================================================
-- 10. TRIGGERS: kWh de registros_uso = potencia * cantidad * factor * horas / 1000
-- =====================================================================
CREATE TRIGGER trg_registros_uso_bi BEFORE INSERT ON registros_uso
FOR EACH ROW
BEGIN
  DECLARE v_kw DECIMAL(12,6);
  SELECT potencia_w * cantidad * factor_uso / 1000 INTO v_kw
    FROM electrodomesticos WHERE id_electrodomestico = NEW.id_electrodomestico;
  SET NEW.kwh_calculado = ROUND(COALESCE(v_kw, 0) * NEW.horas_uso, 4);
END$$

CREATE TRIGGER trg_registros_uso_bu BEFORE UPDATE ON registros_uso
FOR EACH ROW
BEGIN
  DECLARE v_kw DECIMAL(12,6);
  SELECT potencia_w * cantidad * factor_uso / 1000 INTO v_kw
    FROM electrodomesticos WHERE id_electrodomestico = NEW.id_electrodomestico;
  SET NEW.kwh_calculado = ROUND(COALESCE(v_kw, 0) * NEW.horas_uso, 4);
END$$

DELIMITER ;

-- =====================================================================
-- 11. VISTAS PARA EL PANEL VISUAL
-- =====================================================================
-- Consumo mensual estimado por electrodoméstico
CREATE VIEW v_consumo_por_electrodomestico AS
SELECT e.id_vivienda,
       e.id_electrodomestico,
       e.nombre AS electrodomestico,
       a.nombre AS ambiente,
       e.kwh_mes_estimado,
       ROUND(100 * e.kwh_mes_estimado /
             NULLIF(SUM(e.kwh_mes_estimado) OVER (PARTITION BY e.id_vivienda), 0), 2) AS porcentaje_hogar
  FROM electrodomesticos e
  LEFT JOIN ambientes a ON a.id_ambiente = e.id_ambiente
 WHERE e.activo = 1;

-- Consumo mensual estimado por ambiente
CREATE VIEW v_consumo_por_ambiente AS
SELECT e.id_vivienda,
       COALESCE(a.nombre, 'Sin ambiente') AS ambiente,
       ROUND(SUM(e.kwh_mes_estimado), 3) AS kwh_mes_estimado
  FROM electrodomesticos e
  LEFT JOIN ambientes a ON a.id_ambiente = e.id_ambiente
 WHERE e.activo = 1
 GROUP BY e.id_vivienda, COALESCE(a.nombre, 'Sin ambiente');

-- Comparativa mes a mes con semáforo según presupuesto vigente
CREATE VIEW v_comparativa_mensual AS
SELECT p.id_vivienda,
       p.fecha_inicio,
       p.kwh_acumulado,
       p.monto_proyectado,
       LAG(p.kwh_acumulado) OVER (PARTITION BY p.id_vivienda ORDER BY p.fecha_inicio) AS kwh_mes_anterior,
       ROUND(p.kwh_acumulado - LAG(p.kwh_acumulado) OVER (PARTITION BY p.id_vivienda ORDER BY p.fecha_inicio), 3) AS variacion_kwh,
       pr.monto_mensual AS presupuesto,
       CASE
         WHEN pr.monto_mensual IS NULL THEN NULL
         WHEN p.monto_proyectado >= pr.monto_mensual THEN 'ROJO'
         WHEN p.monto_proyectado >= pr.monto_mensual * 0.8 THEN 'AMARILLO'
         ELSE 'VERDE'
       END AS semaforo
  FROM periodos_consumo p
  LEFT JOIN presupuestos pr
         ON pr.id_vivienda = p.id_vivienda
        AND p.fecha_inicio >= pr.vigente_desde
        AND (pr.vigente_hasta IS NULL OR p.fecha_inicio <= pr.vigente_hasta)
 WHERE p.tipo = 'MENSUAL';

c
-- Tarifas de EJEMPLO (reemplazar con los valores vigentes de la distribuidora real)
INSERT INTO tarifas
 (id_usuario, nombre, distribuidora, region, tipo, cargo_fijo, cargo_potencia_kw, impuesto_pct, moneda, vigente_desde)
VALUES
 (NULL, 'Tarifa social (ejemplo)',      'Distribuidora de ejemplo', 'General', 'SOCIAL',      1.50, 0, 0.00, 'USD', '2026-01-01'),
 (NULL, 'Tarifa residencial (ejemplo)', 'Distribuidora de ejemplo', 'General', 'RESIDENCIAL', 3.00, 0, 12.00, 'USD', '2026-01-01');

INSERT INTO tarifa_tramos (id_tarifa, kwh_desde, kwh_hasta, precio_kwh) VALUES
 (1,   0, 100, 0.0900),
 (1, 100, 300, 0.1100),
 (2,   0, 150, 0.1300),
 (2, 150, 400, 0.1600),
 (2, 400, NULL, 0.1900);

INSERT INTO recomendaciones_plantilla (id_categoria, titulo, descripcion, ahorro_estimado_pct) VALUES
 (1, 'Ajusta el aire acondicionado a 24 °C',
     'Subir el termostato de 2 a 3 °C puede reducir notablemente su consumo. Evita dejarlo encendido en cuartos vacíos.', 15.00),
 (1, 'Reduce las horas de uso del aire acondicionado',
     'Usar un temporizador o apagarlo 1 hora antes de dormir reduce el consumo sin perder confort.', 12.00),
 (2, 'Revisa el sello de la puerta del refrigerador',
     'Un empaque dañado hace que el motor trabaje más. Evita abrir la puerta con frecuencia y no coloques comida caliente.', 8.00),
 (4, 'Cambia tus focos por LED',
     'Un foco LED consume hasta 80 % menos que uno incandescente y dura mucho más.', 80.00),
 (5, 'Desconecta aparatos en espera (stand-by)',
     'Televisores y consolas consumen energía aun apagados. Usa regletas con interruptor.', 10.00),
 (6, 'Lava con carga completa y agua fría',
     'Esperar a llenar la lavadora y usar agua fría reduce el consumo por lavado.', 20.00),
 (8, 'Reduce el tiempo de la ducha eléctrica',
     'Recortar 2 minutos por ducha representa un ahorro importante, ya que es uno de los aparatos de mayor potencia.', 25.00),
 (NULL, 'Aprovecha la luz natural',
     'Abre cortinas durante el día y apaga luces en ambientes desocupados.', 5.00);

-- =====================================================================
-- 13. DATOS DE DEMOSTRACIÓN (opcional: eliminar en producción)
-- =====================================================================
INSERT INTO usuarios (nombre, email, password_hash)
VALUES ('Usuario Demo', 'demo@example.com', '$2b$10$REEMPLAZAR_CON_HASH_REAL');

INSERT INTO viviendas (id_usuario, id_tarifa, nombre, region, num_habitantes, dia_corte)
VALUES (1, 2, 'Casa principal', 'General', 4, 1);

INSERT INTO ambientes (id_vivienda, nombre, tipo) VALUES
 (1, 'Sala', 'SALA'),
 (1, 'Cocina', 'COCINA'),
 (1, 'Dormitorio principal', 'DORMITORIO');

INSERT INTO electrodomesticos
 (id_vivienda, id_ambiente, id_catalogo, nombre, potencia_w, cantidad, horas_uso_dia, dias_uso_mes, factor_uso)
VALUES
 (1, 3, 1,  'Aire acondicionado', 1200, 1, 8.0, 30, 0.60),
 (1, 2, 4,  'Refrigerador',        150, 1, 24.0, 30, 0.35),
 (1, 1, 11, 'Televisor sala',       80, 1, 5.0, 30, 1.00),
 (1, 1, 9,  'Focos LED',             9, 6, 5.0, 30, 1.00);

INSERT INTO presupuestos (id_vivienda, monto_mensual, vigente_desde)
VALUES (1, 40.00, '2026-01-01');

INSERT INTO alertas_config (id_vivienda, tipo, porcentaje_umbral, canal) VALUES
 (1, 'UMBRAL_PROXIMO',  80.00, 'APP'),
 (1, 'UMBRAL_SUPERADO', 100.00, 'APP');

-- Ejemplos de uso de la función y las vistas:
--   SELECT fn_calcular_monto(2, 250, 0);
--   SELECT * FROM v_consumo_por_electrodomestico WHERE id_vivienda = 1;
--   SELECT * FROM v_consumo_por_ambiente WHERE id_vivienda = 1;

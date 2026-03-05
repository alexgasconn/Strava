# Activity Pages - Arquitectura

## Estructura de archivos

La app ahora tiene un sistema de rutas que detecta automáticamente el tipo de actividad y carga la página apropiada:

### HTML Files

- **html/activity-router.html** ⭐ **PUNTO DE ENTRADA PRINCIPAL**
  - Detecta el tipo de actividad (Run, Swim, etc.)
  - Redirige automáticamente a run.html, swim.html o activity.html
  
- **html/run.html**
  - Página especializada para Running
  - Scripts: js/run.js
  - Características: splits por km, pace, elevation, HR zones
  
- **html/swim.html**
  - Página especializada para Swimming  
  - Scripts: js/swim.js
  - Características: strokes breakdown, pace en min/100m, HR zones
  
- **html/activity.html**
  - Página general/fallback
  - Scripts: js/activity.js
  - Para otros tipos de actividades

### JavaScript Files

#### js/swim.js (🆕 Nuevo)

- Especializado para Swimming
- **Características:**
  - ✅ Pace en min/100m (en lugar de min/km)
  - ✅ Strokes breakdown (Freestyle, Backstroke, Breaststroke, Butterfly, Mixed, Drill)
  - ✅ SWOLF score y strokes per meter
  - ✅ Pool length display
  - ✅ HR zones charts
  - ✅ Cadence (stroke rate) en SPM
  - ✅ Distancia en metros y km
  
#### js/run.js (🆕 Nuevo)

- Especializado para Running
- **Características:**
  - ✅ Pace en min/km
  - ✅ Splits por km
  - ✅ Elevation charts
  - ✅ Cadence en spm (stride rate * 2)
  - ✅ HR zones charts
  - ✅ Power data (si disponible)

#### js/activity.js (Original)

- Página general/fallback
- Mantiene todas las características avanzadas

## Cómo funciona el routing

1. Usuario hace click en un link de actividad: `html/activity-router.html?id=123456`
2. El router detecta el tipo de deporte:

   ```javascript
   if (sportType.includes('swim')) → swim.html
   else if (sportType === 'Run' || 'TrailRun') → run.html
   else → activity.html (fallback)
   ```

3. Redirige a la página apropiada manteniendo el `?id` en la URL

## Links actualizados

Todos los links en la app ahora apuntan a `html/activity-router.html?id={id}`:

- athlete.js ✅
- runs.js ✅
- dashboard.js ✅
- wrapped.js ✅

## Métricas personalizadas

### Swimming

- **Pace:** min/100m (no km)
- **Cadence:** Strokes per minute (SPM)
- **SWOLF:** Distance + time (análogo a TSS para nadadores)
- **Strokes:** Breakdown por tipo de nado

### Running

- **Pace:** min/km (standar)
- **Cadence:** Steps per minute (cadencia *2 porque Strava reporta stride)
- **Elevation:** Ganancia de elevación
- **Power:** Watios (si disponible)

## Adaptaciones

### swim.js adaptaciones

- ❌ Sin splits (swimming no tiene splits por km como running)
- ❌ Sin mapa (piscinas no tienen GPS útil)
- ✅ Strokes breakdown
- ✅ Pool length específico
- ✅ SWOLF score
- ✅ HR zones sí (muchos nadadores usan HR training)
- ✅ Smoothing control para HR y cadence

### run.js adaptaciones

- ✅ Splits por km
- ✅ Elevation maps
- ✅ Pace variability
- ✅ Cadence (stride doubled)
- ✅ HR zones
- ✅ Advanced metrics (suffer score, VO2 max)

## Variables de stream soportadas

### Common (ambos)

- distance
- time
- heartrate  
- cadence

### Run-specific

- altitude
- watts

### Swim-specific

- (Normalmente solo HR y cadence disponibles en piscina)

## Smoothing Control

- Available en ambas páginas (run y swim)
- Range: 0-500
- Default: 100
- Aplica rolling mean a stream data

## Próximas mejoras sugeridas

1. Agregar más sports específicos (Bike, Hike, etc.) con sus propias páginas
2. Agregar garmin metrics si disponibles (VO2 max, power, FTP)
3. Mejorar visualización de strokes para piscinas (mostrar tipos de stroke in color)
4. Agregar análisis de eficiencia (strokes/distance ratio trends)
5. Power phase analysis para running si available

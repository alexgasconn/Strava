# 📱 Guía PWA - Strava Dashboard Mobile

## ✅ Ya implementado

### 1. **Manifest.json** (`manifest.json`)

- Define el nombre de la app: "Strava Dashboard"
- Colors: Tema naranja (#FC5200)
- Icono de deporte (montaña + persona corriendo)
- Permite instalar en Android/iOS

### 2. **Icono SVG** (`icon-sport.svg`)

- Icono vectorial de deporte
- Se adapta a cualquier tamaño
- Compatible con Android

### 3. **Service Worker** (`sw.js`)

- Permite usar la app **sin conexión**
- Cachea archivos automáticamente
- Network-first strategy (intenta red, luego cache)

### 4. **index.html actualizado**

- Links a manifest.json
- Meta tags para PWA
- Links a iconos

---

## 🔧 Cómo probar en Android

### **Opción 1: Teléfono real**

1. Abre Chrome/Android browser
2. Navega a tu site: `https://tudominio.com`
3. Arriba a la derecha → **"Instalar aplicación"** o **"Agregar a pantalla de inicio"**
4. Aparecerá el icono en tu pantalla de inicio
5. ¡Listo! Toca el icono para abrir como app

### **Opción 2: Testing local (Vercel)**

Si está en Vercel:

1. Deploy la rama actual (ya tiene los archivos)
2. Copia el link de Vercel
3. Abre en Chrome Mobile
4. Busca el botón de instalación

### **Opción 3: DevTools en PC**

1. Abre Chrome DevTools (F12)
2. Ve a **Application** → **Manifest**
3. Verifica que se cargó correctamente
4. **Lighthouse** tab → Run audit → busca PWA score

---

## 📊 Qué hace funcionar offline

- ✅ Página principal (index.html)
- ✅ CSS
- ✅ Archivos estáticos (icons, assets)
- ❌ Datos de Strava (necesita internet - es normal)
- ❌ Mapas (necesita conexión)

---

## 🎨 Siguiente: Mejoras Mobile (opcional)

Si quieres mejorar más la experience en móvil:

1. **Bottom navigation** (tabs en la bottom, no arriba)
2. **Lazy loading** de gráficos pesados
3. **Touch optimizations** (botones más grandes)
4. **Dark mode** para móvil

---

## 🐛 Debugging

```javascript
// EN LA CONSOLA DEL NAVEGADOR (Chrome DevTools):

// Ver si está registrado el SW:
navigator.serviceWorker.getRegistrations()
  .then(registrations => console.log('SWs registrados:', registrations));

// Limpiar todo el cache:
caches.keys().then(names => 
  names.forEach(name => caches.delete(name))
);

// Ver archivos en cache:
caches.keys().then(names => 
  Promise.all(names.map(name => 
    caches.open(name).then(cache => 
      cache.keys().then(requests => 
        console.log(`Cache ${name}:`, requests)
      )
    )
  ))
);
```

---

## 📝 Archivos nuevos creados

```
/
├── manifest.json          🆕 Metadatos de la PWA
├── icon-sport.svg          🆕 Icono de la app
├── sw.js                   🆕 Service Worker
└── index.html              ✏️ ACTUALIZADO (links PWA)
    └── js/app/main.js      ✏️ ACTUALIZADO (registro SW)
```

---

## Pruébalo ahora

1. Haz `npm run deploy` (o tu comando de deploy)
2. La URL debe estar en **HTTPS** (obligatorio para PWA)
3. Abre en Android y busca "Instalar" o "Agregar a pantalla"

¿Necesitas ayuda con algo específico? 🚀

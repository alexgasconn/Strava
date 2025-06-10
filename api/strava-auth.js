// api/strava-auth.js

// Importamos la librería 'fetch' para hacer llamadas HTTP en Node.js
import fetch from 'node-fetch';

// Esta es la función principal que Vercel ejecutará.
export default async function handler(req, res) {
  // Obtenemos el código temporal que nos envía el frontend desde el cuerpo de la petición
  const { code } = req.body;

  // Obtenemos nuestras credenciales seguras desde las "Variables de Entorno" de Vercel
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!code) {
    return res.status(400).json({ error: 'El código de autorización es requerido' });
  }

  // Preparamos la URL y los datos para pedir el token a Strava
  const tokenUrl = 'https://www.strava.com/oauth/token';
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    grant_type: 'authorization_code',
  });

  try {
    // Hacemos la llamada POST a Strava para intercambiar el código por el token
    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
    });

    // Parseamos la respuesta de Strava
    const data = await response.json();

    if (!response.ok) {
      // Si Strava devuelve un error, se lo pasamos al frontend
      throw new Error(data.message || 'Error al obtener el token de Strava');
    }

    // ¡Éxito! Enviamos la respuesta completa de Strava (que incluye el access_token) al frontend
    res.status(200).json(data);

  } catch (error) {
    // Si algo falla, enviamos un mensaje de error
    console.error('Error en el proxy de autenticación:', error);
    res.status(500).json({ error: error.message });
  }
}
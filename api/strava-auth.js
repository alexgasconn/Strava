// api/strava-auth.js

// Esta es la función principal que Vercel ejecutará.
// Está escrita para ser compatible con el entorno de Node.js de Vercel.
export default async function handler(req, res) {
  
  // Solo permitimos peticiones POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // Obtenemos el código temporal que nos envía el frontend
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
    const stravaResponse = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
    });

    // Parseamos la respuesta de Strava
    const data = await stravaResponse.json();

    if (!stravaResponse.ok) {
      // Si Strava devuelve un error, se lo pasamos al frontend
      console.error('Error de la API de Strava:', data);
      throw new Error(data.message || 'Error al obtener el token de Strava');
    }

    // ¡Éxito! Enviamos la respuesta completa de Strava al frontend
    res.status(200).json(data);

  } catch (error) {
    // Si algo falla, enviamos un mensaje de error
    console.error('Error en el proxy de autenticación:', error);
    res.status(500).json({ error: error.message });
  }
}
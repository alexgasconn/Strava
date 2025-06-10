// api/strava-activities.js

// Esta función obtiene un token de acceso válido, refrescándolo si es necesario.
// (Añadiremos la lógica del refresh token más adelante. Por ahora, solo usa el que tiene)
async function getValidAccessToken(req) {
  // Por ahora, asumimos que el frontend nos envía un token válido.
  // La autenticación ya debería haber ocurrido.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header is missing or invalid');
  }
  return authHeader.split(' ')[1]; // Extrae el token
}

export default async function handler(req, res) {
  try {
    const accessToken = await getValidAccessToken(req);
    
    const activitiesUrl = 'https://www.strava.com/api/v3/athlete/activities';
    let allActivities = [];
    let page = 1;
    const perPage = 100; // Pedimos 100 actividades por página para ser eficientes
    let hasMore = true;

    console.log('Fetching activities from Strava...');

    // Bucle para obtener todas las páginas de actividades
    while (hasMore) {
      const url = `${activitiesUrl}?page=${page}&per_page=${perPage}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Strava API error:', errorData);
        throw new Error(`Error from Strava API: ${errorData.message}`);
      }

      const pageActivities = await response.json();

      if (pageActivities.length > 0) {
        allActivities = allActivities.concat(pageActivities);
        page++;
        console.log(`Fetched page ${page - 1}, ${pageActivities.length} activities. Total so far: ${allActivities.length}`);
      } else {
        hasMore = false; // No hay más actividades, salimos del bucle
      }
    }
    
    console.log(`Finished fetching. Total activities found: ${allActivities.length}`);
    res.status(200).json(allActivities);

  } catch (error) {
    console.error('Error in strava-activities function:', error);
    res.status(500).json({ error: error.message });
  }
}
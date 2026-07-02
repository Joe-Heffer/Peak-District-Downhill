export async function loadLandcoverData(url = `${import.meta.env.BASE_URL}data/terrain/cutgate-landcover.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load landcover data (${response.status})`);
  }
  return response.json();
}

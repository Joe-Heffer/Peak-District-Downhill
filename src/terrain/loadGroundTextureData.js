export async function loadGroundTextureData(
  url = `${import.meta.env.BASE_URL}data/terrain/cutgate-groundtexture.json`,
) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ground texture data (${response.status})`);
  }
  return response.json();
}
